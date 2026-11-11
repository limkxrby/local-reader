import { Readability } from '@mozilla/readability';
import { normalizeUrl, validateArticle, type Article } from './model';
import { sanitizeContent } from './sanitize';

export function extractArticle(page: Document, address: string): Article {
  const url = normalizeUrl(address);
  const clone = page.cloneNode(true) as Document;
  // Do not store input values or hidden form content from the original page.
  clone.querySelectorAll('form,input,textarea,select,button,script,style,noscript').forEach(node => node.remove());
  const parsed = new Readability(clone).parse();
  if (!parsed?.content || !parsed.textContent?.trim()) throw new Error('No readable article found on this page.');
  const content = sanitizeContent(parsed.content, url);
  const template = page.createElement('template');
  template.innerHTML = content;
  const text = template.content.textContent?.trim() || '';
  return validateArticle({ url, title: parsed.title || page.title || new URL(url).hostname,
    byline: parsed.byline || '', content, text, savedAt: Date.now() });
}
