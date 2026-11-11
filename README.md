# Local Reader

A local-first read-later browser extension. Save article text to an offline library with no account, backend, analytics, or subscriptions.

**Status: working starter, not a store-ready release.** Chrome/Edge Manifest V3, TypeScript, React, Mozilla Readability, DOMPurify, and IndexedDB. Images, video, PDFs, highlights, and CSV import are not implemented yet.

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
- Responsive, keyboard-accessible library and reader.
- Codespaces development configuration and GitHub Actions checks with a downloadable extension build.

## Privacy and durability

Only `activeTab`, `scripting`, and `contextMenus` are requested. There are no persistent host permissions, background crawling, telemetry, remote fonts, or remote code. IndexedDB does not require the `storage` permission. Capturing a page is initiated by the user, and sanitization strips forms, scripts, images, iframes, inline styles, and resource-loading attributes. Extension pages also block network connections and images with a Content Security Policy.

Saved data stays in this browser profile. **Uninstalling the extension or deleting the profile can erase it. Export backups regularly.** Storage quotas and disk availability still apply; local does not mean encrypted at rest. JSON backups contain plaintext article content and URLs. Restore sanitizes content again before saving. The reader sanitizes on display too.

## Tests

```sh
npm ci
npm run check
npx playwright install chromium
npm run test:e2e
```

On a fresh Linux environment use `npx playwright install --with-deps chromium`. The browser test uses a disposable extension build with access to one fixture domain so it can invoke capture without automating browser toolbar UI. It verifies real script injection, IndexedDB persistence, duplicate saves, offline reload, search, backup export/restore, and absence of reader network requests. The distributed manifest has no host permissions. Manual toolbar/context-menu testing in Chrome and Edge is still required before release.

## Next milestones

1. Pocket CSV import: map known export columns, preview rows, deduplicate, and distinguish bookmarks from available offline content. Use real export fixtures before promising compatibility.
2. Omnivore export adapters, validated against actual export formats.
3. Highlights, notes, read/archive state, and article management.
4. Optional image downloads with explicit permissions and storage limits.
5. Accessibility and extraction testing across real sites, store icons, privacy listing, and release packaging.
6. Optional encrypted sync, after the local core is reliable.

Dependencies retain their respective licenses. No project license has been selected yet.
