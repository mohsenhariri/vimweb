import { expect, test } from '@playwright/test';

const fixture = '/test/fixture.html';
const badge = '[data-vim-nav-hint]';

async function install(page, appearance = {}) {
  await page.goto(fixture);
  await page.evaluate(async appearance => {
    document.body.innerHTML = '<button>Pick</button><button>Next</button><button>Last</button>';
    document.querySelector('button').onclick = () => document.title = 'Picked';
    const { createVimNav } = await import('/index.js');
    window.nav = createVimNav({ alphabet: 'ab', appearance });
  }, appearance);
}

test('updates the open guide and filtered hints without losing focus or the label prefix', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await install(page, { palette: 'ocean', mode: 'dark' });
  await page.evaluate(() => window.nav.showHelp());
  const guide = page.getByRole('dialog');
  const checkbox = guide.getByRole('checkbox');
  await expect(guide).toHaveCSS('background-color', 'rgb(20, 39, 53)');
  await checkbox.focus();
  await page.evaluate(() => window.nav.setAppearance({ template: 'terminal', palette: 'forest' }));
  await expect(guide).toHaveCSS('border-top-left-radius', '0px');
  await expect(guide).toHaveCSS('background-color', 'rgb(28, 42, 32)');
  await expect(checkbox).toBeFocused();
  await page.keyboard.press('Escape');

  await page.keyboard.press('f');
  const first = page.locator(badge).first();
  const label = await first.textContent();
  await page.keyboard.type(label[0]);
  await expect(page.locator(badge + ':visible')).toHaveCount(2);
  await expect(first).toHaveCSS('background-color', 'rgb(161, 229, 165)');
  await page.evaluate(() => window.nav.setAppearance({ mode: 'light', template: 'minimal' }));
  await expect(first).toHaveCSS('background-color', 'rgb(196, 244, 173)');
  await expect(first).toHaveCSS('box-shadow', 'none');
  await page.keyboard.type(label[1]);
  await expect(page).toHaveTitle('Picked');
});

test('auto follows a live body theme and the system on an undeclared page', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await install(page);
  await page.evaluate(() => {
    document.querySelector('style').remove();
    document.body.style.colorScheme = 'dark';
    window.nav.showHints();
  });
  const first = page.locator(badge).first();
  await expect(first).toHaveCSS('background-color', 'rgb(255, 231, 155)');
  await page.evaluate(() => document.body.style.removeProperty('color-scheme'));
  await expect(first).toHaveCSS('background-color', 'rgb(255, 219, 104)');
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(first).toHaveCSS('background-color', 'rgb(255, 231, 155)');
  await page.evaluate(() => document.body.style.setProperty('--vim-nav-color-scheme', 'light'));
  await expect(first).toHaveCSS('background-color', 'rgb(255, 219, 104)');
  await page.evaluate(() => window.nav.showHelp());
  await expect(page.getByRole('dialog')).toHaveCSS('background-color', 'rgb(255, 252, 244)');
});

test('the automatic entry reads live HTML presets and inherited custom colors', async ({ page }) => {
  await page.goto(fixture + '?auto');
  await page.evaluate(() => {
    const root = document.documentElement;
    root.dataset.vimNavMode = 'light';
    root.dataset.vimNavPalette = 'ocean';
    root.dataset.vimNavTemplate = 'minimal';
  });
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  const guide = page.getByRole('dialog');
  await expect(guide).toHaveCSS('background-color', 'rgb(244, 250, 255)');
  await expect(guide.locator('kbd').first()).toHaveCSS('border-top-width', '0px');
  await page.evaluate(() => {
    document.documentElement.dataset.vimNavTemplate = 'classic';
    document.documentElement.style.setProperty('--vim-nav-surface', '#ffeedd');
    document.documentElement.style.setProperty('--vim-nav-hint-bg', '#aabbcc');
  });
  await expect(guide).toHaveCSS('background-color', 'rgb(255, 238, 221)');
  await expect(guide.locator('kbd').first()).toHaveCSS('border-top-width', '1px');
  await guide.getByRole('checkbox').check();
  await page.keyboard.press('Escape');
  await page.keyboard.press('f');
  await expect(page.locator(badge)).toHaveCSS('background-color', 'rgb(170, 187, 204)');
});

test('observes a site adding, updating and removing its color-scheme meta tag', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await install(page);
  await page.evaluate(() => {
    document.querySelector('style').remove();
    window.nav.showHelp();
  });
  const guide = page.getByRole('dialog');
  const light = 'rgb(255, 252, 244)', dark = 'rgb(39, 36, 29)';
  await expect(guide).toHaveCSS('background-color', dark);
  await page.evaluate(() => {
    const meta = document.createElement('meta');
    meta.name = 'color-scheme';
    meta.content = 'light';
    document.head.append(meta);
  });
  await expect(guide).toHaveCSS('background-color', light);
  await page.evaluate(() => document.querySelector('meta[name=color-scheme]').content = 'dark');
  await expect(guide).toHaveCSS('background-color', dark);
  await page.evaluate(() => document.querySelector('meta[name=color-scheme]').content = 'light');
  await expect(guide).toHaveCSS('background-color', light);
  await page.evaluate(() => document.querySelector('meta[name=color-scheme]').remove());
  await expect(guide).toHaveCSS('background-color', dark);
});

test('validates options atomically and lets an app release overrides back to the page', async ({ page }) => {
  await page.goto(fixture);
  const messages = await page.evaluate(async () => {
    const { createVimNav } = await import('/index.js');
    const messages = [];
    try { createVimNav({ appearance: { palette: 'unknown' } }); } catch (e) { messages.push(e.message); }
    document.documentElement.dataset.vimNavMode = 'dark';
    window.nav = createVimNav({ appearance: { mode: 'light' } });
    window.nav.showHelp();
    try { window.nav.setAppearance({ mode: 'dark', template: 'typo' }); } catch (e) { messages.push(e.message); }
    return messages;
  });
  expect(messages).toEqual([expect.stringContaining('palette'), expect.stringContaining('template')]);
  const guide = page.getByRole('dialog');
  await expect(guide).toHaveCSS('background-color', 'rgb(255, 252, 244)');
  await page.evaluate(() => window.nav.setAppearance({ mode: undefined }));
  await expect(guide).toHaveCSS('background-color', 'rgb(39, 36, 29)');
});
