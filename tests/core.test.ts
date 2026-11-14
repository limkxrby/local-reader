import { describe, expect, it } from 'vitest';
import { extractArticle } from '../src/extract';
import { sanitizeContent } from '../src/sanitize';
import { makeBackup, normalizeUrl, parseBackup, validateArticle } from '../src/model';
import { parsePocketCsv } from '../src/pocket';
import { importBookmarks, listArticles, restoreArticles, saveArticle } from '../src/storage';

const paragraph = 'A quiet library gives readers time to think about what they have learned. Articles should remain useful even when their publishers or bookmarking services disappear. Saving a local copy makes it possible to return to a passage on a train, in a classroom, or far from a wireless connection. ';
const article = { url: 'https://example.com/story', title: 'A lasting library', byline: 'A Reader', content: '<p>Quiet libraries last.</p>', text: 'Quiet libraries last.', savedAt: 1000 };

describe('privacy and extraction', () => {
  it('extracts article text and removes active or remote content and form data', () => {
    const page = new DOMParser().parseFromString(`<html><head><title>A lasting library</title></head><body><nav>Menu</nav><article><h1>A lasting library</h1>${Array.from({ length: 5 }, () => `<p>${paragraph}</p>`).join('')}<img src="https://tracker.test/pixel"><script>alert(1)</script><form><textarea>SECRET INPUT</textarea></form></article></body></html>`, 'text/html');
    const result = extractArticle(page, 'https://example.com/story#section');
    expect(result.text).toContain('wireless connection');
    expect(result.content).not.toMatch(/<img|<script|SECRET INPUT/);
    expect(result.url).toBe('https://example.com/story');
    expect(page.querySelector('form')).not.toBeNull();
  });
  it('prefers an article headline over a website-name page title', () => {
    const page = new DOMParser().parseFromString(`<html><head><title>Example.com</title><meta property="og:site_name" content="Example.com"></head><body><article><h1>Research methods that hold up</h1>${Array.from({ length: 5 }, () => `<p>${paragraph}</p>`).join('')}</article></body></html>`, 'text/html');
    expect(extractArticle(page, 'https://example.com/research').title).toBe('Research methods that hold up');
  });
  it('strips resource loads, handlers, CSS and dangerous links', () => {
    const html = sanitizeContent('<p style="background:url(https://evil.test)">Hi</p><svg onload="alert(1)"></svg><iframe src="https://evil.test"></iframe><img src="x" onerror="alert(1)"><a href="javascript:alert(1)" ping="https://evil.test">bad</a><a href="/next">safe</a>', article.url);
    expect(html).not.toMatch(/<svg|<iframe|<img|onerror|onload|style=|ping=|javascript:/);
    expect(html).toContain('href="https://example.com/next"');
    expect(html).toContain('rel="noopener noreferrer"');
  });
  it('rejects restricted URL schemes and credentials', () => {
    for (const url of ['chrome://settings', 'file:///secret', 'javascript:alert(1)', 'https://user:password@example.com']) expect(() => normalizeUrl(url)).toThrow();
  });
});

describe('durable local data and backups', () => {
  it('round-trips complete article contents and rejects malformed backups', () => {
    expect(parseBackup(makeBackup([article]))).toEqual([{ ...article, tags: [], state: 'unread', favorite: false, source: 'saved', notes: '', annotations: [], deleted: false }]);
    expect(() => parseBackup('{"format":"other","articles":[]}')).toThrow();
    expect(() => parseBackup(makeBackup([{ ...article, savedAt: NaN }]))).toThrow();
    expect(() => validateArticle({ ...article, content: 2 })).toThrow();
  });
  it('deduplicates saves, keeps existing articles on restore, and validates before writes', async () => {
    await saveArticle({ ...article, url: 'https://example.com/read' });
    await saveArticle({ ...article, title: 'Updated', savedAt: 2000 });
    expect((await listArticles()).filter(item => item.url === article.url)).toHaveLength(1);
    expect(await restoreArticles([article, { ...article, url: 'https://example.com/second' }])).toBe(1);
    expect((await listArticles()).find(item => item.url === article.url)?.title).toBe('Updated');
    await expect(restoreArticles([{ ...article, url: 'https://example.com/third' }, { ...article, content: '' }])).rejects.toThrow();
    expect((await listArticles()).some(item => item.url.endsWith('/third'))).toBe(false);
  });
});

describe('Pocket CSV import', () => {
  const csv = `title,url,time_added,tags,status,favorite\n"Quoted, title",https://example.com/read#section,1700000000,"research, local-first",0,1\nArchived,https://example.com/archive,2024-01-01,ideas,1,0\nRepeated,https://example.com/read,1700000001,,0,0\nBad,chrome://settings,1700000001,,0,0`;
  it('parses known Pocket columns, quoted cells, tags and bookmark state', () => {
    const result = parsePocketCsv(csv);
    expect(result.skipped).toBe(2);
    expect(result.articles).toEqual(expect.arrayContaining([expect.objectContaining({
      url: 'https://example.com/read', title: 'Quoted, title', tags: ['research', 'local-first'], favorite: true,
      source: 'pocket', state: 'unread', content: '', text: '', savedAt: 1_700_000_000_000,
    }), expect.objectContaining({ url: 'https://example.com/archive', state: 'archived' })]));
  });
  it('rejects malformed CSV and import skips bookmarks already in the library', async () => {
    expect(() => parsePocketCsv('title,url\n"unfinished,https://example.com')).toThrow();
    expect(() => parsePocketCsv('title,notes\nNo URL,hello')).toThrow();
    const incoming = parsePocketCsv(csv).articles;
    await saveArticle(article);
    expect(await importBookmarks(incoming)).toBe(1);
    expect(await importBookmarks(incoming)).toBe(0);
    const saved = await listArticles();
    expect(saved.find(item => item.url.endsWith('/read'))?.source).toBe('saved');
    expect(saved.find(item => item.url.endsWith('/archive'))?.source).toBe('pocket');
  });
});
