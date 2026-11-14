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
  const siteName = page.querySelector<HTMLMetaElement>('meta[property="og:site_name"]')?.content.trim().toLocaleLowerCase();
  const candidates = [
    page.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.content,
    page.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.content,
    page.querySelector<HTMLElement>('article h1, main h1, h1')?.textContent,
    parsed.title,
    page.title,
  ].map(value => value?.replace(/\s+/g, ' ').trim()).filter((value): value is string => Boolean(value));
  const hostname = new URL(url).hostname.replace(/^www\./, '').toLocaleLowerCase();
  const title = candidates.find(value => {
    const normal = value.toLocaleLowerCase();
    return normal !== hostname && normal !== `www.${hostname}` && normal !== siteName;
  }) || candidates[0] || hostname;
  return validateArticle({ url, title,
    byline: parsed.byline || '', content, text, savedAt: Date.now() });
}
