import { expect, test } from '@playwright/test';

const fixture = '/test/fixture.html';
const hint = '[data-vim-nav-hint]';
const dialog = page => page.getByRole('dialog', { name: 'Keyboard shortcuts' });

async function install(page, markup, options = {}) {
  await page.goto(fixture);
  await page.evaluate(async ({ markup, options }) => {
    document.body.innerHTML = markup;
    const { createVimNav } = await import('/index.js');
    window.changes = [];
    window.nav = createVimNav({
      ...options,
      onEnabledChange: enabled => window.changes.push(enabled),
    });
  }, { markup, options });
}

async function showHints(page, count) {
  await page.keyboard.press('f');
  const hints = page.locator(hint);
  await expect(hints).toHaveCount(count);
  return hints;
}

test('the demo starts enabled and lets visitors turn off shortcuts from its visible badge', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 480 });
  const artwork = page.waitForResponse('**/badge.webp');
  await page.goto('/');
  expect((await artwork).ok()).toBe(true);
  const badge = page.getByRole('button', { name: 'Try Vim in this website.', exact: true });
  await expect(badge).toBeInViewport();
  await page.keyboard.press('f');
  const hints = page.locator(hint);
  await expect(hints.first()).toBeVisible();
  await page.keyboard.press('Escape');

  const toggle = dialog(page).getByRole('checkbox', { name: 'Enable vimWeb', exact: true });
  await badge.click();
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await page.reload();
  await expect(badge).toBeInViewport();
  await page.keyboard.press('f');
  await expect(hints).toHaveCount(0);
  await badge.click();
  await expect(toggle).not.toBeChecked();

  await page.evaluate(() => {
    localStorage.removeItem('vim-nav:enabled');
    window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true }));
  });
  await expect(toggle).toBeChecked();
});

test('offers distinct typeable hints and activates the selected control once', async ({ page }) => {
  const buttons = Array.from({ length: 7 }, (_, n) => `<button>Item ${n}</button>`).join('');
  await install(page, buttons, { alphabet: 'ab' });
  await page.evaluate(() => {
    window.activations = [];
    document.addEventListener('click', e => window.activations.push(e.target.textContent));
  });
  const hints = await showHints(page, 7);
  const labels = (await hints.allTextContents()).map(text => text.trim().toLowerCase());
  expect(labels.every(label => /^[ab]+$/.test(label))).toBe(true);
  expect(new Set(labels).size).toBe(labels.length);
  for (const label of labels) {
    expect(labels.some(other => other !== label && other.startsWith(label))).toBe(false);
  }
  const code = labels.find(label => label.length > 1);
  await page.keyboard.type(code[0]);
  await expect(page.locator(`${hint}:visible`)).toHaveCount(labels.filter(label => label.startsWith(code[0])).length);
  await page.keyboard.press('Backspace');
  await expect(page.locator(`${hint}:visible`)).toHaveCount(labels.length);
  await page.keyboard.type(code.slice(0, -1));
  expect(await page.evaluate(() => window.activations)).toEqual([]);
  await page.keyboard.type(code.slice(-1));
  await expect(hints).toHaveCount(0);
  expect(await page.evaluate(() => window.activations)).toEqual([expect.stringMatching(/^Item \d$/)]);
});

test('skips unusable, excluded, occluded and offscreen targets', async ({ page }) => {
  await install(page, `
    <button>Visible</button>
    <button hidden>Hidden</button>
    <button disabled>Disabled</button>
    <div inert><button>Inert</button></div>
    <div data-vim-nav-ignore><button>Ignored</button></div>
    <div class="app-control"><button>App control</button></div>
    <button style="opacity:0">Transparent</button>
    <div style="position:relative;width:100px;height:40px">
      <button>Covered</button><div style="position:absolute;inset:0;background:white"></div>
    </div>
    <div style="overflow:hidden;height:20px"><div style="margin-top:80px"><button>Clipped</button></div></div>
    <button style="position:absolute;top:200vh">Offscreen</button>
  `, { exclude: '.app-control' });
  await page.evaluate(() => document.querySelector('button').onclick = () => document.title = 'Visible activated');
  const hints = await showHints(page, 1);
  await page.keyboard.type((await hints.textContent()).trim().toLowerCase());
  await expect(page).toHaveTitle('Visible activated');
});

