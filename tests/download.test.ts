import { describe, expect, it, vi, afterEach } from 'vitest';
import { downloadArticle, permissionOrigins, runDownloadBatch } from '../src/download';
import { validateArticle } from '../src/model';
import { importBookmarks, listArticles, saveDownloadedContent } from '../src/storage';

const bookmark = validateArticle({ url: 'https://example.com/download', title: 'My Pocket title', byline: '', content: '', text: '', savedAt: 1000,
  source: 'pocket', tags: ['research'], state: 'archived', favorite: true });
const paragraph = 'An offline library keeps important research available for the future. Readers can return to long articles while travelling without any network connection. Local storage preserves the original context so that knowledge remains useful for years. ';
afterEach(() => vi.unstubAllGlobals());

describe('bookmark downloads', () => {
  it('extracts sanitized offline text while preserving all imported metadata', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(`<html><head><title>Publisher title</title></head><body><article><h1>Publisher title</h1>${`<p>${paragraph}</p>`.repeat(8)}<img src="https://tracker.invalid/pixel"><script>alert(1)</script></article></body></html>`, { headers: { 'content-type': 'text/html' } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await downloadArticle(bookmark, new AbortController().signal);
    expect(result).toMatchObject({ title: bookmark.title, savedAt: 1000, tags: ['research'], state: 'archived', favorite: true, source: 'pocket' });
    expect(result.text).toContain('Local storage');
    expect(result.content).not.toMatch(/<img|<script|tracker.invalid/);
    expect(fetcher).toHaveBeenCalledWith(bookmark.url, expect.objectContaining({ credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer' }));
    await importBookmarks([bookmark]);
    await saveDownloadedContent(bookmark.url, result);
    expect((await listArticles()).find(a => a.url === bookmark.url)?.text).toContain('Local storage');
    await saveDownloadedContent(bookmark.url, { ...result, text: 'stale text' });
    expect((await listArticles()).find(a => a.url === bookmark.url)?.text).not.toBe('stale text');
  });
  it('rejects HTTP errors, non-HTML and oversized streamed responses', async () => {
    for (const response of [new Response('', { status: 503 }), new Response('PDF', { headers: { 'content-type': 'application/pdf' } }), new Response('x'.repeat(5_000_001), { headers: { 'content-type': 'text/html' } })]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(downloadArticle(bookmark, new AbortController().signal)).rejects.toThrow();
    }
  });
  it('continues after failures and cancels before writing an interrupted item', async () => {
    const abort = new AbortController();
    const save = vi.fn().mockResolvedValue(undefined);
    const progress = vi.fn();
    const download = vi.fn().mockRejectedValueOnce(new Error('HTTP 503')).mockImplementationOnce(async () => { abort.abort(); return bookmark; });
    const results = await runDownloadBatch([bookmark, { ...bookmark, url: 'https://example.com/two' }, { ...bookmark, url: 'https://example.com/three' }], abort.signal, save, progress, download);
    expect(results).toHaveLength(1);
    expect(results[0].error).toBe('HTTP 503');
    expect(download).toHaveBeenCalledTimes(2);
    expect(save).not.toHaveBeenCalled();
    expect(permissionOrigins([bookmark, bookmark])).toEqual(['https://example.com/*']);
  });
});
