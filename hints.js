const controls = 'a[href],button,input,select,textarea,summary,[role="button" i],[role="link" i]';
const editable = '[contenteditable=""],[contenteditable="true" i],[contenteditable="plaintext-only" i]';
const targets = `${controls},${editable},[tabindex]`;
const ignored = '[hidden],[inert],[data-vim-nav-ignore]';
const unavailable = '[aria-hidden="true" i],[aria-disabled="true" i]';
const clickInputs = new Set(['button', 'checkbox', 'color', 'file', 'image', 'radio', 'reset', 'submit']);

function isTarget(element) {
  if (element.localName === 'summary' && !element.hasAttribute('tabindex')) {
    return element.parentElement?.localName === 'details' &&
      element.parentElement.querySelector(':scope > summary') === element;
  }
  return element.matches(controls) || element.matches(editable) || element.tabIndex >= 0;
}

export function parentOf(element) {
  return element.assignedSlot || element.parentElement || element.getRootNode().host;
}

function ownsPoint(element, x, y, exclude) {
  let hit = element.ownerDocument.elementFromPoint(x, y);
  while (hit?.shadowRoot) {
    const root = hit.shadowRoot;
    const inner = root.elementFromPoint?.(x, y);
    if (inner?.getRootNode() !== root) break;
    hit = inner;
  }
  // An aria-hidden icon can fill its button. The closest actionable ancestor
  // owns that point, even when a component projects the icon through a slot.
  for (let node = hit; node; node = parentOf(node)) {
    if (node.matches(exclude)) return false;
    if (node.matches(targets) && isTarget(node)) return node === element;
  }
  return false;
}

function sampleRects(element, rects, bounds, exclude) {
  for (const rect of rects) {
    const x1 = Math.max(rect.left, bounds.left), x2 = Math.min(rect.right, bounds.right);
    const y1 = Math.max(rect.top, bounds.top), y2 = Math.min(rect.bottom, bounds.bottom);
    if (x2 <= x1 || y2 <= y1) continue;
    const insetX = Math.min(2, (x2 - x1) / 2), insetY = Math.min(2, (y2 - y1) / 2);
    for (const y of [y1 + insetY, (y1 + y2) / 2, y2 - insetY]) {
      for (const x of [x1 + insetX, (x1 + x2) / 2, x2 - insetX]) {
        if (ownsPoint(element, x, y, exclude)) return { x, y };
      }
    }
  }
  return null;
}

function visiblePoint(element, exclude, originalPoint) {
  if (!element.isConnected || !isTarget(element) || element.matches(':disabled,input[type="hidden" i]')) return null;

  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const root = doc.compatMode === 'BackCompat' ? doc.body : doc.documentElement;
  const viewport = { left: 0, top: 0, right: root.clientWidth, bottom: root.clientHeight };
  let rects = element.getClientRects();
  if (!rects.length && view.getComputedStyle(element).display === 'contents') {
    const contents = doc.createRange();
    contents.selectNodeContents(element);
    rects = contents.getClientRects();
  }
  // Long articles may have thousands of offscreen links. Reject these before
  // reading the computed style and clipping box of each ancestor.
  const visibleRects = Array.from(rects).filter(rect =>
    rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.left < viewport.right &&
    rect.bottom > 0 && rect.top < viewport.bottom,
  );
  if (!visibleRects.length) return null;
  const style = view.getComputedStyle(element);
  if (style.visibility !== 'visible') return null;

  let clip;
  for (let node = element; node; node = parentOf(node)) {
    if (node.matches(exclude) || node.matches(unavailable)) return null;
    const css = node === element ? style : view.getComputedStyle(node);
    if (css.opacity === '0' || css.contentVisibility === 'hidden') return null;
    if (originalPoint || node === element || node === doc.documentElement) continue;
    if (css.overflowX === 'visible' && css.overflowY === 'visible') continue;
    clip ??= { ...viewport };
    const bounds = node.getBoundingClientRect();
    if (css.overflowX !== 'visible') {
      clip.left = Math.max(clip.left, bounds.left);
      clip.right = Math.min(clip.right, bounds.right);
    }
    if (css.overflowY !== 'visible') {
      clip.top = Math.max(clip.top, bounds.top);
      clip.bottom = Math.min(clip.bottom, bounds.bottom);
    }
  }

  if (originalPoint) {
    return ownsPoint(element, originalPoint.x, originalPoint.y, exclude) ? originalPoint : null;
  }
  // Fixed and absolutely positioned descendants can escape an overflow ancestor.
  // Hit testing against the viewport also finds those painted outside its box.
  return (clip && sampleRects(element, visibleRects, clip, exclude)) ||
    sampleRects(element, visibleRects, viewport, exclude);
}

function makeLabel(index, alphabet, width) {
  let label = '';
  for (let digit = 0; digit < width; digit++) {
    label = alphabet[index % alphabet.length] + label;
    index = Math.floor(index / alphabet.length);
  }
  return label;
}

function activate(element, point, exclude) {
  const doc = element.ownerDocument;
  element.focus?.({ preventScroll: true });
  if (element.isContentEditable || element.matches('textarea,select') ||
      (element.localName === 'input' && !clickInputs.has(element.type))) return;
  // Focus handlers can synchronously detach, cover or disable a control.
  if (element.ownerDocument !== doc || !visiblePoint(element, exclude, point)) return;
  if (typeof element.click === 'function') element.click();
  else {
    // SVG anchors have native link activation but lack HTMLElement.click().
    const view = element.ownerDocument.defaultView;
    element.dispatchEvent(new view.MouseEvent('click', { bubbles: true, cancelable: true, view }));
  }
}