test('activates open-shadow and slotted controls once and keeps light DOM hint order', async ({ page }) => {
  await install(page, `
    <button>First</button>
    <outer-actions><button slot="action">Slotted</button></outer-actions>
    <button>Last</button>
    <focusable-host tabindex="0" style="display:inline-block;vertical-align:top"></focusable-host>
    <ignored-host class="reserved"></ignored-host>
  `, { exclude: '.reserved' });
  await page.evaluate(() => {
    const outer = document.querySelector('outer-actions').attachShadow({ mode: 'open' });
    outer.innerHTML = '<inner-actions><slot name="action" slot="forwarded"></slot></inner-actions>';
    const inner = outer.querySelector('inner-actions').attachShadow({ mode: 'open' });
    inner.innerHTML = `
      <slot name="forwarded"></slot>
      <button aria-label="Deep" style="padding:0;border:0"><span aria-hidden="true">Icon</span></button>
      <div data-vim-nav-ignore><button>Ignored</button></div>
      <button class="reserved">Reserved</button>
    `;
    const focusable = document.querySelector('focusable-host').attachShadow({ mode: 'open' });
    focusable.innerHTML = '<button style="display:block">Inside focusable host</button>';
    const ignored = document.querySelector('ignored-host').attachShadow({ mode: 'open' });
    ignored.innerHTML = '<button>Inside excluded host</button>';
    window.picks = [];
    document.addEventListener('click', event => {
      const target = event.composedPath()[0];
      window.picks.push(target.getAttribute('aria-label') || target.textContent);
    });
  });
  const labels = await (await showHints(page, 5)).allTextContents();
  for (const [index, code] of labels.entries()) {
    if (index) await showHints(page, 5);
    await page.keyboard.type(code);
    await expect(page.locator(hint)).toHaveCount(0);
  }
  const picks = await page.evaluate(() => window.picks);
  expect(picks.slice(0, 3)).toEqual(['First', 'Slotted', 'Last']);
  expect(picks.slice(3).sort()).toEqual(['Deep', 'Inside focusable host']);
});

test('rechecks shadow targets for occlusion and removal before activation', async ({ page }) => {
  await install(page, '<action-panel></action-panel>');
  await page.evaluate(() => {
    const root = document.querySelector('action-panel').attachShadow({ mode: 'open' });
    root.innerHTML = '<button>Pick</button>';
    window.clicks = 0;
    root.querySelector('button').onclick = () => window.clicks++;
  });
  const code = await (await showHints(page, 1)).textContent();
  await page.evaluate(() => {
    const cover = document.createElement('div');
    cover.style.cssText = 'position:fixed;inset:0;background:white';
    document.querySelector('action-panel').shadowRoot.append(cover);
  });
  await page.keyboard.type(code);
  expect(await page.evaluate(() => window.clicks)).toBe(0);
  await page.evaluate(() => document.querySelector('action-panel').shadowRoot.querySelector('div').remove());
  await showHints(page, 1);
  await page.evaluate(() => document.querySelector('action-panel').remove());
  await page.keyboard.type(code);
  expect(await page.evaluate(() => window.clicks)).toBe(0);
});

test('cancels open hints when a panel scrolls inside a shadow tree', async ({ page }) => {
  await install(page, '<scroll-panel></scroll-panel>');
  await page.evaluate(() => {
    const root = document.querySelector('scroll-panel').attachShadow({ mode: 'open' });
    root.innerHTML = `<section style="height:80px;overflow:auto">
      <button>Visible</button><div style="height:300px"></div><button>Below</button>
    </section>`;
  });
  const hints = await showHints(page, 1);
  await page.locator('scroll-panel section').evaluate(pane => pane.scrollTop = pane.scrollHeight);
  await expect(hints).toHaveCount(0);
  await showHints(page, 1);
});

test('the first shortcut works after a page replaces its body during hint mode', async ({ page }) => {
  await install(page, '<button>Original</button>');
  await showHints(page, 1);
  await page.evaluate(() => {
    const next = document.createElement('body');
    next.innerHTML = '<button>Replacement</button>';
    document.body.replaceWith(next);
  });
  await page.keyboard.press('?');
  await expect(dialog(page)).toBeVisible();
});

