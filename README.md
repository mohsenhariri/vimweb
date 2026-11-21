# Vimweb

Add Vim-style keyboard navigation to a website. Press `f` to label visible links and controls, then type a label to follow a link, press a button, or focus a field. Vimweb runs entirely in the browser and has zero runtime dependencies.

- [Homepage](https://mohsenhariri.github.io/vimweb/)
- [Documentation](https://mohsenhariri.github.io/vimweb/docs/)
- [Demo](https://mohsenhariri.github.io/vimweb/demo/)
- [npm package](https://www.npmjs.com/package/@mhariri/vimweb)
- [Live example on Mohsen Hariri’s website](https://mohsenhariri.github.io/)

## Add it to a website

```sh
npm install @mhariri/vimweb
```

Import the automatic entry once in your browser bundle.

```js
import "@mhariri/vimweb/auto";
```

Visitors get a **Keyboard shortcuts** button at the end of the page. It opens a guide with an **Enable keyboard shortcuts** checkbox. Shortcuts start off, and the site remembers each visitor’s choice in local storage when available.

To put the button in your own menu or footer, include this markup. The script reveals it when ready.

```html
<button type="button" data-vim-nav-launcher hidden>Keyboard shortcuts</button>
```

### Plain HTML

Copy the installed JavaScript modules and license into a directory your site serves.

```sh
mkdir -p assets/vimweb
cp node_modules/@mhariri/vimweb/*.js node_modules/@mhariri/vimweb/LICENSE assets/vimweb/
```

Load the entry point from a page, adjusting the URL to your site's base path. Its imports resolve relative to the module.

```html
<script type="module" src="/assets/vimweb/auto.js"></script>
```

To try the example directly from this repository, run `npm run demo` in the package directory and open `http://127.0.0.1:8000/`. The demo runs with Node alone.

## Templates, palettes, and dark mode

Choose a template for the shape and typography of the shortcut guide and hint labels, then choose their colors independently. The automatic entry reads these attributes from the page.

```html
<html lang="en" data-vim-nav-template="terminal" data-vim-nav-palette="forest">
```

| Setting | Choices | Default |
| --- | --- | --- |
| `data-vim-nav-template` | `classic` (raised keycaps), `minimal` (flat keys and rounded hints), `terminal` (monospace guide and square hints) | `classic` |
| `data-vim-nav-palette` | `amber`, `ocean`, `forest` | `amber` |
| `data-vim-nav-mode` | `auto`, `light`, `dark` | `auto` |

**If your site has a theme switch**, leave Vimweb in `auto` mode. It follows the page's CSS `color-scheme` on `html` or `body`, or a `<meta name="color-scheme">` declaration. Without a declared scheme, it follows the visitor's system preference. For a site that switches classes, the same selector can set the scheme for native controls and Vimweb together.

```css
:root { color-scheme: light dark; }
:root[data-theme="light"] { color-scheme: light; }
:root[data-theme="dark"]  { color-scheme: dark; }
```

To set just Vimweb's scheme from your site's CSS, use `--vim-nav-color-scheme: dark` or `light`. For brand colors, set any of `--vim-nav-surface`, `--vim-nav-text`, `--vim-nav-border`, `--vim-nav-accent`, `--vim-nav-hint-bg`, or `--vim-nav-hint-text` on `html` or `body`. Pair foreground and background overrides to keep labels readable. The launcher is a regular button you can style with `button[data-vim-nav-launcher]`.

```css
:root {
  --vim-nav-hint-bg: light-dark(#18304e, #cfe7ff);
  --vim-nav-hint-text: light-dark(white, #102439);
}
```

Application integrations can also set appearance in JavaScript. Each supplied option takes precedence over its HTML attribute. `setAppearance()` updates the specified fields in place, including an open guide or a partially typed hint. Pass `undefined` for a field to return control to the HTML setting or default.

```js
import { createVimNav } from "@mhariri/vimweb";

const nav = createVimNav({ appearance: { template: "minimal", palette: "ocean" } });
nav.setAppearance({ mode: "dark" });
nav.setAppearance({ mode: undefined }); // Follow the page again.
```

## Keyboard commands

| Key | Action |
| --- | --- |
| `f` | Label the visible controls. Type a full label to activate its target. |
| `Backspace`, `Esc` | Edit the label or cancel hints. |
| `j`, `k` | Scroll down or up. |
| `gg`, `G` | Scroll to the top or bottom. Type the two lowercase letters within 750 ms. |
| `?` | Open the guide and shortcut settings. |

Scroll commands apply to the focused scrollable region, or to the page. They respect the visitor’s reduced-motion preference. Browsers handle link targets and downloads normally. A hint on a text field or select moves focus there so the visitor can use the native control.

## Integrate with an application

Use the core entry when your application owns the settings UI or the page lifecycle. Importing this entry has no side effects. Call it in the browser after the document body exists.

```js
import { createVimNav } from "@mhariri/vimweb";

const navigation = createVimNav({
  enabled: false,
  disabledKeys: ["?"],      // The app uses ? for its own help.
  exclude: ".code-editor",
});

const button = document.querySelector("#keyboard-settings");
button.addEventListener("click", navigation.showHelp);

// When unmounting this integration:
// button.removeEventListener("click", navigation.showHelp);
// navigation.destroy();
```

| Option | Meaning |
| --- | --- |
| `enabled` | Initial state. Defaults to `true` for an explicitly created controller. |
| `appearance` | Optional `template`, `palette`, and `mode` settings, described above. |
| `alphabet` | Characters for hint labels. Supply at least two unique lowercase ASCII letters. Defaults to `asdfghjklqwertyuiopzxcvbnm`. |
| `disabledKeys` | Commands the page reserves. Accepts any of `f`, `j`, `k`, `gg`, `G`, and `?`. |
| `exclude` | CSS selector for subtrees to skip. You can also mark an element with `data-vim-nav-ignore`. |
| `document` | Document to install into. Defaults to the current document. |
| `onEnabledChange` | Callback receiving the new boolean when the visitor or application changes the setting. Use this to save your own preference. |

The controller provides `enable()`, `disable()`, a read-only `enabled` property, `showHints()`, `showHelp()`, `setAppearance()`, and `destroy()`. Use `showHints()` for a toolbar or command palette. It respects disabled shortcuts and focus inside editors and dialogs. The help button works even when shortcuts are off. Use one installation per document. Call `destroy()` to release listeners and overlays before installing a new controller. TypeScript declarations are included.

### Keyboard ownership

Vimweb yields to text entry, composition, modifier shortcuts, dialogs, and focused interactive widgets such as comboboxes. A component can claim a key by calling `event.preventDefault()` before it bubbles to the document. Use `disabledKeys` for shortcuts your app handles globally. The package binds no search shortcut.

Hints cover controls in the document, inside open shadow roots, and in slots. For a component with a closed shadow root, expose its action on a focusable host. A same-origin frame can have its own controller via the `document` option. Browser chrome and cross-origin frame contents are outside the page's reach. Visitors who already use a browser extension for Vim navigation can leave the site's shortcuts off.

Help uses a native modal dialog and returns keyboard focus on dismissal. The package targets modern versions of Chromium, Firefox and Safari.

## Development and release

Run `npm run website` to preview the homepage at `http://127.0.0.1:8000/` and the documentation at `http://127.0.0.1:8000/docs/`. To choose another port, run `npm run website -- 8010`. Both commands work from the package directory with Node.js 24 and npm.

`npm run build:website` creates a static `dist/` directory from `website/`, the browser modules and a fresh npm archive. Serve that directory at the domain root or a project subpath. In the standalone GitHub repository, select **Settings → Pages → Source → GitHub Actions**. The Pages workflow publishes the homepage on pushes to `main` and on manual runs.

Use Node.js 24 for development. From the package directory:

```sh
npm ci
npx playwright install --with-deps chromium firefox webkit
npm test
npm pack --dry-run
```

`npm pack` produces a tarball that another project can install with `npm install /path/to/package.tgz`. The published files include the browser modules, TypeScript declarations, README and license. The demo, tests and repository workflow stay in the source repository.

Inspired by [Vimium](https://github.com/philc/vimium) and [VimCode](https://github.com/mohsenhariri/vimcode). Released under the [MIT license](./LICENSE).
