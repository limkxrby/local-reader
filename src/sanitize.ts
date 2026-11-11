import DOMPurify from 'dompurify';

export function sanitizeContent(html: string, sourceUrl: string): string {
  const clean = DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['p', 'div', 'span', 'section', 'article', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'ul', 'ol', 'li', 'blockquote', 'pre', 'code', 'strong', 'em', 'b', 'i', 'u', 's', 'br', 'hr', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'caption', 'sup', 'sub', 'figure', 'figcaption'],
    ALLOWED_ATTR: ['href', 'title'], ALLOW_DATA_ATTR: false, ALLOW_ARIA_ATTR: false,
  });
  const template = document.createElement('template');
  template.innerHTML = clean;
  for (const link of template.content.querySelectorAll('a')) {
    try {
      const url = new URL(link.getAttribute('href') || '', sourceUrl);
      if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
      link.href = url.href;
      link.rel = 'noopener noreferrer';
      link.target = '_blank';
    } catch { link.removeAttribute('href'); }
  }
  return template.innerHTML;
}
