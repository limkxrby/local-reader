import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { importBookmarks, listArticles, restoreArticles } from './storage';
import { makeBackup, parseBackup, type Article } from './model';
import { parsePocketCsv, type PocketImport } from './pocket';
import { sanitizeContent } from './sanitize';
import { Downloads } from './Downloads';
import './library.css';
import './pocket.css';

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
  const [pocketPreview, setPocketPreview] = useState<PocketImport | null>(null);
  const active = articles.find(article => article.url === selected);
  const content = useMemo(() => active ? sanitizeContent(active.content, active.url) : '', [active]);
  const filtered = useMemo(() => {
    const words = query.toLocaleLowerCase().trim().split(/\s+/).filter(Boolean);
    return articles.filter(article => words.every(word => `${article.title} ${article.byline} ${article.text} ${article.url}`.toLocaleLowerCase().includes(word)));
  }, [articles, query]);

  async function refresh() {
    try { setArticles(await listArticles()); }
    catch { setMessage('Your library could not be opened. Check browser storage availability and try again.'); }
    finally { setLoading(false); }
  }
  useEffect(() => {
    void refresh();
    const focus = () => { void refresh(); };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);

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
      setPocketPreview(parsePocketCsv(await file.text()));
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not read this Pocket CSV.'); }
    finally { setBusy(false); if (pocketUpload.current) pocketUpload.current.value = ''; }
  }

  async function importPocket() {
    if (!pocketPreview) return;
    setBusy(true);
    try {
      const added = await importBookmarks(pocketPreview.articles);
      await refresh();
      setPocketPreview(null);
      setMessage(`Imported ${added} Pocket bookmark${added === 1 ? '' : 's'}. ${pocketPreview.articles.length - added + pocketPreview.skipped} duplicate or invalid row${pocketPreview.articles.length - added + pocketPreview.skipped === 1 ? ' was' : 's were'} skipped.`);
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
        <button className="navitem" onClick={() => openArticle('')}>Your library <span>{articles.length}</span></button>
        <div className="sidebar-bottom">
          <p>Good reads.<br />Yours to keep.</p>
          <small>No account. No tracking.<br />Saved text stays in this browser.</small>
          <button disabled={busy || loading} onClick={() => void exportLibrary()}>Export backup ↗</button>
          <button disabled={busy || loading} onClick={() => upload.current?.click()}>Restore backup</button>
          <button disabled={busy || loading} onClick={() => pocketUpload.current?.click()}>Import Pocket CSV</button>
          <input ref={upload} className="visually-hidden" type="file" accept=".json,application/json" aria-label="Restore backup file" onChange={event => void restore(event.target.files?.[0])} />
          <input ref={pocketUpload} className="visually-hidden" type="file" accept=".csv,text/csv" aria-label="Choose Pocket CSV" onChange={event => void previewPocket(event.target.files?.[0])} />
        </div>
      </aside>
      <main>
        {message && <div className="notice" role="status"><span>{message}</span><button aria-label="Dismiss message" onClick={() => setMessage('')}>×</button></div>}
        {pocketPreview && <div className="dialog-backdrop" role="presentation"><section className="import-dialog" role="dialog" aria-modal="true" aria-labelledby="import-title">
          <button className="dialog-close" aria-label="Close Pocket import" disabled={busy} onClick={() => setPocketPreview(null)}>×</button>
          <p className="eyebrow">POCKET CSV IMPORT</p><h2 id="import-title">{pocketPreview.articles.length} bookmark{pocketPreview.articles.length === 1 ? '' : 's'} ready to import.</h2>
          <p>These entries include links, titles, dates, tags, archived status, and favorites. They are bookmarks, not offline copies; importing them will not visit or download their pages.</p>
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
            {active.text ? <div className="reader-content" dangerouslySetInnerHTML={{ __html: content }} /> : <div className="bookmark-empty"><span aria-hidden="true">↗</span><h2>This is a bookmark, not an offline copy.</h2><p>Local Reader kept the link and its Pocket details. Open the original page when you want to read it.</p></div>}
            <footer><a href={active.url} target="_blank" rel="noopener noreferrer">Visit original page ↗</a><p>{active.source === 'pocket' ? 'Imported from Pocket' : 'Text-only copy'} · saved {new Date(active.savedAt).toLocaleDateString()}</p></footer>
          </article>
        </> : <>
          <div className="library-heading"><div><p className="eyebrow">A LITTLE LESS NOISE</p><h1>Your library<span>.</span></h1><p>Something worth reading. Whenever you're ready.</p></div><span className="count">{articles.length} saved</span></div>
          <label className="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search titles, authors, or article text" aria-label="Search library" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <Downloads articles={articles} refresh={refresh} />
          <div className="list-heading"><span>{query ? 'SEARCH RESULTS' : 'SAVED ARTICLES'}</span><span>NEWEST FIRST</span></div>
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
