import { normalizeUrl, validateArticle, type Article } from './model';

export interface PocketImport {
  articles: Article[];
  skipped: number;
}

function rows(source: string): string[][] {
  const input = source.replace(/^\uFEFF/, '');
  if (input.length > 10_000_000) throw new Error('Choose a Pocket CSV smaller than 10 MB.');
  const output: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index++) {
    const char = input[index];
    if (quoted) {
      if (char === '"' && input[index + 1] === '"') { cell += '"'; index++; }
      else if (char === '"') quoted = false;
      else cell += char;
      continue;
    }
    if (char === '"') {
      if (cell) throw new Error('Pocket CSV has an unexpected quote.');
      quoted = true;
    } else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); output.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (quoted) throw new Error('Pocket CSV has an unfinished quoted value.');
  if (cell || row.length) { row.push(cell); output.push(row); }
  return output.filter(row => row.some(cell => cell.trim()));
}

function field(row: string[], columns: Map<string, number>, names: string[]): string {
  const position = names.map(name => columns.get(name)).find((index): index is number => index !== undefined);
  return position === undefined ? '' : (row[position] || '').trim();
}

function truthy(value: string): boolean { return ['1', 'true', 'yes', 'y'].includes(value.trim().toLowerCase()); }

function pocketDate(value: string): number {
  if (!value) return Date.now();
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) return seconds > 10_000_000_000 ? seconds : seconds * 1000;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : Date.now();
}

export function parsePocketCsv(source: string): PocketImport {
  const table = rows(source);
  if (table.length < 2) throw new Error('Pocket CSV needs a header row and at least one saved item.');
  const columns = new Map(table[0].map((name, index) => [name.trim().toLowerCase(), index]));
  if (!['url', 'given_url', 'resolved_url'].some(name => columns.has(name))) throw new Error('This does not look like a Pocket CSV: the URL column is missing.');
  if (table.length > 10_001) throw new Error('Choose a Pocket CSV with up to 10,000 saved items.');
  const seen = new Set<string>();
  const articles: Article[] = [];
  let skipped = 0;
  for (const row of table.slice(1)) {
    try {
      const url = normalizeUrl(field(row, columns, ['url', 'resolved_url', 'given_url']));
      if (seen.has(url)) { skipped++; continue; }
      seen.add(url);
      const hostname = new URL(url).hostname;
      const title = field(row, columns, ['title', 'resolved_title', 'given_title']) || hostname;
      const tags = field(row, columns, ['tags', 'tag']).split(/[;,|]/).map(tag => tag.trim()).filter(Boolean).slice(0, 50);
      const status = field(row, columns, ['status', 'archive']);
      articles.push(validateArticle({ url, title, byline: '', content: '', text: '',
        savedAt: pocketDate(field(row, columns, ['time_added', 'time', 'created_at'])), tags,
        state: truthy(status) || ['archive', 'archived'].includes(status.toLowerCase()) ? 'archived' : 'unread',
        favorite: truthy(field(row, columns, ['favorite', 'favourite'])), source: 'pocket' }));
    } catch { skipped++; }
  }
  if (!articles.length) throw new Error('No valid HTTP or HTTPS bookmarks were found in this file.');
  return { articles, skipped };
}