test('refreshes candidates for each session and never activates a hidden or detached target', async ({ page }) => {
  await install(page, '<button>Action</button>');
  await page.evaluate(() => {
    window.clicks = 0;
    document.querySelector('button').onclick = () => window.clicks++;
  });
  const hints = await showHints(page, 1);
  let code = (await hints.textContent()).trim().toLowerCase();
  await page.evaluate(() => document.querySelector('button').hidden = true);
  await page.keyboard.type(code);
  expect(await page.evaluate(() => window.clicks)).toBe(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => document.querySelector('button').hidden = false);
  await showHints(page, 1);
  code = (await hints.textContent()).trim().toLowerCase();
  await page.evaluate(() => document.querySelector('button').remove());
  await page.keyboard.type(code);
  expect(await page.evaluate(() => window.clicks)).toBe(0);
});

test('focuses text fields and gives typing back to the editor', async ({ page }) => {
  await install(page, '<textarea aria-label="Notes"></textarea>');
  const field = page.getByRole('textbox');
  const hints = await showHints(page, 1);
  await page.keyboard.type((await hints.textContent()).trim().toLowerCase());
  await expect(field).toBeFocused();
  await page.keyboard.type('fjkggG?');
  await expect(field).toHaveValue('fjkggG?');
  await expect(page.locator(hint)).toHaveCount(0);
  await expect(dialog(page)).toHaveCount(0);
});

test('leaves shortcuts to embedded editors, open dialogs and modified key events', async ({ page }) => {
  await install(page, '<button>Action</button><section></section><dialog><button>Inside dialog</button></dialog>');
  await page.evaluate(() => {
    const root = document.querySelector('section').attachShadow({ mode: 'open' });
    root.innerHTML = '<div contenteditable="true" role="textbox"></div>';
    root.querySelector('div').focus();
  });
  await page.keyboard.type('f?');
  await expect(page.getByRole('textbox')).toHaveText('f?');
  await page.evaluate(() => document.querySelector('dialog').showModal());
  await page.keyboard.press('f');
  await page.keyboard.press('?');
  await expect(page.locator(hint)).toHaveCount(0);
  await expect(dialog(page)).toHaveCount(0);
  await page.evaluate(() => {
    document.querySelector('dialog').close();
    document.querySelector('section').remove();
    document.querySelector('button').focus();
    for (const flags of [{ altKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }]) {
      document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true, ...flags }));
    }
  });
  await expect(page.locator(hint)).toHaveCount(0);
  await showHints(page, 1);
  await page.keyboard.press('Escape');
  await expect(page.locator(hint)).toHaveCount(0);
});

test('scrolls the page and the focused scroll container independently', async ({ page }) => {
  await install(page, `
    <div id="pane" tabindex="0" style="overflow:auto;height:150px">
      <div style="height:1800px">Pane content</div>
    </div>
    <div style="height:3000px">Document content</div>
  `);
  const scrollY = () => page.evaluate(() => window.scrollY);
  await page.keyboard.press('j');
  await expect.poll(scrollY).toBeGreaterThan(0);
  const down = await scrollY();
  await page.keyboard.press('k');
  await expect.poll(scrollY).toBeLessThan(down);
  await page.keyboard.press('G');
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollHeight - innerHeight - scrollY)).toBeLessThanOrEqual(1);
  await page.keyboard.type('gg');
  await expect.poll(scrollY).toBe(0);
  const pane = page.locator('#pane');
  await pane.focus();
  await page.keyboard.press('G');
  await expect.poll(() => pane.evaluate(el => el.scrollHeight - el.clientHeight - el.scrollTop)).toBeLessThanOrEqual(1);
  expect(await scrollY()).toBe(0);
  await page.keyboard.type('gg');
  await expect.poll(() => pane.evaluate(el => el.scrollTop)).toBe(0);
});

