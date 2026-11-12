import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { importBookmarks, listArticles, restoreArticles } from './storage';
import { makeBackup, parseBackup, type Article } from './model';
import { parsePocketCsv, type PocketImport } from './pocket';
import { sanitizeContent } from './sanitize';
import { Downloads } from './Downloads';
import { Reader } from './Reader';
import { parseOmnivore } from './omnivore';
import './library.css';
import './pocket.css';
import './organize.css';

function App() {
  const params = new URLSearchParams(location.search);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selected, setSelected] = useState(params.get('article') || '');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(params.get('error') || '');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
  const pocketUpload = useRef<HTMLInputElement>(null);
  const omnivoreUpload = useRef<HTMLInputElement>(null);
  const [importSource, setImportSource] = useState('Pocket');
  const [view, setView] = useState('all');
  const [sort, setSort] = useState('newest');
  const [tagFilter, setTagFilter] = useState('');
  const [pocketPreview, setPocketPreview] = useState<PocketImport | null>(null);
  const active = articles.find(article => article.url === selected);
  const filtered = useMemo(() => {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return articles.filter(a => (view === 'trash' ? a.deleted : !a.deleted) && (view === 'favorite' ? a.favorite : ['unread','read','archived'].includes(view) ? a.state === view : true) && (!tagFilter || a.tags.includes(tagFilter)) && words.every(word => `${a.title} ${a.byline} ${a.text} ${a.url} ${a.tags.join(' ')} ${a.notes} ${a.annotations.map(h => h.quote + ' ' + h.note).join(' ')}`.toLocaleLowerCase().includes(word)))
      .sort((a,b) => sort === 'title' ? a.title.localeCompare(b.title) : sort === 'oldest' ? a.savedAt - b.savedAt : b.savedAt - a.savedAt);
  }, [articles, query, view, sort, tagFilter]);

  async function refresh() {
    try { setArticles(await listArticles()); }
    catch { setMessage('Your library could not be opened. Check browser storage availability and try again.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    omnivoreUpload.current?.setAttribute('webkitdirectory', '');
    void refresh();
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);
  useEffect(() => {
    if (pocketPreview) document.querySelector<HTMLButtonElement>('.import-dialog button')?.focus();
  }, [pocketPreview]);

  function openArticle(url: string) {
    setSelected(url);
    const address = new URL(location.href);
    address.search = '';
    if (url) address.searchParams.set('article', url);
    history.replaceState(null, '', address);
    window.scrollTo(0, 0);
  }

  async function exportLibrary() {
    setBusy(true);
    try {
      const backup = makeBackup(await listArticles());
      const url = URL.createObjectURL(new Blob([backup], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `local-reader-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
      setMessage('Backup download started. Keep the file somewhere safe.');
    } catch { setMessage('Backup failed. Your saved articles are still on this device.'); }
    finally { setBusy(false); }
  }

  async function restore(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 50_000_000) throw new Error('Choose a backup smaller than 50 MB.');
      const incoming = parseBackup(await file.text()).map(article => {
        const clean = sanitizeContent(article.content, article.url);
        const template = document.createElement('template');
        template.innerHTML = clean;
        return { ...article, content: clean, text: template.content.textContent?.trim() || '' };
      });
      const added = await restoreArticles(incoming);
      await refresh();
      setMessage(`Restored ${added} article${added === 1 ? '' : 's'}. Existing articles were kept.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not restore this backup.'); }
    finally { setBusy(false); if (upload.current) upload.current.value = ''; }
  }

  async function previewPocket(file?: File) {
    if (!file) return;
    setBusy(true);
    try {
      if (file.size > 10_000_000) throw new Error('Choose a Pocket CSV smaller than 10 MB.');
      setImportSource('Pocket'); setPocketPreview(parsePocketCsv(await file.text()));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read this Pocket CSV.'); }
    finally { setBusy(false); if (pocketUpload.current) pocketUpload.current.value = ''; }
  }

  async function previewOmnivore(files: FileList | null) {
    if (!files?.length) return;
    setBusy(true);
    try { setImportSource('Omnivore'); setPocketPreview(await parseOmnivore(Array.from(files))); }
    catch (e) { setMessage(e instanceof Error ? e.message : 'Could not import this export.'); }
    finally { setBusy(false); if (omnivoreUpload.current) omnivoreUpload.current.value = ''; }
  }

  async function importPocket() {
    if (!pocketPreview) return;
    setBusy(true);
    try {
      const added = await importBookmarks(pocketPreview.articles);
      await refresh();
      setPocketPreview(null);
      setMessage(`Imported ${added} ${importSource} bookmark${added === 1 ? '' : 's'}. ${pocketPreview.articles.length - added + pocketPreview.skipped} duplicate or invalid row${pocketPreview.articles.length - added + pocketPreview.skipped === 1 ? ' was' : 's were'} skipped.`);
    } catch { setMessage('Pocket import failed. Your existing library was not changed.'); }
    finally { setBusy(false); }
  }

  return <div className="shell">
    <header className="topbar">
      <button className="brand" onClick={() => openArticle('')} aria-label="Local Reader library"><span className="mark">lr.</span><span>Local Reader</span></button>
      <span className="local"><span /> On this device</span>
    </header>
    <div className="workspace">
      <aside className="sidebar">
        <p className="eyebrow">YOUR SPACE TO READ</p>
        <button className="navitem" onClick={() => { setView('all'); openArticle(''); }}>Your library <span>{articles.filter(a => !a.deleted).length}</span></button>
        <div className="sidebar-bottom">
          <p>Good reads.<br />Yours to keep.</p>
          <small>No account. No tracking.<br />Saved text stays in this browser.</small>
          <button disabled={busy || loading} onClick={() => void exportLibrary()}>Export backup ↗</button>
          <button disabled={busy || loading} onClick={() => upload.current?.click()}>Restore backup</button>
          <button disabled={busy || loading} onClick={() => pocketUpload.current?.click()}>Import Pocket CSV</button>
          <button disabled={busy || loading} onClick={() => omnivoreUpload.current?.click()}>Import Omnivore folder</button>
          <small>Extract the Omnivore ZIP first, then choose its folder.</small>
          <a className="privacy-link" href="privacy.html">Privacy & data</a>
          <input ref={omnivoreUpload} className="visually-hidden" type="file" multiple aria-label="Choose Omnivore export folder" onChange={e => void previewOmnivore(e.target.files)} />
          <input ref={upload} className="visually-hidden" type="file" accept=".json,application/json" aria-label="Restore backup file" onChange={event => void restore(event.target.files?.[0])} />
          <input ref={pocketUpload} className="visually-hidden" type="file" accept=".csv,text/csv" aria-label="Choose Pocket CSV" onChange={event => void previewPocket(event.target.files?.[0])} />
        </div>
      </aside>
      <main>
        {message && <div className="notice" role="status"><span>{message}</span><button aria-label="Dismiss message" onClick={() => setMessage('')}>×</button></div>}
        {pocketPreview && <div className="dialog-backdrop" role="presentation"><section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title" onKeyDown={e => {
          if (e.key === 'Escape' && !busy) setPocketPreview(null);
          if (e.key === 'Tab') {
            const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
            const first = buttons[0], last = buttons[buttons.length-1];
            if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
            else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
          }
        }}>
          <button className="dialog-close" aria-label="Close import" disabled={busy} onClick={() => setPocketPreview(null)}>×</button>
          <p className="eyebrow">{importSource.toUpperCase()} IMPORT</p><h2 id="import-title">{pocketPreview.articles.length} bookmark{pocketPreview.articles.length === 1 ? '' : 's'} ready to import.</h2>
          <p>{importSource === 'Pocket' ? 'Links, titles, dates, tags, archived status, and favorites will be kept. Offline text must be downloaded separately.' : 'Metadata and available article HTML will be kept. Highlight Markdown is preserved in article notes. PDF files remain bookmarks.'} No pages are contacted during import. Existing URLs are kept.</p>
          {pocketPreview.skipped > 0 && <p className="import-warning">{pocketPreview.skipped} invalid or repeated row{pocketPreview.skipped === 1 ? ' was' : 's were'} skipped in the preview.</p>}
          <ul>{pocketPreview.articles.slice(0, 3).map(item => <li key={item.url}><strong>{item.title}</strong><span>{new URL(item.url).hostname}{item.tags.length ? ` · ${item.tags.join(', ')}` : ''}</span></li>)}</ul>
          {pocketPreview.articles.length > 3 && <p className="more-preview">Plus {pocketPreview.articles.length - 3} more.</p>}
          <div className="dialog-actions"><button disabled={busy} onClick={() => setPocketPreview(null)}>Cancel</button><button className="primary" disabled={busy} onClick={() => void importPocket()}>Import bookmarks</button></div>
        </section></div>}
        {active ? <>
          <button className="back" onClick={() => openArticle('')}>← Back to library</button>
          <article className="reader">
            <p className="eyebrow">{new URL(active.url).hostname} · {active.text ? 'SAVED FOR OFFLINE READING' : 'IMPORTED BOOKMARK'}</p>
            <h1>{active.title}</h1>
            <p className="byline">{active.byline || (active.source === 'pocket' ? 'Imported Pocket bookmark' : 'Saved article')}{active.text ? ` · ${Math.max(1, Math.ceil(active.text.split(/\s+/).length / 220))} min read` : ''}</p>
            <Reader key={active.url} article={active} refresh={refresh} message={setMessage} />
            <footer><a href={active.url} target="_blank" rel="noopener noreferrer">Visit original page ↗</a><p>{active.source === 'saved' ? 'Text-only copy' : `Imported from ${active.source}`} · saved {new Date(active.savedAt).toLocaleDateString()}</p></footer>
          </article>
        </> : <>
          <div className="library-heading"><div><p className="eyebrow">A LITTLE LESS NOISE</p><h1>Your library<span>.</span></h1><p>Something worth reading. Whenever you're ready.</p></div><span className="count">{articles.filter(a => !a.deleted).length} saved</span></div>
          <label className="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search titles, authors, or article text" aria-label="Search library" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <div className="filters"><label>Show<select aria-label="Show" value={view} onChange={e => setView(e.target.value)}><option value="all">All articles</option><option value="unread">Unread</option><option value="read">Read</option><option value="archived">Archived</option><option value="favorite">Favorites</option><option value="trash">Trash</option></select></label><label>Tag<select aria-label="Tag" value={tagFilter} onChange={e => setTagFilter(e.target.value)}><option value="">All tags</option>{[...new Set(articles.flatMap(a => a.tags))].sort().map(t => <option key={t}>{t}</option>)}</select></label><label>Sort<select aria-label="Sort" value={sort} onChange={e => setSort(e.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title</option></select></label></div>
          <p className="backup-tip">Keep a backup of your library. Export includes article text, tags, notes, highlights, and trash.</p>
          <Downloads articles={articles.filter(a => !a.deleted)} refresh={refresh} />
          <div className="list-heading"><span>{query ? 'SEARCH RESULTS' : 'SAVED ARTICLES'}</span><span>{sort === 'title' ? 'TITLE' : sort === 'oldest' ? 'OLDEST FIRST' : 'NEWEST FIRST'}</span></div>
          {loading ? <p role="status">Opening your library…</p> : filtered.length ? <div className="article-list">{filtered.map((article, index) => <button className="article-card" key={article.url} onClick={() => openArticle(article.url)}>
            <span className="article-number">{String(index + 1).padStart(2, '0')}</span>
            <div><p className="source">{new URL(article.url).hostname}</p><h2>{article.title}</h2><p className="excerpt">{article.text ? article.text.slice(0, 180) : 'Imported link — offline text has not been saved yet.'}</p><p className="metadata">{article.text ? `${Math.max(1, Math.ceil(article.text.split(/\s+/).length / 220))} min read` : 'Bookmark'} <span>·</span> {new Date(article.savedAt).toLocaleDateString()} <span>·</span> {article.text ? 'Offline text' : 'Pocket import'}{article.tags.length ? ` · ${article.tags.slice(0, 3).join(', ')}` : ''}</p></div><span className="arrow" aria-hidden="true">↗</span>
          </button>)}</div> : <div className="empty"><span className="empty-symbol" aria-hidden="true">▤</span><h2>{query ? 'No matching reads' : 'Make room for a good read.'}</h2><p>{query ? 'Try another word from the title or article.' : 'Open an article, then click the Local Reader extension icon to save a clean copy here.'}</p>{!query && <small>Right-click the extension icon → Open your library to return.<br />This first version saves text. Images and video are not included.</small>}</div>}
        </>}
      </main>
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
