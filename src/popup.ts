import { normalizeUrl } from './model';
import { listArticles } from './storage';
import type { Article } from './model';

const status = document.querySelector<HTMLParagraphElement>('#status')!;
const save = document.querySelector<HTMLButtonElement>('#save')!;
const recent = document.querySelector<HTMLDivElement>('#recent')!;
const libraryUrl = chrome.runtime.getURL('library.html');
let currentUrl = '';

function recentTitle(article: Article) {
  const hostname = new URL(article.url).hostname.replace(/^www\./, '').toLocaleLowerCase();
  if (article.title.trim().toLocaleLowerCase() !== hostname) return article.title;
  const template = document.createElement('template');
  template.innerHTML = article.content;
  return template.content.querySelector('h1')?.textContent?.replace(/\s+/g, ' ').trim() || article.title;
}

function openLibrary(article?: string) {
  const url = new URL(libraryUrl);
  if (article) url.searchParams.set('article', article);
  void chrome.tabs.create({ url: url.href });
  window.close();
}

document.querySelector<HTMLButtonElement>('#library')!.addEventListener('click', () => openLibrary());

async function refresh() {
  const articles = (await listArticles()).filter(article => !article.deleted);
  recent.replaceChildren();
  for (const article of articles.slice(0, 3)) {
    const link = document.createElement('a');
    link.href = `${libraryUrl}?article=${encodeURIComponent(article.url)}`;
    const title = recentTitle(article);
    link.textContent = title;
    link.title = title;
    const domain = document.createElement('small');
    domain.textContent = new URL(article.url).hostname.replace(/^www\./, '');
    link.append(domain);
    link.addEventListener('click', event => { event.preventDefault(); openLibrary(article.url); });
    recent.append(link);
  }
  if (!recent.childElementCount) {
    const empty = document.createElement('p');
    empty.className = 'empty';
    empty.textContent = 'Nothing saved yet.';
    recent.append(empty);
  }
  const existing = articles.find(article => article.url === currentUrl);
  if (currentUrl) {
    save.textContent = existing ? 'Update saved copy' : 'Save this page';
    status.textContent = existing ? 'This page is in your library.' : 'Ready to save for offline reading.';
  }
}

async function initialize() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentUrl = normalizeUrl(tab?.url || '');
    save.disabled = false;
  } catch {
    status.textContent = 'Open a regular website tab to save a page.';
  }
  try { await refresh(); }
  catch { status.textContent = 'Your library could not be opened. Try again.'; save.disabled = true; }
}

save.addEventListener('click', async () => {
  save.disabled = true;
  status.textContent = 'Saving this page…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'capture-active-tab' }) as { url?: string; error?: string };
    if (!result?.url) throw new Error(result?.error || 'Could not save this page.');
    status.textContent = 'Saved for offline reading.';
    await refresh();
    status.textContent = 'Saved for offline reading.';
    save.textContent = 'Update saved copy';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Could not save this page.';
  } finally { save.disabled = false; }
});

void initialize();
