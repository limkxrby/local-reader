import { useEffect, useRef, useState } from 'react';
import type { Article, Annotation } from './model';
import { sanitizeContent } from './sanitize';
import { updateArticle } from './storage';
import { captureSelection, renderHighlights } from './annotations';

function HighlightNote({ highlight, save, remove, matched }: { highlight: Annotation; save: (note: string) => void; remove: () => void; matched: boolean }) {
  const [note, setNote] = useState(highlight.note);
  return <li><blockquote>{highlight.quote}</blockquote>{!matched && <small>Quote retained; its position could not be matched uniquely in this copy.</small>}<label>Highlight note<textarea aria-label="Highlight note" value={note} maxLength={10000} onChange={e => setNote(e.target.value)} /></label><button onClick={() => save(note)}>Save highlight note</button><button onClick={remove}>Remove highlight</button></li>;
}

export function Reader({ article, refresh, message }: { article: Article; refresh: () => Promise<void>; message: (text: string) => void }) {
  const root = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState(article.title);
  const [tags, setTags] = useState(article.tags.join(', '));
  const [notes, setNotes] = useState(article.notes);
  const [selection, setSelection] = useState<ReturnType<typeof captureSelection>>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  async function change(fn: (a: Article) => Article) {
    setSaving(true);
    message('Saving changes…');
    try { await updateArticle(article.url, fn); await refresh(); message('Changes saved on this device.'); }
    catch (e) { message(e instanceof Error ? e.message : 'Could not save changes.'); }
    finally { setSaving(false); }
  }
  useEffect(() => {
    setTitle(article.title);
    setTags(article.tags.join(', '));
    setNotes(article.notes);
  }, [article.url, article.title, article.tags, article.notes]);
  useEffect(() => {
    if (!root.current) return;
    root.current.innerHTML = sanitizeContent(article.content, article.url);
    setMatched(renderHighlights(root.current, article.annotations));
  }, [article.content, article.annotations, article.url]);
  return <fieldset className="reader-editor" disabled={saving} aria-busy={saving}>
    <div className="reader-actions">
      <button onClick={() => void change(a => ({ ...a, favorite: !a.favorite }))}>{article.favorite ? '★ Unfavorite' : '☆ Favorite'}</button>
      <button onClick={() => void change(a => ({ ...a, state: a.state === 'read' ? 'unread' : 'read' }))}>{article.state === 'read' ? 'Mark unread' : 'Mark read'}</button>
      <button onClick={() => void change(a => ({ ...a, state: a.state === 'archived' ? 'unread' : 'archived' }))}>{article.state === 'archived' ? 'Unarchive' : 'Archive'}</button>
      <button onClick={() => void change(a => ({ ...a, deleted: !a.deleted }))}>{article.deleted ? 'Restore from trash' : 'Move to trash'}</button>
    </div>
    <form className="tag-editor title-editor" onSubmit={e => { e.preventDefault(); const clean = title.trim(); if (clean) void change(a => ({ ...a, title: clean })); }}><label>Title<input aria-label="Article title" value={title} onChange={e => setTitle(e.target.value)} maxLength={500} required /></label><button>Save title</button></form>
    <form className="tag-editor" onSubmit={e => { e.preventDefault(); void change(a => ({ ...a, tags: tags.split(',').map(s => s.trim()).filter(Boolean) })); }}><label>Tags, separated by commas<input value={tags} onChange={e => setTags(e.target.value)} maxLength={5000} /></label><button>Save tags</button></form>
    {article.text ? <>
      <p className="reader-hint">Select text in the article, then save a highlight. Keyboard selection works too.</p>
      <div ref={root} className="reader-content" tabIndex={0} aria-label="Article text" onMouseUp={() => root.current && setSelection(captureSelection(root.current))} onKeyUp={() => root.current && setSelection(captureSelection(root.current))} />
      <button disabled={!selection} onClick={() => { if (!selection) return; const h = { ...selection, id: crypto.randomUUID(), note: '', createdAt: Date.now() }; void change(a => ({ ...a, annotations: [...a.annotations, h] })); setSelection(null); window.getSelection()?.removeAllRanges(); }}>Save selected highlight</button>
    </> : <div className="bookmark-empty"><h2>This is a bookmark, not an offline copy.</h2><p>Open the original page or download its text from your library.</p></div>}
    <section className="notes"><h2>Notes & highlights</h2><label>Article notes<textarea aria-label="Article notes" value={notes} onChange={e => setNotes(e.target.value)} maxLength={100000} rows={5} /></label><button onClick={() => void change(a => ({ ...a, notes }))}>Save article notes</button>
      <ul>{article.annotations.map(h => <HighlightNote key={h.id} highlight={h} matched={matched.has(h.id)} save={note => void change(a => ({ ...a, annotations: a.annotations.map(item => item.id === h.id ? { ...item, note } : item) }))} remove={() => void change(a => ({ ...a, annotations: a.annotations.filter(item => item.id !== h.id) }))} />)}</ul>
    </section>
  </fieldset>;
}
