import { useEffect, useRef, useState } from 'react';
import type { Article } from './model';
import { permissionOrigins, runDownloadBatch, type DownloadResult } from './download';
import { saveDownloadedContent } from './storage';
import './downloads.css';

export function Downloads({ articles, refresh }: { articles: Article[]; refresh: () => Promise<void> }) {
  const pending = articles.filter(a => !a.text);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<DownloadResult[]>([]);
  const [current, setCurrent] = useState('');
  const [total, setTotal] = useState(0);
  const [notice, setNotice] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const failures = results.filter(r => r.error);

  async function start(retry = false) {
    if (controller.current) return;
    const items = (retry ? pending.filter(a => failures.some(f => f.url === a.url)) : pending).slice(0, 50);
    if (!items.length) return;
    const abort = new AbortController();
    controller.current = abort;
    setRunning(true); setResults([]); setTotal(items.length); setNotice('');
    try {
      // Must be called directly in the button gesture, before any await.
      const granted = await chrome.permissions.request({ origins: permissionOrigins(items) });
      if (!granted) { setNotice('Site access was declined. No pages were downloaded.'); return; }
      const completed = await runDownloadBatch(items, abort.signal, saveDownloadedContent,
        (next, title) => { setResults(next); setCurrent(title); });
      setResults(completed);
      setNotice(abort.signal.aborted ? 'Batch stopped. Saved copies are kept; remaining bookmarks can be downloaded later.' : 'Batch finished.');
      await refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Could not start the batch.'); }
    finally { controller.current = null; setRunning(false); setCurrent(''); }
  }

  if (!pending.length && !results.length) return null;
  return <section className="downloads" aria-label="Offline downloads">
    <h2>Take your bookmarks offline</h2>
    <p>{pending.length} bookmark{pending.length === 1 ? '' : 's'} waiting for article text. Download up to 50 at a time. Your browser will ask for access to their sites.</p>
    <p className="download-detail">Pages are fetched without sign-in cookies. Images and video are excluded. Keep this library tab open during downloads.</p>
    <div className="download-actions">
      {pending.length > 0 && <button disabled={running} onClick={() => void start()}>Download next {Math.min(50, pending.length)} bookmarks</button>}
      {running && <button onClick={() => controller.current?.abort()}>Cancel downloads</button>}
      {!running && failures.length > 0 && <button onClick={() => void start(true)}>Retry failed downloads</button>}
    </div>
    {total > 0 && <p aria-live="polite">{results.length} / {total} processed · {results.filter(r => !r.error).length} saved · {failures.length} failed{current ? ` · Downloading ${current}` : ''}</p>}
    {notice && <p aria-live="polite">{notice}</p>}
    {failures.length > 0 && <details><summary>View {failures.length} failed download{failures.length === 1 ? '' : 's'}</summary><ul>{failures.map(f => <li key={f.url}><strong>{f.title}</strong>: {f.error}</li>)}</ul></details>}
  </section>;
}
