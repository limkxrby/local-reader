export interface Article {
  url: string;
  title: string;
  byline: string;
  content: string;
  text: string;
  savedAt: number;
}

export function normalizeUrl(value: string): string {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Only ordinary HTTP and HTTPS article URLs are supported.');
  }
  url.hash = '';
  return url.href;
}

export function validateArticle(value: unknown): Article {
  if (!value || typeof value !== 'object') throw new Error('Invalid article.');
  const a = value as Record<string, unknown>;
  for (const field of ['url', 'title', 'byline', 'content', 'text']) {
    if (typeof a[field] !== 'string') throw new Error(`Invalid article ${field}.`);
  }
  if (!a.title || !a.content || !a.text || typeof a.savedAt !== 'number' || !Number.isFinite(a.savedAt) || a.savedAt < 0) {
    throw new Error('Article content or save date is missing.');
  }
  if ((a.content as string).length > 5_000_000 || (a.text as string).length > 5_000_000 || (a.title as string).length > 10_000 || (a.byline as string).length > 10_000 || (a.url as string).length > 20_000) {
    throw new Error('Article exceeds the supported size.');
  }
  return { url: normalizeUrl(a.url as string), title: a.title as string, byline: a.byline as string,
    content: a.content as string, text: a.text as string, savedAt: a.savedAt };
}

export function parseBackup(source: string): Article[] {
  const data = JSON.parse(source);
  if (data?.format !== 'local-reader' || data?.version !== 1 || !Array.isArray(data.articles) || data.articles.length > 10_000) {
    throw new Error('Choose a Local Reader version 1 JSON backup (up to 10,000 articles).');
  }
  return data.articles.map(validateArticle);
}

export function makeBackup(articles: Article[]): string {
  return JSON.stringify({ format: 'local-reader', version: 1, exportedAt: new Date().toISOString(), articles }, null, 2);
}
