const sidebar = document.querySelector('.docs-sidebar');
const contents = sidebar.querySelector('nav');
const links = [...contents.querySelectorAll('a[href^="#"]')];
const destinations = links.map(link => document.getElementById(link.hash.slice(1)));

// Build the search index from the published text so new topics need no second index.
const entries = [];
function addEntry(id, title, text) {
  entries.push({ id, title: title.trim(), text: text.toLowerCase().replace(/\s+/g, ' ') });
}
function addPermalink(heading, id) {
  const link = document.createElement('a');
  link.href = '#' + id;
  link.className = 'docs-permalink';
  link.setAttribute('aria-label', 'Link to ' + heading.textContent.trim());
  link.textContent = '#';
  heading.append(link);
}
for (const section of document.querySelectorAll('.docs-content section[id]')) {
  const titleHeading = section.querySelector('h2');
  addEntry(section.id, titleHeading.textContent, section.textContent);
  addPermalink(titleHeading, section.id);
  for (const heading of section.querySelectorAll('h3[id], dt[id]')) {
    const title = heading.textContent;
    let text = heading.textContent;
    if (heading.matches('dt')) text += ' ' + (heading.nextElementSibling?.textContent || '');
    if (heading.matches('h3')) {
      for (let next = heading.nextElementSibling; next && !next.matches('h2, h3'); next = next.nextElementSibling) {
        text += ' ' + next.textContent;
      }
    }
    addEntry(heading.id, title, text);
    addPermalink(heading, heading.id);
  }
}

const form = document.createElement('form');
form.setAttribute('role', 'search');
const input = document.createElement('input');
input.type = 'search';
input.autocomplete = 'off';
input.placeholder = 'Search documentation';
input.setAttribute('aria-label', 'Search documentation');
form.append(input);
const toggle = document.createElement('button');
toggle.type = 'button';
toggle.className = 'docs-menu-toggle';
toggle.textContent = 'Contents';
contents.id = 'docs-contents';
toggle.setAttribute('aria-controls', contents.id);
toggle.setAttribute('aria-expanded', 'false');
toggle.addEventListener('click', () => {
  toggle.setAttribute('aria-expanded', String(toggle.getAttribute('aria-expanded') === 'false'));
});
contents.addEventListener('click', event => {
  if (event.target.closest('a')) toggle.setAttribute('aria-expanded', 'false');
});

const status = document.createElement('p');
status.setAttribute('role', 'status');
status.className = 'docs-search-status';
const results = document.createElement('nav');
results.dataset.results = '';
results.setAttribute('aria-label', 'Search results');
results.hidden = true;
sidebar.prepend(form, toggle, status, results);

function search() {
  const query = input.value.trim().toLowerCase();
  toggle.hidden = contents.hidden = Boolean(query);
  results.hidden = !query;
  results.replaceChildren();
  status.textContent = '';
  if (!query) return;
  const words = query.split(/\s+/);
  const matches = entries.filter(entry => words.every(word => entry.text.includes(word)));
  function score(entry) {
    const title = entry.title.toLowerCase();
    if (title === query) return 3;
    if (title.startsWith(query)) return 2;
    return title.includes(query) ? 1 : 0;
  }
  matches.sort((a, b) => score(b) - score(a));
  const list = document.createElement('ul');
  for (const match of matches) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = '#' + match.id;
    link.textContent = match.title;
    item.append(link);
    list.append(item);
  }
  results.append(list);
  status.textContent = matches.length ? `${matches.length} result${matches.length === 1 ? '' : 's'}` : 'No matching topics.';
}
input.addEventListener('input', search);
input.addEventListener('keydown', event => {
  if (event.key === 'Escape' && input.value) {
    event.preventDefault();
    input.value = '';
    search();
  }
});
form.addEventListener('submit', event => {
  event.preventDefault();
  results.querySelector('a')?.click();
});
results.addEventListener('click', event => {
  const link = event.target.closest('a');
  if (!link || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey || event.button !== 0) return;
  const target = document.getElementById(link.hash.slice(1));
  // Finish native fragment navigation, then collapse search and hand the keyboard to the article.
  requestAnimationFrame(() => {
    input.value = '';
    search();
    toggle.setAttribute('aria-expanded', 'false');
    target.tabIndex = -1;
    target.focus({ preventScroll: true });
    target.scrollIntoView({ block: 'start' });
  });
});

let current;
let scheduled = false;
function markSection() {
  scheduled = false;
  const threshold = Math.min(innerHeight / 4, 120);
  let active = destinations.findLastIndex(section => section.getBoundingClientRect().top <= threshold);
  if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) active = destinations.length - 1;
  const next = links[active];
  if (next === current) return;
  current?.removeAttribute('aria-current');
  next?.setAttribute('aria-current', 'location');
  current = next;
}
function scheduleMark() {
  if (!scheduled) {
    scheduled = true;
    requestAnimationFrame(markSection);
  }
}
window.addEventListener('scroll', scheduleMark, { passive: true });
window.addEventListener('resize', scheduleMark);
markSection();

if (navigator.clipboard?.writeText) {
  const announcement = document.createElement('span');
  announcement.className = 'sr-only';
  announcement.setAttribute('role', 'status');
  document.body.append(announcement);
  for (const pre of document.querySelectorAll('.docs-content pre')) {
    const frame = document.createElement('div');
    frame.className = 'docs-code';
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = 'Copy';
    let timer;
    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(pre.textContent);
        button.textContent = 'Copied';
        announcement.textContent = 'Code copied to clipboard.';
      } catch {
        const range = document.createRange();
        range.selectNodeContents(pre);
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        button.textContent = 'Selected';
        announcement.textContent = 'Code selected. Use your usual copy command.';
      }
      clearTimeout(timer);
      timer = setTimeout(() => { button.textContent = 'Copy'; announcement.textContent = ''; }, 2200);
    });
    pre.before(frame);
    frame.append(pre, button);
  }
}
