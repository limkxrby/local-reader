import { normalizeUrl, validateArticle } from './model';
import { saveArticle } from './storage';

export async function captureTab(tab: chrome.tabs.Tab): Promise<string> {
  if (tab.id === undefined || !tab.url) throw new Error('Open an article in a normal browser tab first.');
  const expectedUrl = normalizeUrl(tab.url);
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['extractor.js'] });
  const [result] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => {
    if (!globalThis.localReaderExtract) throw new Error('The article extractor could not start.');
    return globalThis.localReaderExtract();
  } });
  const article = validateArticle(result?.result);
  if (article.url !== expectedUrl) throw new Error('The page changed while saving. Please try again.');
  await saveArticle(article);
  return article.url;
}

async function saveAndOpen(tab: chrome.tabs.Tab) {
  const library = new URL(chrome.runtime.getURL('library.html'));
  try {
    library.searchParams.set('article', await captureTab(tab));
  } catch (error) {
    const message = error instanceof Error ? error.message : 'The article could not be saved.';
    library.searchParams.set('error', `Could not save this page. ${message}`);
  }
  await chrome.tabs.create({ url: library.href });
}

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  if (!message || typeof message !== 'object' || !('type' in message) || message.type !== 'capture-active-tab') return;
  if (sender.id !== chrome.runtime.id) return;
  void (async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('Open an article in a normal browser tab first.');
      sendResponse({ url: await captureTab(tab) });
    } catch (error) {
      sendResponse({ error: error instanceof Error ? error.message : 'The article could not be saved.' });
    }
  })();
  return true;
});
chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'save', title: 'Save article to Local Reader', contexts: ['page'], documentUrlPatterns: ['http://*/*', 'https://*/*'] });
    chrome.contextMenus.create({ id: 'library', title: 'Open your library', contexts: ['action'] });
  });
});
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'save' && tab) void saveAndOpen(tab);
  if (info.menuItemId === 'library') void chrome.tabs.create({ url: chrome.runtime.getURL('library.html') });
});
