import { openDB } from 'idb';
import { validateArticle, type Article, type ArticleInput } from './model';

const db = () => openDB('local-reader', 1, {
  upgrade(database) { database.createObjectStore('articles', { keyPath: 'url' }); },
});

export async function listArticles(): Promise<Article[]> {
  const database = await db();
  try { return (await database.getAll('articles')).sort((a, b) => b.savedAt - a.savedAt); }
  finally { database.close(); }
}

export async function saveArticle(value: ArticleInput): Promise<void> {
  const article = validateArticle(value);
  const database = await db();
  try { await database.put('articles', article); }
  finally { database.close(); }
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
