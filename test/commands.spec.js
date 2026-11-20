import { expect, test } from '@playwright/test';

const hint = '[data-vim-nav-hint]';

async function install(page, markup, options = {}) {
  await page.goto('/test/fixture.html');
  await page.evaluate(async ({ markup, options }) => {
    document.body.innerHTML = markup;
    const { createVimNav } = await import('/index.js');
    window.nav = createVimNav(options);
  }, { markup, options });
}

test('a launcher opens a single hint session without synthesizing a keypress', async ({ page }) => {
  await install(page, '<button>Show hints</button><button>First</button><button>Second</button>', { alphabet: 'ab' });
  await page.evaluate(() => {
    const [launcher, first] = document.querySelectorAll('button');
    launcher.addEventListener('click', window.nav.showHints);
    first.addEventListener('click', () => document.title = 'Picked');
    window.keys = [];
    document.addEventListener('keydown', event => window.keys.push(event.key));
  });
  await page.getByRole('button', { name: 'Show hints' }).click();
  await expect(page.locator(hint)).toHaveCount(3);
  expect(await page.evaluate(() => window.keys)).toEqual([]);
  const label = await page.locator(hint).nth(1).textContent();
  await page.keyboard.type(label[0]);
  await page.evaluate(() => window.nav.showHints());
  await expect(page.locator('[data-vim-nav-hints]')).toHaveCount(1);
  await expect(page.locator(`${hint}:visible`)).toHaveCount(2);
  await page.keyboard.type(label[1]);
  await expect(page).toHaveTitle('Picked');
  await expect(page.locator(hint)).toHaveCount(0);
});

test('programmatic hints respect disabled navigation, help, editable focus, modals and teardown', async ({ page }) => {
  await install(page, '<button>Action</button><textarea></textarea><dialog><button>Inside</button></dialog>', { enabled: false });
  const hints = page.locator(hint);
  const show = () => page.evaluate(() => window.nav.showHints());
  await show();
  await expect(hints).toHaveCount(0);
  await page.evaluate(() => { window.nav.enable(); window.nav.showHelp(); });
  await show();
  await expect(hints).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.getByRole('textbox').focus();
  await show();
  await expect(hints).toHaveCount(0);
  await page.evaluate(() => document.querySelector('dialog').showModal());
  await show();
  await expect(hints).toHaveCount(0);
  await page.evaluate(() => document.querySelector('dialog').close());
  await page.getByRole('button', { name: 'Action' }).focus();
  await show();
  await expect(hints).toHaveCount(2);
  await page.evaluate(() => window.nav.destroy());
  await show();
  await expect(hints).toHaveCount(0);
});

test('reserving f also disables the programmatic hints command', async ({ page }) => {
  await install(page, '<button>Action</button>', { disabledKeys: ['f'] });
  await page.evaluate(() => window.nav.showHints());
  await expect(page.locator(hint)).toHaveCount(0);
});
