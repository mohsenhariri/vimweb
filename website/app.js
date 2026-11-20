import { createVimNav } from './lib/index.js';
import { drawKeyStudy } from './key-study.js';

const tryButton = document.querySelector('[data-try]');
const settings = document.querySelector('[data-settings]');
const status = document.getElementById('try-status');
const navigation = createVimNav({
  enabled: false,
  onEnabledChange(enabled) {
    tryButton.querySelector('span').textContent = enabled ? 'Show hints' : 'Try the hints';
    status.textContent = enabled ? 'Shortcuts on. Press f for hints or ? for help.' : 'Shortcuts off.';
  },
});
tryButton.addEventListener('click', () => {
  navigation.enable();
  tryButton.focus({ preventScroll: true });
  // Let touch and pointer users invoke the same command as a physical f key.
  tryButton.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, cancelable: true }));
});
settings.addEventListener('click', () => {
  settings.focus({ preventScroll: true });
  navigation.showHelp();
});
tryButton.hidden = false;
settings.hidden = false;

const canvas = document.getElementById('key-study');
const studies = {
  f: ['f', 'Show hints'],
  j: ['j / k', 'Scroll the page'],
  g: ['gg / G', 'Jump to either end'],
};
const selector = document.querySelector('.study-select');
const studyButtons = selector.querySelectorAll('button');
let selected = 'f';
function draw() {
  drawKeyStudy(canvas, selected);
}
const canDraw = Boolean(canvas.getContext('2d'));
if (canDraw) {
  canvas.hidden = false;
  draw();
  document.getElementById('key-print').hidden = true;
  new ResizeObserver(draw).observe(canvas);
}
for (const button of studyButtons) {
  button.addEventListener('click', () => {
    selected = button.dataset.study;
    const [keys, caption] = studies[selected];
    canvas.setAttribute('aria-label', `The ${selected.toUpperCase()} key lifted above its mechanical switch.`);
    document.getElementById('study-keys').textContent = keys;
    document.getElementById('study-caption').textContent = caption;
    for (const item of studyButtons) item.setAttribute('aria-pressed', String(item === button));
    draw();
  });
}
selector.hidden = !canDraw;

const methods = document.querySelector('.install-tabs');
const tabs = [...methods.querySelectorAll('[role="tab"]')];
function selectMethod(selectedTab) {
  for (const tab of tabs) {
    const active = tab === selectedTab;
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    tab.setAttribute('aria-selected', String(active));
    tab.tabIndex = active ? 0 : -1;
    panel.hidden = !active;
  }
}
for (const tab of tabs) {
  const panel = document.getElementById(tab.getAttribute('aria-controls'));
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', tab.id);
  panel.querySelector('.fallback-title').hidden = true;
  tab.addEventListener('click', () => selectMethod(tab));
  tab.addEventListener('keydown', event => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const index = tabs.indexOf(tab);
    const keys = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 };
    if (!Object.hasOwn(keys, event.key)) return;
    event.preventDefault();
    const next = tabs[keys[event.key]];
    selectMethod(next);
    next.focus();
  });
}
selectMethod(tabs[0]);
methods.hidden = false;

for (const button of document.querySelectorAll('[data-copy]')) {
  if (!navigator.clipboard?.writeText) continue;
  let timer;
  button.hidden = false;
  button.addEventListener('click', async () => {
    const code = button.parentElement.querySelector('code');
    const notice = document.getElementById('copy-status');
    try {
      await navigator.clipboard.writeText(code.textContent);
      button.textContent = 'Copied';
      notice.textContent = 'Code copied to clipboard.';
    } catch {
      const range = document.createRange();
      range.selectNodeContents(code);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      button.textContent = 'Selected';
      notice.textContent = 'Code selected. Use your usual copy command.';
    }
    clearTimeout(timer);
    timer = setTimeout(() => { button.textContent = 'Copy'; notice.textContent = ''; }, 2200);
  });
}
