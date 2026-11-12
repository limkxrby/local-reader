import DOMPurify from 'dompurify';
import { extractArticle } from './extract';
import { normalizeUrl, type Article } from './model';

export const MAX_DOWNLOAD_BYTES = 5_000_000;

export function permissionOrigins(articles: Article[]): string[] {
  return [...new Set(articles.map(a => {
    const url = new URL(normalizeUrl(a.url));
    return `${url.protocol}//${url.hostname}/*`;
  }))];
}

export async function downloadArticle(article: Article, signal: AbortSignal): Promise<Article> {
  const timeout = AbortSignal.timeout(20_000);
  const combined = AbortSignal.any([signal, timeout]);
  let response: Response;
  try {
    response = await fetch(normalizeUrl(article.url), {
      signal: combined, credentials: 'omit', referrerPolicy: 'no-referrer',
      redirect: 'error', cache: 'no-store',
    });
  } catch {
    if (signal.aborted) throw new Error('Download cancelled.');
    if (timeout.aborted) throw new Error('Page took longer than 20 seconds. Retry when the site is available.');
    throw new Error('Could not fetch this page. It may redirect or block downloads. Open it and use the toolbar to save.');
  }
  if (!response.ok) throw new Error(`Site returned HTTP ${response.status}.`);
  const type = response.headers.get('content-type') || '';
  if (!/^text\/html\b|^application\/xhtml\+xml\b/i.test(type)) throw new Error('This URL did not return an HTML article.');
  if (Number(response.headers.get('content-length')) > MAX_DOWNLOAD_BYTES) throw new Error('Page exceeds the 5 MB download limit.');
  if (!response.body) throw new Error('The site returned an empty page.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = '';
  try {
    while (true) {
      combined.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_DOWNLOAD_BYTES) throw new Error('Page exceeds the 5 MB download limit.');
      html += decoder.decode(chunk.value, { stream: true });
    }
    html += decoder.decode();
  } finally { await reader.cancel().catch(() => {}); }
  combined.throwIfAborted();
  // Strip active content and resource URLs before creating the extraction document.
  // CSP also blocks images, frames, stylesheets and scripts from this detached HTML.
  const clean = DOMPurify.sanitize(html, { WHOLE_DOCUMENT: true,
    FORBID_TAGS: ['script', 'style', 'link', 'base', 'meta', 'img', 'video', 'audio', 'source', 'iframe', 'object', 'embed', 'svg', 'math', 'form', 'input', 'textarea', 'select', 'button'],
    ALLOWED_ATTR: ['href', 'title', 'class', 'id'], ALLOW_DATA_ATTR: false,
  });
  const page = new DOMParser().parseFromString(clean, 'text/html');
  const extracted = extractArticle(page, article.url);
  return { ...article, content: extracted.content, text: extracted.text, byline: extracted.byline };
}

export interface DownloadResult { url: string; title: string; error?: string }

export async function runDownloadBatch(articles: Article[], signal: AbortSignal,
  save: (url: string, article: Article) => Promise<void>,
  progress: (results: DownloadResult[], current: string) => void,
  download = downloadArticle): Promise<DownloadResult[]> {
  const results: DownloadResult[] = [];
  for (const article of articles) {
    if (signal.aborted) break;
    progress([...results], article.title);
    try {
      const extracted = await download(article, signal);
      if (signal.aborted) break;
      await save(article.url, extracted);
      results.push({ url: article.url, title: article.title });
    } catch (error) {
      if (signal.aborted) break;
      results.push({ url: article.url, title: article.title, error: error instanceof Error ? error.message : 'Download failed.' });
    }
    progress([...results], '');
  }
  return results;
}
