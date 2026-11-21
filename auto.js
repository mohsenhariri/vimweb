import { createVimNav } from "./index.js";

const preference = "vim-nav:enabled";

// Sandboxed documents and private browsing can deny storage access.
// The toggle still applies to the current page in that case.
function isStorageError(error) {
  return error?.name === "SecurityError" || error?.name === "QuotaExceededError";
}

function mount(doc) {
  const win = doc.defaultView;
  const defaultEnabled = doc.documentElement.getAttribute("data-vim-nav-default-enabled") === "true";
  function readEnabled() {
    try {
      const saved = win.localStorage.getItem(preference);
      return saved === null ? defaultEnabled : saved === "true";
    } catch (error) {
      if (!isStorageError(error)) throw error;
    }
  }
  let syncing = false;
  const navigation = createVimNav({
    document: doc,
    enabled: readEnabled() ?? defaultEnabled,
    onEnabledChange(value) {
      if (syncing) return;
      try {
        win.localStorage.setItem(preference, String(value));
      } catch (error) {
        if (!isStorageError(error)) throw error;
      }
    },
  });
  function syncPreference() {
    const value = readEnabled();
    if (value === undefined || value === navigation.enabled) return;
    syncing = true;
    try {
      if (value) navigation.enable();
      else navigation.disable();
    } finally {
      syncing = false;
    }
  }
  win.addEventListener("storage", (event) => {
    if (event.key === preference || event.key === null) syncPreference();
  });
  win.addEventListener("pageshow", (event) => {
    if (event.persisted) syncPreference();
  });

  let launchers = [...doc.querySelectorAll("button[data-vim-nav-launcher]")];
  if (!launchers.length) {
    const button = doc.createElement("button");
    button.type = "button";
    button.dataset.vimNavLauncher = "";
    button.textContent = "Keyboard shortcuts";
    doc.body.append(button);
    launchers = [button];
  }
  for (const button of launchers) {
    button.addEventListener("click", (event) => {
      event.preventDefault(); // A host-provided button can be inside a form.
      button.focus({ preventScroll: true });
      navigation.showHelp();
    });
    button.setAttribute("aria-haspopup", "dialog");
    button.hidden = false;
  }
}

if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(document), { once: true });
  } else {
    mount(document);
  }
}