test('honors disabled commands and the enable, disable and destroy lifecycle', async ({ page }) => {
  await install(page, '<button>Action</button><div style="height:3000px"></div>', { disabledKeys: ['f', 'gg'] });
  expect(await page.evaluate(() => window.nav.enabled)).toBe(true);
  await page.keyboard.press('f');
  await expect(page.locator(hint)).toHaveCount(0);
  await page.evaluate(() => scrollTo(0, 200));
  await page.keyboard.type('gg');
  expect(await page.evaluate(() => scrollY)).toBe(200);
  await page.evaluate(() => window.nav.disable());
  expect(await page.evaluate(() => window.nav.enabled)).toBe(false);
  await page.keyboard.press('?');
  await expect(dialog(page)).toHaveCount(0);
  await page.evaluate(() => window.nav.enable());
  await page.keyboard.press('?');
  await expect(dialog(page)).toBeVisible();
  const changes = await page.evaluate(() => window.changes);
  expect(changes.slice(-2)).toEqual([false, true]);
  await page.evaluate(() => window.nav.destroy());
  await expect(dialog(page)).toHaveCount(0);
  await page.keyboard.press('?');
  await expect(dialog(page)).toHaveCount(0);
});

test('scopes an instance to its supplied document and cleans up active hints', async ({ page }) => {
  await page.goto(fixture);
  await page.evaluate(async () => {
    const frame = document.createElement('iframe');
    document.body.append(frame);
    const frameDoc = frame.contentDocument;
    frameDoc.body.innerHTML = '<button>In frame</button>';
    document.body.insertAdjacentHTML('afterbegin', '<button>Outside frame</button>');
    const { createVimNav } = await import('/index.js');
    window.nav = createVimNav({ document: frameDoc });
  });
  await page.getByRole('button', { name: 'Outside frame' }).focus();
  await page.keyboard.press('f');
  await expect(page.locator(hint)).toHaveCount(0);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button').focus();
  await page.keyboard.press('f');
  await expect(frame.locator(hint)).toHaveCount(1);
  await page.evaluate(() => window.nav.destroy());
  await expect(frame.locator('[data-vim-nav-hints]')).toHaveCount(0);
  await page.keyboard.press('f');
  await expect(frame.locator(hint)).toHaveCount(0);
});

test('help opens while disabled, supports keyboard dismissal and restores focus', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.emulateMedia({ colorScheme: 'dark' });
  await install(page, '<button>Return here</button>', { enabled: false });
  const origin = page.getByRole('button', { name: 'Return here' });
  await origin.focus();
  await page.evaluate(() => window.nav.showHelp());
  const help = dialog(page);
  await expect(help).toBeVisible();
  const project = help.getByRole('link', { name: 'VimWeb', exact: true });
  await expect(project).toHaveAttribute('href', 'https://github.com/mohsenhariri/vimweb');
  await expect(project).toHaveAttribute('target', '_blank');
  expect(await help.evaluate(el => el.tagName)).toBe('DIALOG');
  const bounds = await help.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.y).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(360);
  expect(bounds.y + bounds.height).toBeLessThanOrEqual(640);
  const colors = () => help.evaluate(el => [getComputedStyle(el).color, getComputedStyle(el).backgroundColor]);
  const dark = await colors();
  expect(dark[0]).not.toBe(dark[1]);
  await page.emulateMedia({ colorScheme: 'light' });
  await expect.poll(colors).not.toEqual(dark);
  const switcher = help.getByRole('checkbox', { name: 'Enable vimWeb' });
  await expect(switcher).not.toBeChecked();
  await switcher.check();
  expect(await page.evaluate(() => window.nav.enabled)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await expect(origin).toBeFocused();
  await page.keyboard.press('?');
  await expect(help).toBeVisible();
  await expect(switcher).toBeChecked();
  await help.getByRole('button', { name: 'Close' }).click();
  await expect(origin).toBeFocused();
});

for (const method of ['showHelp', 'destroy']) {
  test(`honors a page focus handler calling ${method} as help opens`, async ({ page }) => {
    await install(page, '<button>Settings</button>');
    const hosts = await page.evaluate(method => {
      document.addEventListener('focusin', () => window.nav[method](), { once: true });
      window.nav.showHelp();
      return document.querySelectorAll('[data-vim-nav-help]').length;
    }, method);
    expect(hosts).toBe(method === 'destroy' ? 0 : 1);
    await page.evaluate(() => window.nav.destroy());
    await expect(page.locator('[data-vim-nav-help]')).toHaveCount(0);
  });
}

