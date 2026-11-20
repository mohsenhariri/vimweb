const commands = [
  ["f", "Show hints for visible links and controls"],
  ["j", "Scroll down"],
  ["k", "Scroll up"],
  ["gg", "Scroll to the top"],
  ["G", "Scroll to the bottom"],
  ["?", "Show keyboard shortcuts"],
];

const styles = `
  :host { color-scheme: var(--vim-nav-color-scheme, light dark); }
  dialog {
    box-sizing: border-box;
    width: min(25rem, calc(100% - 2rem));
    max-height: calc(100% - 2rem);
    overflow: auto;
    padding: 1.25rem;
    border: 1px solid ButtonBorder;
    border-radius: .65rem;
    background: Canvas;
    color: CanvasText;
    font: 1rem/1.5 system-ui, sans-serif;
    text-align: start;
  }
  dialog::backdrop { background: rgb(0 0 0 / 48%); }
  h2 { margin: 0 0 1rem; font-size: 1.25rem; }
  label { display: flex; align-items: center; gap: .6rem; cursor: pointer; }
  input { width: 1.1rem; height: 1.1rem; margin: 0; }
  dl { display: grid; grid-template-columns: max-content 1fr; gap: .45rem .9rem; }
  dt, dd { margin: 0; }
  kbd { font: 600 .9rem ui-monospace, monospace; }
  button {
    font: inherit; padding: .35rem .9rem; border-radius: .3rem;
    color: ButtonText; background: ButtonFace; border: 1px solid ButtonBorder; cursor: pointer;
  }
  :focus-visible { outline: 2px solid Highlight; outline-offset: 2px; }
`;

export function showShortcutHelp(doc, { enabled, disabledKeys, onToggle, onClose }) {
  const host = doc.createElement("div");
  host.setAttribute("data-vim-nav-help", "");
  const root = host.attachShadow({ mode: "open" });
  const sheet = new doc.defaultView.CSSStyleSheet();
  sheet.replaceSync(styles);
  root.adoptedStyleSheets = [sheet];

  const dialog = doc.createElement("dialog");
  const title = doc.createElement("h2");
  title.id = "title";
  title.textContent = "Keyboard shortcuts";
  dialog.setAttribute("aria-labelledby", title.id);

  const toggle = doc.createElement("input");
  toggle.type = "checkbox";
  toggle.checked = enabled;
  toggle.autofocus = true;
  toggle.addEventListener("change", onToggle);
  const label = doc.createElement("label");
  label.append(toggle, "Enable keyboard shortcuts");

  const list = doc.createElement("dl");
  const rows = commands.filter(([key]) => !disabledKeys.includes(key));
  if (!disabledKeys.includes("f")) {
    rows.push(["Esc", "Cancel hints"], ["Backspace", "Edit a hint"]);
  }
  for (const [key, description] of rows) {
    const term = doc.createElement("dt");
    const shortcut = doc.createElement("kbd");
    shortcut.textContent = key;
    term.append(shortcut);
    const action = doc.createElement("dd");
    action.textContent = description;
    list.append(term, action);
  }
  const done = doc.createElement("button");
  done.type = "button";
  done.textContent = "Close";
  done.addEventListener("click", close);
  // The modal owns keyboard input until it closes, including host-page hotkeys.
  dialog.addEventListener("keydown", event => event.stopPropagation());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", close);
  dialog.append(title, label, list, done);
  root.append(dialog);
  doc.body.append(host);
  dialog.showModal();
  // A client-side navigation can replace the containing body while help is open.
  const removal = new doc.defaultView.MutationObserver(() => {
    if (!host.isConnected) close();
  });
  removal.observe(doc.body, { childList: true });
  removal.observe(doc.documentElement, { childList: true });
  let closed = false;

  function close() {
    if (closed) return;
    closed = true;
    removal.disconnect();
    if (dialog.open) dialog.close();
    host.remove();
    onClose();
  }
  return { close, setEnabled(value) { toggle.checked = value; } };
}
