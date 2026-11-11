import { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { listArticles, restoreArticles } from './storage';
import { makeBackup, parseBackup, type Article } from './model';
import { sanitizeContent } from './sanitize';
import './library.css';

function App() {
  const params = new URLSearchParams(location.search);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selected, setSelected] = useState(params.get('article') || '');
  const [query, setQuery] = useState('');
  const [message, setMessage] = useState(params.get('error') || '');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const upload = useRef<HTMLInputElement>(null);
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
          <input ref={upload} className="visually-hidden" type="file" accept=".json,application/json" aria-label="Restore backup file" onChange={event => void restore(event.target.files?.[0])} />
        </div>
      </aside>
      <main>
        {message && <div className="notice" role="status"><span>{message}</span><button aria-label="Dismiss message" onClick={() => setMessage('')}>×</button></div>}
        {active ? <>
          <button className="back" onClick={() => openArticle('')}>← Back to library</button>
          <article className="reader">
            <p className="eyebrow">{new URL(active.url).hostname} · SAVED FOR OFFLINE READING</p>
            <h1>{active.title}</h1>
            <p className="byline">{active.byline || 'Saved article'} · {Math.max(1, Math.ceil(active.text.split(/\s+/).length / 220))} min read</p>
            <div className="reader-content" dangerouslySetInnerHTML={{ __html: content }} />
            <footer><a href={active.url} target="_blank" rel="noopener noreferrer">Visit original page ↗</a><p>Text-only copy · saved {new Date(active.savedAt).toLocaleDateString()}</p></footer>
          </article>
        </> : <>
          <div className="library-heading"><div><p className="eyebrow">A LITTLE LESS NOISE</p><h1>Your library<span>.</span></h1><p>Something worth reading. Whenever you're ready.</p></div><span className="count">{articles.length} saved</span></div>
          <label className="search"><span aria-hidden="true">⌕</span><input type="search" placeholder="Search titles, authors, or article text" aria-label="Search library" value={query} onChange={event => setQuery(event.target.value)} /></label>
          <div className="list-heading"><span>{query ? 'SEARCH RESULTS' : 'SAVED ARTICLES'}</span><span>NEWEST FIRST</span></div>
          {loading ? <p role="status">Opening your library…</p> : filtered.length ? <div className="article-list">{filtered.map((article, index) => <button className="article-card" key={article.url} onClick={() => openArticle(article.url)}>
            <span className="article-number">{String(index + 1).padStart(2, '0')}</span>
            <div><p className="source">{new URL(article.url).hostname}</p><h2>{article.title}</h2><p className="excerpt">{article.text.slice(0, 180)}</p><p className="metadata">{Math.max(1, Math.ceil(article.text.split(/\s+/).length / 220))} min read <span>·</span> {new Date(article.savedAt).toLocaleDateString()} <span>·</span> Offline text</p></div><span className="arrow" aria-hidden="true">↗</span>
          </button>)}</div> : <div className="empty"><span className="empty-symbol" aria-hidden="true">▤</span><h2>{query ? 'No matching reads' : 'Make room for a good read.'}</h2><p>{query ? 'Try another word from the title or article.' : 'Open an article, then click the Local Reader extension icon to save a clean copy here.'}</p>{!query && <small>Right-click the extension icon → Open your library to return.<br />This first version saves text. Images and video are not included.</small>}</div>}
        </>}
      </main>
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