test('can reopen help from the focus handler of the returning control', async ({ page }) => {
  await install(page, '<button>Settings</button>');
  const launcher = page.getByRole('button', { name: 'Settings', exact: true });
  await launcher.focus();
  await page.evaluate(() => {
    window.nav.showHelp();
    document.querySelector('button').addEventListener('focusin', window.nav.showHelp, { once: true });
  });
  await page.keyboard.press('Escape');
  await expect(dialog(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-vim-nav-help]')).toHaveCount(0);
  await expect(launcher).toBeFocused();
});

test('auto entry starts disabled and remembers changes on reload', async ({ page }) => {
  await page.goto(`${fixture}?auto`);
  const launcher = page.getByRole('button', { name: 'Keyboard shortcuts', exact: true });
  const help = dialog(page);
  const switcher = help.getByRole('checkbox', { name: 'Enable vimWeb' });
  await expect(launcher).toBeVisible();
  await page.keyboard.press('?');
  await expect(help).toHaveCount(0);
  await launcher.click();
  await expect(switcher).not.toBeChecked();
  await switcher.check();
  await page.reload();
  await expect(launcher).toBeVisible();
  await page.keyboard.press('?');
  await expect(switcher).toBeChecked();
  await switcher.uncheck();
  await page.reload();
  await expect(launcher).toBeVisible();
  await page.keyboard.press('?');
  await expect(help).toHaveCount(0);
  await launcher.click();
  await expect(switcher).not.toBeChecked();
});

test('applies preference changes to another open tab on the same origin', async ({ page, context }) => {
  const second = await context.newPage();
  for (const tab of [page, second]) {
    await tab.goto(`${fixture}?auto`);
    await tab.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  }
  const firstToggle = dialog(page).getByRole('checkbox', { name: 'Enable vimWeb' });
  const secondToggle = dialog(second).getByRole('checkbox', { name: 'Enable vimWeb' });
  await expect(secondToggle).not.toBeChecked();
  await firstToggle.check();
  await expect(secondToggle).toBeChecked();
  await firstToggle.uncheck();
  await expect(secondToggle).not.toBeChecked();
  await dialog(second).getByRole('button', { name: 'Close' }).click();
  await second.keyboard.press('?');
  await expect(dialog(second)).toHaveCount(0);
});

test('refreshes a restored page from storage after a persisted pageshow', async ({ page }) => {
  await page.goto(`${fixture}?auto`);
  await page.getByRole('button', { name: 'Keyboard shortcuts' }).click();
  const help = dialog(page);
  const toggle = help.getByRole('checkbox', { name: 'Enable vimWeb' });
  await toggle.check();
  // A write in this tab creates a stale in-memory setting without a storage event.
  await page.evaluate(() => localStorage.clear());
  await expect(toggle).toBeChecked();
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })));
  await expect(toggle).not.toBeChecked();
  await help.getByRole('button', { name: 'Close' }).click();
  await page.keyboard.press('?');
  await expect(help).toHaveCount(0);
});

test('link hints preserve native fragment navigation under a subpath', async ({ page }) => {
  await install(page, '<a href="#notes"><span>Jump to notes</span></a><p id="notes">Notes</p>');
  const hints = await showHints(page, 1);
  await page.keyboard.type((await hints.textContent()).trim().toLowerCase());
  await expect(page).toHaveURL(/\/test\/fixture\.html#notes$/);
  await expect(hints).toHaveCount(0);
});

test('auto entry binds a supplied launcher and works with storage unavailable', async ({ page }) => {
  await page.goto(fixture);
  await page.evaluate(async () => {
    document.documentElement.setAttribute('data-vim-nav-default-enabled', 'true');
    document.body.innerHTML = '<form><button data-vim-nav-launcher hidden>Shortcut settings</button></form>';
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Storage blocked', 'SecurityError'); },
    });
    await import('/auto.js');
  });
  const launcher = page.getByRole('button', { name: 'Shortcut settings' });
  await expect(page.getByRole('button')).toHaveCount(1);
  await expect(launcher).toBeVisible();
  await launcher.click();
  const help = dialog(page);
  const toggle = help.getByRole('checkbox', { name: 'Enable vimWeb' });
  await expect(toggle).toBeChecked();
  await toggle.uncheck();
  await toggle.check();
  await help.getByRole('button', { name: 'Close' }).click();
  await expect(launcher).toBeFocused();
  await page.keyboard.press('?');
  await expect(toggle).toBeChecked();
});

