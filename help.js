const commands = [
  ["f", "Show hints for visible links and controls"],
  ["j", "Scroll down"],
  ["k", "Scroll up"],
  ["gg", "Scroll to the top"],
  ["G", "Scroll to the bottom"],
  ["?", "Show keyboard shortcuts"],
];

const styles = `
  dialog {
    box-sizing: border-box;
    width: min(25rem, calc(100% - 2rem));
    max-height: calc(100% - 2rem);
    overflow: auto;
    padding: 1.25rem;
    border: 1px solid var(--vim-nav-border, var(--_border));
    border-radius: .65rem;
    background: var(--vim-nav-surface, var(--_surface));
    color: var(--vim-nav-text, var(--_text));
    box-shadow: 0 .5rem 2rem rgb(0 0 0 / 20%);
    font: 1rem/1.5 system-ui, sans-serif;
    text-align: start;
  }
  dialog::backdrop { background: rgb(0 0 0 / 48%); }
  h2 { margin: 0 0 1rem; font-size: 1.25rem; }
  label { display: flex; align-items: center; gap: .6rem; cursor: pointer; }
  input { width: 1.1rem; height: 1.1rem; margin: 0; accent-color: var(--vim-nav-accent, var(--_accent)); }
  dl { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: .5rem .9rem; }
  dt, dd { margin: 0; }
  kbd {
    padding: .05em .35em; border: 1px solid var(--vim-nav-border, var(--_border));
    border-bottom-width: 2px; border-radius: .25rem; font: 600 .9rem ui-monospace, monospace;
  }
  button {
    font: inherit; padding: .35rem .9rem; border-radius: .3rem;
    color: inherit; background: transparent; border: 1px solid var(--vim-nav-border, var(--_border)); cursor: pointer;
  }
  .actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: .5rem 1rem; }
  a { color: inherit; text-underline-offset: .18em; }
  :focus-visible { outline: 2px solid var(--vim-nav-accent, var(--_accent)); outline-offset: 2px; }
  :host([data-template="minimal"]) dialog { border-radius: 1rem; padding: 1.5rem; }
  :host([data-template="minimal"]) kbd { padding: 0; border: 0; color: var(--vim-nav-accent, var(--_accent)); }
  :host([data-template="minimal"]) button { border-radius: 2rem; }
  :host([data-template="terminal"]) dialog { border-radius: 0; font-family: ui-monospace, monospace; }
  :host([data-template="terminal"]) h2 {
    padding-bottom: .5rem; border-bottom: 2px solid var(--vim-nav-accent, var(--_accent));
  }
  :host([data-template="terminal"]) kbd { padding: 0; border: 0; }
  :host([data-template="terminal"]) button { border-radius: 0; }
  @media (forced-colors: active) {
    dialog, button, kbd { border-color: ButtonText; }
    :focus-visible { outline-color: Highlight; }
  }
`;

export function createShortcutHelp(doc, { enabled, disabledKeys, appearance, onToggle, onClose }) {
  const host = doc.createElement("div");
  host.setAttribute("data-vim-nav-help", "");
  const root = host.attachShadow({ mode: "open" });
  const releaseAppearance = appearance.mount(host, styles, close);

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
  label.append(toggle, "Enable vimWeb");

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
  const projectLink = doc.createElement("a");
  projectLink.href = "https://github.com/mohsenhariri/vimweb";
  projectLink.target = "_blank";
  projectLink.rel = "noopener";
  projectLink.textContent = "VimWeb";
  const actions = doc.createElement("div");
  actions.className = "actions";
  actions.append(done, projectLink);

  // The modal owns keyboard input until it closes, including host-page hotkeys.
  dialog.addEventListener("keydown", event => event.stopPropagation());
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener("close", close);
  dialog.append(title, label, list, actions);
  root.append(dialog);
  let closed = false;

  function open() {
    try {
      doc.body.append(host);
      dialog.showModal();
    } catch (error) {
      close();
      throw error;
    }
  }

  function close() {
    if (closed) return;
    closed = true;
    releaseAppearance();
    // Restoring focus may synchronously open another dialog.
    onClose();
    if (dialog.open) dialog.close();
    host.remove();
  }
  return { open, close, setEnabled(value) { toggle.checked = value; } };
}
