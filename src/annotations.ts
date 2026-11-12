import type { Annotation } from './model';

export function locateQuote(text: string, h: Annotation): number {
  const candidates: number[] = [];
  let at = text.indexOf(h.quote);
  while (at >= 0) { candidates.push(at); at = text.indexOf(h.quote, at + 1); }
  const contextual = candidates.filter(start => (h.prefix ? text.slice(Math.max(0, start - h.prefix.length), start) === h.prefix : start === 0) && (h.suffix ? text.slice(start + h.quote.length, start + h.quote.length + h.suffix.length) === h.suffix : start + h.quote.length === text.length));
  return contextual.length === 1 ? contextual[0] : candidates.length === 1 ? candidates[0] : -1;
}

export function captureSelection(root: HTMLElement): Omit<Annotation, 'id' | 'note' | 'createdAt'> | null {
  const selection = window.getSelection();
  if (!selection?.rangeCount || selection.isCollapsed) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer) || !root.contains(range.endContainer)) return null;
  const before = range.cloneRange(); before.selectNodeContents(root); before.setEnd(range.startContainer, range.startOffset);
  const start = before.cloneContents().textContent?.length || 0;
  const quote = range.cloneContents().textContent || '';
  if (!quote.trim() || quote.length > 12000) return null;
  const text = root.textContent || '';
  return { quote, prefix: text.slice(Math.max(0, start - 64), start), suffix: text.slice(start + quote.length, start + quote.length + 64) };
}

export function renderHighlights(root: HTMLElement, highlights: Annotation[]): Set<string> {
  const text = root.textContent || '';
  const matched = new Set<string>();
  const segments: { start: number; end: number; id: string }[] = [];
  for (const h of highlights) {
    const start = locateQuote(text, h);
    if (start < 0) continue;
    matched.add(h.id); segments.push({ start, end: start + h.quote.length, id: h.id });
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = []; let node: Node | null;
  while ((node = walker.nextNode())) nodes.push(node as Text);
  let offset = 0;
  for (const original of nodes) {
    const value = original.data;
    const relevant = segments.filter(s => s.start < offset + value.length && s.end > offset);
    const points = [...new Set([0, value.length, ...relevant.flatMap(s => [Math.max(0, s.start - offset), Math.min(value.length, s.end - offset)])])].sort((a,b) => a-b);
    if (relevant.length) {
      const fragment = document.createDocumentFragment();
      for (let i = 0; i < points.length - 1; i++) {
        const chunk = document.createTextNode(value.slice(points[i], points[i+1]));
        if (relevant.some(s => s.start <= offset + points[i] && s.end >= offset + points[i+1])) {
          const mark = document.createElement('mark'); mark.append(chunk); fragment.append(mark);
        } else fragment.append(chunk);
      }
      original.replaceWith(fragment);
    }
    offset += value.length;
  }
  return matched;
}
