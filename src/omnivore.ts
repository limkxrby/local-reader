import { validateArticle, type Article } from './model';
import { sanitizeContent } from './sanitize';

export interface ImportFile { name: string; webkitRelativePath?: string; size: number; text(): Promise<string> }
export async function parseOmnivore(files: ImportFile[]): Promise<{ articles: Article[]; skipped: number }> {
  if (files.length > 30000 || files.reduce((n,f) => n + f.size, 0) > 50_000_000) throw new Error('Choose an extracted Omnivore export up to 50 MB / 30,000 files.');
  const metadata = files.filter(f => /^metadata(?:_.*)?\.json$/i.test(f.name));
  if (!metadata.length) throw new Error('No metadata_*.json files found. Extract the Omnivore ZIP and choose its folder.');
  const paths = new Map(files.map(f => [(f.webkitRelativePath || f.name).replace(/\\/g, '/'), f]));
  const find = (suffix: string) => [...paths].find(([path]) => path === suffix || path.endsWith('/' + suffix))?.[1];
  const articles: Article[] = []; const seen = new Set<string>(); let skipped = 0; let count = 0;
  for (const file of metadata) {
    const rows: unknown = JSON.parse(await file.text());
    if (!Array.isArray(rows)) throw new Error('Omnivore metadata must contain an array of items.');
    count += rows.length; if (count > 10000) throw new Error('Choose an export with up to 10,000 items.');
    for (const value of rows) {
      try {
        if (!value || typeof value !== 'object') throw new Error();
        const row = value as Record<string, unknown>;
        if (typeof row.url !== 'string' || typeof row.slug !== 'string' || row.slug.includes('/') || row.slug.includes('\\')) throw new Error();
        const html = find(`content/${row.slug}.html`) || find(`contents/${row.slug}.html`);
        const highlights = find(`highlights/${row.slug}.md`);
        const content = html ? sanitizeContent(await html.text(), row.url) : '';
        const template = document.createElement('template'); template.innerHTML = content;
        const text = template.content.textContent?.trim() || '';
        const item = validateArticle({ url: row.url, title: row.title || new URL(row.url).hostname, byline: row.author || '',
          content: text ? content : '', text, savedAt: Date.parse(String(row.savedAt)), tags: row.labels || [],
          state: row.state === 'Archived' ? 'archived' : 'unread', source: 'omnivore', favorite: false,
          notes: highlights ? `Imported Omnivore highlights (Markdown)\n\n${await highlights.text()}` : '' });
        if (seen.has(item.url)) { skipped++; continue; }
        seen.add(item.url); articles.push(item);
      } catch { skipped++; }
    }
  }
  if (!articles.length) throw new Error('No valid HTTP/HTTPS items found in this export.');
  return { articles, skipped };
}
