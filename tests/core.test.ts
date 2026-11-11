import { describe, expect, it } from 'vitest';
import { extractArticle } from '../src/extract';
import { sanitizeContent } from '../src/sanitize';
import { makeBackup, normalizeUrl, parseBackup, validateArticle } from '../src/model';
import { listArticles, restoreArticles, saveArticle } from '../src/storage';

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
    expect(parseBackup(makeBackup([article]))).toEqual([article]);
    expect(() => parseBackup('{"format":"other","articles":[]}')).toThrow();
    expect(() => parseBackup(makeBackup([{ ...article, savedAt: NaN }]))).toThrow();
    expect(() => validateArticle({ ...article, content: 2 })).toThrow();
  });
  it('deduplicates saves, keeps existing articles on restore, and validates before writes', async () => {
    await saveArticle(article);
    await saveArticle({ ...article, title: 'Updated', savedAt: 2000 });
    expect((await listArticles()).filter(item => item.url === article.url)).toHaveLength(1);
    expect(await restoreArticles([article, { ...article, url: 'https://example.com/second' }])).toBe(1);
    expect((await listArticles()).find(item => item.url === article.url)?.title).toBe('Updated');
    await expect(restoreArticles([{ ...article, url: 'https://example.com/third' }, { ...article, content: '' }])).rejects.toThrow();
    expect((await listArticles()).some(item => item.url.endsWith('/third'))).toBe(false);
  });
});
