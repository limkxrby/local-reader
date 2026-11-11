import { extractArticle } from './extract';
import type { Article } from './model';

declare global { var localReaderExtract: (() => Article) | undefined; }
// The isolated extension world keeps this function inaccessible to page scripts.
globalThis.localReaderExtract = () => extractArticle(document, location.href);
