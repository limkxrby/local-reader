export interface Article {
  url: string;
  title: string;
  byline: string;
  content: string;
  text: string;
  savedAt: number;
  tags: string[];
  state: 'unread' | 'archived';
  favorite: boolean;
  source: 'saved' | 'pocket';
}

export type ArticleInput = Omit<Article, 'tags' | 'state' | 'favorite' | 'source'> & Partial<Pick<Article, 'tags' | 'state' | 'favorite' | 'source'>>;

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
  if (!a.title || typeof a.savedAt !== 'number' || !Number.isFinite(a.savedAt) || a.savedAt < 0) {
    throw new Error('Article content or save date is missing.');
  }
  if ((a.content as string).length > 5_000_000 || (a.text as string).length > 5_000_000 || (a.title as string).length > 10_000 || (a.byline as string).length > 10_000 || (a.url as string).length > 20_000) {
    throw new Error('Article exceeds the supported size.');
  }
  const tags = a.tags === undefined ? [] : a.tags;
  if (!Array.isArray(tags) || tags.length > 50 || tags.some(tag => typeof tag !== 'string' || !tag.trim() || tag.length > 200)) throw new Error('Invalid article tags.');
  const state = a.state === undefined ? 'unread' : a.state;
  if (state !== 'unread' && state !== 'archived') throw new Error('Invalid article state.');
  const favorite = a.favorite === undefined ? false : a.favorite;
  if (typeof favorite !== 'boolean') throw new Error('Invalid favorite state.');
  const source = a.source === undefined ? 'saved' : a.source;
  if (source !== 'saved' && source !== 'pocket') throw new Error('Invalid article source.');
  if (source === 'saved' && (!(a.content as string) || !(a.text as string))) throw new Error('Article content or save date is missing.');
  return { url: normalizeUrl(a.url as string), title: a.title as string, byline: a.byline as string,
    content: a.content as string, text: a.text as string, savedAt: a.savedAt,
    tags: [...new Set(tags.map(tag => tag.trim()))], state, favorite, source };
}

export function parseBackup(source: string): Article[] {
  const data = JSON.parse(source);
  if (data?.format !== 'local-reader' || ![1, 2].includes(data?.version) || !Array.isArray(data.articles) || data.articles.length > 10_000) {
    throw new Error('Choose a Local Reader JSON backup (version 1 or 2; up to 10,000 articles).');
  }
  return data.articles.map(validateArticle);
}

export function makeBackup(articles: ArticleInput[]): string {
  return JSON.stringify({ format: 'local-reader', version: 2, exportedAt: new Date().toISOString(), articles }, null, 2);
}
