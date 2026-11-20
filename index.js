import { createAppearance } from './appearance.js';
import { createShortcutHelp } from './help.js';
import { parentOf, startHints } from './hints.js';

const installations = new WeakSet();
const commands = ['f', 'j', 'k', 'gg', 'G', '?'];
const guardedRoles = [
  'alertdialog', 'application', 'checkbox', 'combobox', 'dialog', 'grid', 'gridcell',
  'listbox', 'menu', 'menubar', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'option', 'radio', 'radiogroup', 'scrollbar', 'searchbox', 'slider', 'spinbutton',
  'switch', 'tab', 'tablist', 'textbox', 'toolbar', 'tree', 'treegrid', 'treeitem',
];
const guardedSelector = [
  'input', 'textarea', 'select', 'dialog', 'iframe', 'embed', 'object',
  'audio[controls]', 'video[controls]', '[inert]', '[data-vim-nav-ignore]',
  ...guardedRoles.map(role => `[role~="${role}"]`),
].join(',');

function activeElement(doc) {
  let element = doc.activeElement;
  while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
  return element;
}

function hasGuardedFocus(event, doc, selector) {
  const guarded = element => element.isContentEditable || element.matches(selector);
  if (doc.designMode === 'on' || event?.composedPath().some(node => node.nodeType === 1 && guarded(node))) {
    return true;
  }
  // A host can dispatch document-level keys while focus remains inside a widget.
  for (let element = activeElement(doc); element; element = parentOf(element)) {
    if (guarded(element)) return true;
  }
  if (doc.querySelector('dialog:modal')) return true;
  return [...doc.querySelectorAll('[aria-modal="true"]')].some(modal => {
    if (modal.closest('[hidden],[inert],[aria-hidden="true"]') ||
        !modal.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return false;
    const rect = modal.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0 && rect.bottom > 0 && rect.right > 0 &&
      rect.top < doc.defaultView.innerHeight && rect.left < doc.defaultView.innerWidth;
  });
}

function scrollPage(doc, event, command) {
  const view = doc.defaultView;
  const root = doc.scrollingElement;
  if (!root) return;
  let scroller = root;
  const origin = event.composedPath().find(node => node.nodeType === 1) || activeElement(doc);
  for (let element = origin; element && element !== root; element = parentOf(element)) {
    if (element.scrollHeight > element.clientHeight &&
        /^(auto|scroll|overlay)$/.test(view.getComputedStyle(element).overflowY)) {
      scroller = element;
      break;
    }
  }
  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const behavior = reducedMotion || event.repeat ? 'instant' : 'smooth';
  if (command === 'gg' || command === 'G') {
    scroller.scrollTo({ top: command === 'gg' ? 0 : scroller.scrollHeight, behavior });
  } else {
    scroller.scrollBy({ top: command === 'j' ? 80 : -80, behavior });
  }
}

/** Install one controller per document. Call destroy() before installing another. */
export function createVimNav(options = {}) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Expected a Vim navigation options object');
  }
  const {
    document: doc = globalThis.document,
    enabled: initiallyEnabled = true,
    alphabet = 'asdfghjklqwertyuiopzxcvbnm',
    exclude,
    onEnabledChange,
    disabledKeys = [],
  } = options;
  if (doc?.nodeType !== 9 || !doc.defaultView) throw new TypeError('Expected a browser document');
  if (typeof initiallyEnabled !== 'boolean') throw new TypeError('enabled must be a boolean');
  if (typeof alphabet !== 'string' || !/^[a-z]{2,}$/.test(alphabet) || new Set(alphabet).size !== alphabet.length) {
    throw new TypeError('alphabet must contain at least two distinct lowercase ASCII letters without duplicates');
  }
  if (onEnabledChange !== undefined && typeof onEnabledChange !== 'function') {
    throw new TypeError('onEnabledChange must be a function');
  }
  if (!Array.isArray(disabledKeys) || !disabledKeys.every(key => commands.includes(key))) {
    throw new TypeError(`disabledKeys must be an array of supported commands (${commands.join(', ')})`);
  }
  if (exclude !== undefined) {
    if (typeof exclude !== 'string') throw new TypeError('exclude must be a CSS selector');
    doc.querySelector(exclude); // Reject malformed selectors before registering any listeners.
  }
  if (installations.has(doc)) throw new Error('Vim navigation is already installed on this document');

  const appearance = createAppearance(doc, options.appearance);
  const view = doc.defaultView;
  const listeners = new view.AbortController();
  const signal = listeners.signal;
  const disabled = new Set(disabledKeys);
  const selector = exclude ? `${guardedSelector},${exclude}` : guardedSelector;
  let enabled = initiallyEnabled;
  let hints = null;
  let help = null;
  let prefixTimer;

  function clearPrefix() {
    view.clearTimeout(prefixTimer);
    prefixTimer = undefined;
  }

  function cancelPending() {
    clearPrefix();
    hints?.close();
  }

  function setEnabled(value) {
    if (signal.aborted || enabled === value) return;
    enabled = value;
    cancelPending();
    help?.setEnabled(enabled);
    onEnabledChange?.(enabled);
  }

  function openHints() {
    hints = startHints(doc, { alphabet, exclude, appearance }, () => { hints = null; });
  }

  function showHelp() {
    if (signal.aborted || help || !doc.body) return;
    cancelPending();
    help = createShortcutHelp(doc, {
      enabled,
      appearance,
      disabledKeys: [...disabled],
      onToggle() {
        setEnabled(!enabled);
        return enabled;
      },
      onClose() { help = null; },
    });
    // Native dialog autofocus can synchronously call back into this controller.
    help.open();
  }

  function onKeyDown(event) {
    if (!enabled || help) return;
    const { key } = event;
    const pendingG = prefixTimer !== undefined;
    clearPrefix();
    if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
        event.ctrlKey || event.metaKey || event.altKey || event.getModifierState('AltGraph')) {
      hints?.close();
      return;
    }
    const command = key === 'g' ? 'gg' : key;
    if (!hints && (!commands.includes(command) || disabled.has(command))) return;
    if (hasGuardedFocus(event, doc, selector)) {
      hints?.close();
      return;
    }
    if (hints) {
      if (hints.handleKey(event)) event.preventDefault();
      return;
    }
    if (event.repeat && key !== 'j' && key !== 'k') return;
    if (event.shiftKey && key !== 'G' && key !== '?') return;
    if (key === 'g' && !pendingG) {
      prefixTimer = view.setTimeout(clearPrefix, 750);
    } else if (key === 'f') {
      openHints();
    } else if (key === '?') {
      showHelp();
    } else {
      scrollPage(doc, event, command);
    }
    event.preventDefault();
  }

  doc.addEventListener('keydown', onKeyDown, { signal });
  for (const type of ['focusin', 'focusout', 'pointerdown', 'compositionstart', 'visibilitychange']) {
    doc.addEventListener(type, cancelPending, { capture: true, signal });
  }
  view.addEventListener('blur', cancelPending, { signal });
  view.addEventListener('pagehide', cancelPending, { signal });
  installations.add(doc);

  return {
    get enabled() { return enabled; },
    enable() { setEnabled(true); },
    disable() { setEnabled(false); },
    setAppearance(patch) { if (!signal.aborted) appearance.set(patch); },
    showHints() {
      if (!enabled || help || hints || disabled.has('f') || hasGuardedFocus(null, doc, selector)) return;
      clearPrefix();
      openHints();
    },
    showHelp,
    destroy() {
      if (signal.aborted) return;
      listeners.abort();
      enabled = false;
      cancelPending();
      help?.close();
      installations.delete(doc);
    },
  };
}
