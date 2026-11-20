const presets = {
  template: ['classic', 'minimal', 'terminal'],
  palette: ['amber', 'ocean', 'forest'],
  mode: ['auto', 'light', 'dark'],
};

// Private defaults live on the host. Public --vim-nav-* properties can inherit
// from the page, across the shadow boundary, even when the hints reset 'all'.
const colors = `
  :host {
    color-scheme: var(--vim-nav-color-scheme, light dark) !important;
    --_surface: light-dark(#fffcf4, #27241d);
    --_text: light-dark(#30271b, #fcf3df);
    --_accent: light-dark(#865400, #ffca69);
    --_border: light-dark(#8d795b, #aa9577);
    --_hint-bg: light-dark(#ffdb68, #ffe79b);
    --_hint-text: #302100;
  }
  :host([data-scheme="page"]) { color-scheme: var(--vim-nav-color-scheme, inherit) !important; }
  :host([data-scheme="dark"]) { color-scheme: dark !important; }
  :host([data-scheme="light"]) { color-scheme: light !important; }
  :host([data-palette="ocean"]) {
    --_surface: light-dark(#f4faff, #142735);
    --_text: light-dark(#142f41, #e6f5ff);
    --_accent: light-dark(#006082, #7ad6ff);
    --_border: light-dark(#5a7d90, #799caf);
    --_hint-bg: light-dark(#b5eaff, #80d9ff);
    --_hint-text: #092f44;
  }
  :host([data-palette="forest"]) {
    --_surface: light-dark(#f6fbf3, #1c2a20);
    --_text: light-dark(#203c2a, #ebf5e6);
    --_accent: light-dark(#25633c, #a4e4aa);
    --_border: light-dark(#697f6b, #91aa91);
    --_hint-bg: light-dark(#c4f4ad, #a1e5a5);
    --_hint-text: #16351e;
  }
`;

function validate(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('appearance must be an object');
  }
  for (const [key, value] of Object.entries(options)) {
    if (!Object.hasOwn(presets, key)) throw new TypeError(`Unknown appearance option: ${key}`);
    if (value !== undefined && !presets[key].includes(value)) {
      throw new TypeError(`appearance.${key} must be one of ${presets[key].join(', ')}`);
    }
  }
}

export function createAppearance(doc, initial = {}) {
  validate(initial);
  const options = { ...initial };
  const sheets = new Map();
  let refresh;

  function choice(key) {
    const attribute = doc.documentElement.getAttribute(`data-vim-nav-${key}`);
    const values = presets[key];
    return options[key] ?? (values.includes(attribute) ? attribute : values[0]);
  }

  return {
    set(patch) {
      validate(patch);
      Object.assign(options, patch);
      refresh?.();
    },
    mount(host, styles, onRemove) {
      const view = doc.defaultView;
      let sheet = sheets.get(styles);
      if (!sheet) {
        sheet = new view.CSSStyleSheet();
        sheet.replaceSync(styles + colors);
        sheets.set(styles, sheet);
      }
      host.shadowRoot.adoptedStyleSheets = [sheet];

      function update() {
        // An application may change settings while replacing its document body.
        if (!doc.body) return;
        host.dataset.template = choice('template');
        host.dataset.palette = choice('palette');
        const mode = choice('mode');
        // Inherit the site's native color-scheme, including meta declarations.
        // Pages without a scheme still get the visitor's system preference.
        const pageScheme = mode === 'auto' && (
          view.getComputedStyle(doc.body).colorScheme !== 'normal' ||
          doc.head?.querySelector('meta[name="color-scheme" i][content]')
        );
        host.dataset.scheme = pageScheme ? 'page' : mode;
      }
      update();
      refresh = update;
      // Client-side navigation can replace the body or remove an overlay directly.
      const observer = new view.MutationObserver(changes => {
        if (!doc.body || host.parentNode !== doc.body) onRemove();
        else if (changes.some(change => change.type === 'attributes' || doc.head?.contains(change.target))) update();
      });
      observer.observe(doc, { childList: true });
      observer.observe(doc.documentElement, { attributes: true, childList: true });
      observer.observe(doc.body, { attributes: true, childList: true });
      if (doc.head) {
        observer.observe(doc.head, { childList: true, subtree: true, characterData: true, attributeFilter: ['content', 'name', 'media'] });
      }
      return () => {
        observer.disconnect();
        refresh = undefined;
      };
    },
  };
}
