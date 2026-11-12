export interface Annotation {
  id: string; quote: string; prefix: string; suffix: string; note: string; createdAt: number;
}

export interface Article {
  url: string;
  title: string;
  byline: string;
  content: string;
  text: string;
  savedAt: number;
  tags: string[];
  state: 'unread' | 'read' | 'archived';
  favorite: boolean;
  source: 'saved' | 'pocket' | 'omnivore';
  notes: string;
  annotations: Annotation[];
  deleted: boolean;
}

export type ArticleInput = Omit<Article, 'tags' | 'state' | 'favorite' | 'source' | 'notes' | 'annotations' | 'deleted'> & Partial<Pick<Article, 'tags' | 'state' | 'favorite' | 'source' | 'notes' | 'annotations' | 'deleted'>>;

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
  if (!['unread', 'read', 'archived'].includes(String(state))) throw new Error('Invalid article state.');
  const favorite = a.favorite === undefined ? false : a.favorite;
  if (typeof favorite !== 'boolean') throw new Error('Invalid favorite state.');
  const source = a.source === undefined ? 'saved' : a.source;
  if (source !== 'saved' && source !== 'pocket' && source !== 'omnivore') throw new Error('Invalid article source.');
  const notes = a.notes ?? '';
  const annotations = a.annotations ?? [];
  const deleted = a.deleted ?? false;
  if (typeof notes !== 'string' || notes.length > 100_000 || typeof deleted !== 'boolean' || !Array.isArray(annotations) || annotations.length > 1000) throw new Error('Invalid notes or annotations.');
  const ids = new Set<string>();
  for (const h of annotations) {
    if (!h || ['id', 'quote', 'prefix', 'suffix', 'note'].some(key => typeof h[key] !== 'string') || !h.id || !h.quote.trim() || h.quote.length > 12000 || h.note.length > 10000 || h.prefix.length > 200 || h.suffix.length > 200 || !Number.isFinite(h.createdAt) || ids.has(h.id)) throw new Error('Invalid highlight.');
    ids.add(h.id);
  }
  if (source === 'saved' && (!(a.content as string) || !(a.text as string))) throw new Error('Article content or save date is missing.');
  return { url: normalizeUrl(a.url as string), title: a.title as string, byline: a.byline as string,
    content: a.content as string, text: a.text as string, savedAt: a.savedAt,
    tags: [...new Set(tags.map(tag => tag.trim()))], state: state as Article['state'], favorite, source,
    notes, annotations: annotations.map(h => ({ id: h.id, quote: h.quote, prefix: h.prefix, suffix: h.suffix, note: h.note, createdAt: h.createdAt })), deleted };
}

export function parseBackup(source: string): Article[] {
  const data = JSON.parse(source);
  if (data?.format !== 'local-reader' || ![1, 2, 3].includes(data?.version) || !Array.isArray(data.articles) || data.articles.length > 10_000) {
    throw new Error('Choose a Local Reader JSON backup (version 1–3; up to 10,000 articles).');
  }
  return data.articles.map(validateArticle);
}

export function makeBackup(articles: ArticleInput[]): string {
  return JSON.stringify({ format: 'local-reader', version: 3, exportedAt: new Date().toISOString(), articles }, null, 2);
}
