# Local Reader

A local-first read-later browser extension. Save article text to an offline library with no account, backend, analytics, or subscriptions.

**Status: working starter, not a store-ready release.** Chrome/Edge Manifest V3, TypeScript, React, Mozilla Readability, DOMPurify, and IndexedDB. Images, video, PDFs, and highlights are not implemented yet.

## Start in the cloud

1. Open this repository on GitHub and choose **Code → Codespaces → Create codespace on main**.
2. The dev container installs dependencies and builds the extension automatically.
3. Run `npm run check` for TypeScript checks, unit tests, and a production build.
4. Run `npm run dev` to rebuild source changes. Restart it after editing files in `public/`.
5. Download the `dist` folder from Codespaces to your computer to test in your browser.

Codespaces is the development environment. The installed extension runs on the user's device; article content is not sent to Codespaces or GitHub. Codespaces usage is subject to your GitHub plan.

## Try the extension

Either build locally with Node.js 24 (`npm ci` then `npm run build`), or download **local-reader-extension** from a successful run under this repository's **Actions** tab.

1. Extract the downloaded build to a folder containing `manifest.json`.
2. Open `chrome://extensions` or `edge://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select that folder (or the local `dist` folder).
4. Pin Local Reader. Open a normal HTTP/HTTPS article and click its toolbar icon once.
5. The article is saved and opens in the reader. Disconnect from the network and reload to check offline reading.
6. Right-click the extension icon and select **Open your library** to return without saving another page. The extension's Options entry also opens the library.

Restricted browser pages, browser stores, PDFs, and some complex sites cannot be saved. Errors appear in the library. A saved copy includes extracted text and links, not media or the entire original page. Clicking a link intentionally visits the original website.

## Included

- Toolbar and page context-menu saving with minimal permissions.
- Readability extraction, strict HTML sanitization, and text-only offline reading.
- URL-based duplicate handling: saving the same URL updates its saved content. Fragments are ignored; query strings are retained.
- Local library and full-text substring search (all entered words must match).
- Versioned JSON backup export and atomic restore. Restore skips URLs already present. Files up to 50 MB / 10,000 articles are accepted.
- Pocket CSV import with a preview, quoted-field support, tags, archived status, and favorites. Repeated, invalid, and already-saved URLs are skipped. Imports create bookmarks only; they do not download or contact the linked pages.
- Explicit offline downloads for up to 50 pending bookmarks per batch, with progress, cancellation, individual failure reasons, and retry. Downloaded text preserves imported titles, dates, tags, favorites, and archive state.
- Responsive, keyboard-accessible library and reader.
- Codespaces development configuration and GitHub Actions checks with a downloadable extension build.

## Privacy and durability

Only `activeTab`, `scripting`, and `contextMenus` are required. Batch downloads declare optional HTTP/HTTPS host access and request only the sites in the selected batch, directly from the download button. Browser-granted site permissions persist until revoked in extension settings. There is no background crawling, telemetry, remote fonts, or remote code. IndexedDB does not require the `storage` permission. Capturing a page is initiated by the user, and sanitization strips forms, scripts, images, iframes, inline styles, and resource-loading attributes. CSP blocks images and frames; HTTP/HTTPS connections are allowed for explicit downloads.

## Download imported bookmarks

Open the library and choose **Download next … bookmarks**, then accept or decline the browser's site-access prompt. The next 50 bookmarks without text are processed sequentially; each page has a 20-second timeout and a 5 MB response limit. Successful copies are saved immediately. Cancel stops the active request and leaves unfinished bookmarks available for a later batch. Keep this tab open: closing or reloading it ends the batch. Failed items can be retried while the batch panel remains open; after reopening the library they are still pending bookmarks.

Downloads omit cookies and referrers, reject redirects, and parse HTML without running publisher scripts. Sites needing sign-in, redirects, JavaScript rendering, or anti-bot challenges may fail; open those pages normally and save with the toolbar. Images and video are excluded. No server or account is involved in extraction.

Saved data stays in this browser profile. **Uninstalling the extension or deleting the profile can erase it. Export backups regularly.** Storage quotas and disk availability still apply; local does not mean encrypted at rest. JSON backups contain plaintext article content and URLs. Restore sanitizes content again before saving. The reader sanitizes on display too. Pocket CSV files are read in the extension and are not uploaded anywhere.

## Tests

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

On a fresh Linux environment use `npx playwright install --with-deps chromium`. The browser test verifies IndexedDB persistence, offline reload, search, backup restore, Pocket import, batch download failure/retry, and offline reading after downloading. Unit tests cover extraction, sanitization, backups, CSV parsing, bounded downloads, cancellation, metadata preservation, and local writes. The test build grants access to one fixture domain; native permission prompt acceptance/denial and toolbar/context-menu testing in Chrome and Edge remain manual release checks. The distributed manifest has no required host permissions.

## Next milestones

1. Improve download compatibility with carefully scoped redirect handling and additional real-site extraction fixtures.
2. Omnivore export adapters, validated against actual export formats.
3. Highlights, notes, read/archive state, and article management.
4. Optional image downloads with explicit permissions and storage limits.
5. Accessibility and extraction testing across real sites, store icons, privacy listing, and release packaging.
6. Optional encrypted sync, after the local core is reliable.

Dependencies retain their respective licenses. No project license has been selected yet.