const overlayCss = `
  :host { all: initial !important; position: fixed !important; inset: 0 !important;
    display: block !important; z-index: 2147483647 !important; pointer-events: none !important;
    font: bold 13px/17px ui-monospace, monospace !important; }
  :host::backdrop { background: transparent; pointer-events: none; }
  span { position: absolute; box-sizing: border-box; padding: 0 3px;
    color: var(--vim-nav-hint-text, var(--_hint-text)); background: var(--vim-nav-hint-bg, var(--_hint-bg));
    border: 1px solid currentColor; border-radius: 3px;
    box-shadow: 0 1px 3px #0008; text-transform: uppercase; white-space: nowrap; }
  span[hidden] { display: none; }
  :host([data-template="minimal"]) span { border-radius: 1em; box-shadow: none; }
  :host([data-template="terminal"]) span { border-radius: 0; box-shadow: 2px 2px currentColor; }
  @media (forced-colors: active) { span { background: Canvas; color: CanvasText; border-color: CanvasText; } }
`;

function placeBadges(items, host) {
  const width = items[0].badge.offsetWidth;
  const height = items[0].badge.offsetHeight;
  const maxLeft = host.clientWidth - width;
  const maxTop = host.clientHeight - height;
  const placed = [];
  for (const { badge, point } of items) {
    // Four placements keep the badge touching its target even on tiny adjacent links.
    let left, top;
    for (const [x, y] of [[point.x, point.y], [point.x, point.y - height],
      [point.x - width, point.y], [point.x - width, point.y - height]]) {
      left = Math.max(0, Math.min(x, maxLeft));
      top = Math.max(0, Math.min(y, maxTop));
      if (!placed.some(box => left < box.left + width && left + width > box.left &&
          top < box.top + height && top + height > box.top)) break;
    }
    placed.push({ left, top });
    badge.style.left = `${left}px`;
    badge.style.top = `${top}px`;
  }
}

/** The controller supplies a normalized alphabet of at least two distinct letters. */
export function startHints(doc, { alphabet, exclude, appearance }, onClose) {
  const skip = exclude ? `${ignored},${exclude}` : ignored;
  const items = [];
  const roots = [doc];
  for (const root of roots) {
    for (const target of root.querySelectorAll(targets)) {
      const point = visiblePoint(target, skip);
      if (point) items.push({ target, point });
    }
    // Append open roots after their light DOM so existing targets keep their order.
    const elements = doc.createTreeWalker(root, doc.defaultView.NodeFilter.SHOW_ELEMENT);
    for (let node = elements.nextNode(); node; node = elements.nextNode()) {
      if (node.shadowRoot) roots.push(node.shadowRoot);
    }
  }
  if (!items.length) return null;

  const host = doc.createElement('div');
  host.setAttribute('data-vim-nav-hints', '');
  host.setAttribute('aria-hidden', 'true');
  const shadow = host.attachShadow({ mode: 'open' });
  const releaseAppearance = appearance.mount(host, overlayCss, close);
  let width = 1;
  while (alphabet.length ** width < items.length) width++;
  for (const [index, item] of items.entries()) {
    item.label = makeLabel(index, alphabet, width);
    item.badge = doc.createElement('span');
    item.badge.setAttribute('data-vim-nav-hint', item.label);
    item.badge.textContent = item.label;
    shadow.append(item.badge);
  }
  doc.body.append(host);
  // A manual popover can paint above host popovers and fullscreen content
  // without moving focus or dismissing an already open menu.
  if (typeof host.showPopover === 'function') {
    host.popover = 'manual';
    host.showPopover();
  }
  placeBadges(items, host);

  const view = doc.defaultView;
  const listeners = new view.AbortController();
  const options = { signal: listeners.signal, capture: true };
  view.addEventListener('resize', close, options);
  view.addEventListener('scroll', close, options);
  // Scroll events inside a shadow tree do not reach the window.
  for (const root of roots) {
    if (root !== doc) root.addEventListener('scroll', close, options);
  }
  view.addEventListener('blur', close, { signal: listeners.signal });
  view.visualViewport?.addEventListener('resize', close, options);
  view.visualViewport?.addEventListener('scroll', close, options);
  doc.addEventListener('pointerdown', close, options);
  doc.addEventListener('focusin', close, options);
  let prefix = '';

  function close() {
    if (listeners.signal.aborted) return;
    listeners.abort();
    releaseAppearance();
    host.remove();
    onClose();
  }

  function handleKey(event) {
    if (listeners.signal.aborted) return false;
    if (!host.isConnected) {
      close();
      return false;
    }
    if (event.ctrlKey || event.altKey || event.metaKey || event.isComposing || event.defaultPrevented) {
      close();
      return false;
    }
    if (event.key === 'Escape') {
      close();
      return true;
    }
    if (event.key === 'Shift') return false;
    if (event.key === 'Backspace') prefix = prefix.slice(0, -1);
    else {
      const key = event.key.toLowerCase();
      if (key.length !== 1 || !alphabet.includes(key)) {
        close();
        return false;
      }
      if (event.repeat) return true;
      prefix += key;
    }

    const matches = items.filter(item => item.label.startsWith(prefix));
    if (!matches.length) close();
    else if (matches[0].label === prefix) {
      const { target, point } = matches[0];
      close();
      if (target.ownerDocument === doc && visiblePoint(target, skip, point)) activate(target, point, skip);
    } else {
      for (const item of items) item.badge.hidden = !item.label.startsWith(prefix);
    }
    return true;
  }

  return { handleKey, close };
}
