import { openDB } from 'idb';
import { validateArticle, type Article, type ArticleInput } from './model';

const db = () => openDB('local-reader', 1, {
  upgrade(database) { database.createObjectStore('articles', { keyPath: 'url' }); },
});

export async function listArticles(): Promise<Article[]> {
  const database = await db();
  try { return (await database.getAll('articles')).map(validateArticle).sort((a, b) => b.savedAt - a.savedAt); }
  finally { database.close(); }
}

// Re-read inside the write transaction so a completed capture in another tab wins.
export async function saveDownloadedContent(url: string, value: Article): Promise<void> {
  const extracted = validateArticle(value);
  const database = await db();
  try {
    const tx = database.transaction('articles', 'readwrite');
    const current = await tx.store.get(url);
    if (current && !current.text && !current.deleted) {
      await tx.store.put(validateArticle({ ...current, content: extracted.content, text: extracted.text, byline: extracted.byline }));
    }
    await tx.done;
  } finally { database.close(); }
}

export async function saveArticle(value: ArticleInput): Promise<void> {
  const article = validateArticle(value);
  const database = await db();
  try {
    const tx = database.transaction('articles', 'readwrite');
    const current = await tx.store.get(article.url);
    await tx.store.put(current ? validateArticle({ ...article, tags: current.tags, state: current.state, favorite: current.favorite, source: current.source, savedAt: current.savedAt, notes: current.notes, annotations: current.annotations, deleted: false }) : article);
    await tx.done;
  }
  finally { database.close(); }
}

export async function updateArticle(url: string, change: (current: Article) => Article): Promise<void> {
  const database = await db();
  try {
    const tx = database.transaction('articles', 'readwrite');
    const current = await tx.store.get(url);
    if (!current) throw new Error('Article no longer exists.');
    const updated = validateArticle(change(validateArticle(current)));
    if (updated.url !== url) throw new Error('Article URL cannot change.');
    await tx.store.put(updated);
    await tx.done;
  } finally { database.close(); }
}

// One transaction: a failed restore cannot leave a partially imported library.
// Existing URLs always win, so restoring an old backup cannot erase a newer save.
export async function restoreArticles(values: ArticleInput[]): Promise<number> {
  const articles = values.map(validateArticle);
  const database = await db();
  try {
    const transaction = database.transaction('articles', 'readwrite');
    let added = 0;
    for (const article of articles) {
      if (!(await transaction.store.getKey(article.url))) {
        await transaction.store.add(article);
        added++;
      }
    }
    await transaction.done;
    return added;
  } finally { database.close(); }
}

export async function importBookmarks(values: Article[]): Promise<number> {
  const articles = values.map(validateArticle);
  const database = await db();
  try {
    const transaction = database.transaction('articles', 'readwrite');
    let added = 0;
    for (const article of articles) {
      if (!(await transaction.store.getKey(article.url))) { await transaction.store.add(article); added++; }
    }
    await transaction.done;
    return added;
  } finally { database.close(); }
}
