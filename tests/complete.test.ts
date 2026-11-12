import { describe, expect, it } from 'vitest';
import { validateArticle, makeBackup, parseBackup } from '../src/model';
import { saveArticle, listArticles, updateArticle } from '../src/storage';
import { locateQuote, renderHighlights } from '../src/annotations';
import { parseOmnivore } from '../src/omnivore';

const article = validateArticle({ url: 'https://example.com/complete', title: 'Research', byline: '', content: '<p>One useful quote.</p>', text: 'One useful quote.', savedAt: 1000 });
const highlight = { id: 'quote-1', quote: 'useful quote', prefix: 'One ', suffix: '.', note: 'Remember this', createdAt: 1000 };
describe('organization and annotations', () => {
  it('preserves notes and imported metadata when the article is captured again, and round-trips backup v3', async () => {
    await saveArticle(article);
    await updateArticle(article.url, a => ({ ...a, state: 'read', tags: ['research'], annotations: [highlight], notes: 'My research notes', favorite: true, deleted: true }));
    const saved = (await listArticles()).find(a => a.url === article.url)!;
    expect(parseBackup(makeBackup([saved]))[0]).toEqual(saved);
    await saveArticle({ ...article, content: '<p>Updated article.</p>', text: 'Updated article.' });
    const updated = (await listArticles()).find(a => a.url === article.url)!;
    expect(updated).toMatchObject({ deleted: false, state: 'read', favorite: true, notes: 'My research notes', annotations: [highlight], tags: ['research'] });
    for (const version of [1,2]) expect(parseBackup(JSON.stringify({ format: 'local-reader', version, articles: [{ ...article, notes: undefined, annotations: undefined, deleted: undefined }] }))[0].notes).toBe('');
    expect(() => validateArticle({ ...article, annotations: [highlight, highlight] })).toThrow();
  });
  it('matches context, rejects ambiguous quotes, and renders safely across formatted text', () => {
    expect(locateQuote('One useful quote. Another useful quote.', highlight)).toBe(4);
    expect(locateQuote('useful quote / useful quote', { ...highlight, prefix: '', suffix: '' })).toBe(-1);
    const root = document.createElement('div'); root.innerHTML = '<p>One useful <em>quote</em>.</p>';
    expect(renderHighlights(root, [highlight]).has(highlight.id)).toBe(true);
    expect([...root.querySelectorAll('mark')].map(m => m.textContent).join('')).toBe('useful quote');
    expect(root.textContent).toBe('One useful quote.');
  });
});
describe('Omnivore official export structure', () => {
  const file = (path: string, text: string) => ({ name: path.split('/').pop()!, webkitRelativePath: `export/${path}`, size: text.length, text: async () => text });
  it('imports metadata, sanitizes offline HTML, and preserves Markdown highlights as notes', async () => {
    const result = await parseOmnivore([
      file('metadata_0_to_20.json', JSON.stringify([{ slug: 'story', url: 'https://example.com/omni', title: 'Omnivore story', author: 'Writer', savedAt: '2024-01-02T00:00:00Z', labels: ['Study'], state: 'Archived' }])),
      file('content/story.html', '<p>Offline research.</p><script>alert(1)</script><img src="https://tracker.invalid/pixel">'),
      file('highlights/story.md', '> Offline research.\n\nA note'),
    ]);
    expect(result.articles[0]).toMatchObject({ source: 'omnivore', state: 'archived', tags: ['Study'], text: 'Offline research.' });
    expect(result.articles[0].notes).toContain('A note');
    expect(result.articles[0].content).not.toMatch(/script|img|tracker/);
    await expect(parseOmnivore([file('random.json', '[]')])).rejects.toThrow();
  });
});