test('keeps hint assignments while unrelated live text and ARIA attributes update', async ({ page }) => {
  await install(page, `
    <button>First</button><button>Second</button><button>Third</button>
    <div role="status" aria-live="polite"><time>10:00</time></div>
  `, { alphabet: 'ab' });
  await page.evaluate(() => {
    window.picks = [];
    document.addEventListener('click', event => window.picks.push(event.target.textContent));
  });
  const hints = await showHints(page, 3);
  const labels = (await hints.allTextContents()).map(text => text.trim().toLowerCase());
  const code = labels[1];
  await page.keyboard.type(code);
  await showHints(page, 3);
  await page.keyboard.type(code[0]);
  const visible = page.locator(`${hint}:visible`);
  const before = await visible.allTextContents();
  await page.evaluate(() => {
    document.querySelector('time').firstChild.data = '10:01';
    document.querySelector('[role=status]').setAttribute('aria-busy', 'true');
  });
  await expect(visible).toHaveText(before);
  await page.keyboard.type(code.slice(1));
  const picks = await page.evaluate(() => window.picks);
  expect(picks).toHaveLength(2);
  expect(picks[1]).toBe(picks[0]);
});

test('accepts an uppercase hint after a standalone Shift keypress', async ({ page }) => {
  await install(page, '<button>Pick</button>');
  await page.evaluate(() => document.querySelector('button').onclick = () => document.title = 'Picked');
  const hints = await showHints(page, 1);
  const code = (await hints.textContent()).trim().toUpperCase();
  await page.keyboard.press('Shift');
  await expect(hints).toBeVisible();
  await page.keyboard.down('Shift');
  for (const letter of code) await page.keyboard.press(`Key${letter}`);
  await page.keyboard.up('Shift');
  await expect(page).toHaveTitle('Picked');
  await expect(hints).toHaveCount(0);
});

for (const action of ['remove', 'disable']) {
  test(`rejects activation when a focus handler can ${action} the target`, async ({ page }) => {
    await install(page, '<button>Pick</button>');
    await page.evaluate(action => {
      const button = document.querySelector('button');
      window.events = [];
      button.addEventListener('focus', () => {
        window.events.push('focus');
        if (action === 'remove') button.remove();
        else button.setAttribute('aria-disabled', 'true');
      });
      // A detached button and an ARIA-disabled button both accept synthetic clicks.
      button.addEventListener('click', () => window.events.push('click'));
    }, action);
    const hints = await showHints(page, 1);
    await page.keyboard.type((await hints.textContent()).trim().toLowerCase());
    await expect(hints).toHaveCount(0);
    expect(await page.evaluate(() => window.events)).toEqual(['focus']);
  });
}

for (const change of ['removes the help host', 'replaces the body']) {
  test(`resumes shortcuts after the page ${change}`, async ({ page }) => {
    await install(page, '<button>Action</button>');
    await page.keyboard.press('?');
    const help = dialog(page);
    await expect(help).toBeVisible();
    await help.evaluate((modal, change) => {
      if (change === 'removes the help host') {
        modal.getRootNode().host.remove();
      } else {
        const body = document.createElement('body');
        body.innerHTML = '<button>Replacement</button>';
        document.body.replaceWith(body);
      }
    }, change);
    const hints = await showHints(page, 1);
    await page.keyboard.press('Escape');
    await expect(hints).toHaveCount(0);
    await page.keyboard.press('?');
    await expect(help).toBeVisible();
  });
}

test('keeps document-level shortcuts outside help and preserves native keyboard actions inside', async ({ page }) => {
  await install(page, '<button>Action</button>');
  await page.evaluate(() => {
    window.searches = 0;
    document.addEventListener('keydown', event => {
      if (event.key === '/') {
        window.searches++;
        event.preventDefault();
      }
    });
  });
  await page.keyboard.press('/');
  expect(await page.evaluate(() => window.searches)).toBe(1);
  await page.keyboard.press('?');
  const help = dialog(page);
  const toggle = help.getByRole('checkbox', { name: 'Enable vimWeb' });
  await toggle.focus();
  await page.keyboard.press('/');
  expect(await page.evaluate(() => window.searches)).toBe(1);
  await page.keyboard.press('Space');
  await expect(toggle).not.toBeChecked();
  await page.keyboard.press('Escape');
  await expect(help).toHaveCount(0);
  await page.keyboard.press('/');
  expect(await page.evaluate(() => window.searches)).toBe(2);
});
