import { test, expect, chromium } from '@playwright/test';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';

test('reads offline, searches, restores a backup, and imports Pocket bookmarks', async ({}, testInfo) => {
  const extension = resolve('dist');
  // Host access is granted only in this disposable test build. The distributed
  // manifest uses activeTab, which is granted by a real toolbar/menu click.
  const { cp, mkdir, writeFile, mkdtemp, rm } = await import('node:fs/promises');
  const testExtension = testInfo.outputPath('extension');
  await mkdir(testExtension, { recursive: true });
  await cp(extension, testExtension, { recursive: true });
  const manifest = JSON.parse(await readFile(resolve(testExtension, 'manifest.json'), 'utf8'));
  expect(manifest.host_permissions).toBeUndefined();
  expect(manifest.permissions).toEqual(['activeTab', 'scripting', 'contextMenus']);
  manifest.host_permissions = ['https://example.com/*'];
  manifest.background.service_worker = 'test-worker.js';
  await writeFile(resolve(testExtension, 'test-worker.js'), "import { captureTab } from './background.js'; globalThis.testCapture = captureTab;");
  await writeFile(resolve(testExtension, 'test-init.html'), '<!doctype html><title>Test setup</title>');
  await writeFile(resolve(testExtension, 'manifest.json'), JSON.stringify(manifest));
  // Chromium's IndexedDB filenames can exceed Windows path limits when the
  // persistent profile lives inside a long test-results directory.
  const profilePrefix = join(process.platform === 'win32' ? 'C:/Users/ako/Documents/Codex' : tmpdir(), 'local-reader-test-');
  const profile = await mkdtemp(profilePrefix);
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    acceptDownloads: true,
    args: [`--disable-extensions-except=${testExtension}`, `--load-extension=${testExtension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const init = await context.newPage();
    await init.goto(`chrome-extension://${id}/test-init.html`);
    await init.evaluate(() => new Promise<void>((resolve, reject) => {
      const request = indexedDB.open('local-reader', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('articles', { keyPath: 'url' });
      request.onsuccess = () => { request.result.close(); resolve(); };
      request.onerror = () => reject(request.error);
    }));
    const paragraph = 'Offline libraries give readers a lasting home for their research. The unusual keyword marmalade makes this article easy to find. Keeping a complete text copy means the passage remains available when the network disappears. ';
    const reader = await context.newPage();
    const remoteRequests: string[] = [];
    reader.on('request', request => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()); });
    await reader.goto(`chrome-extension://${id}/library.html`);
    const seed = { format: 'local-reader', version: 2, articles: [{ url: 'https://example.com/story', title: 'A lasting library', byline: '', content: `<p>${paragraph}</p>`, text: paragraph, savedAt: 1_700_000_000_000, tags: [], state: 'unread', favorite: false, source: 'saved' }] };
    await reader.getByLabel('Restore backup file').setInputFiles({ name: 'seed.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(seed)) });
    await expect(reader.getByRole('status')).toContainText('Restored 1 article');
    await expect(reader.getByText('1 saved', { exact: true })).toBeVisible();
    await reader.getByRole('searchbox').fill('marmalade');
    await expect(reader.getByRole('heading', { name: 'A lasting library', exact: true })).toBeVisible();
    await reader.getByRole('heading', { name: 'A lasting library', exact: true }).click();
    await context.setOffline(true);
    await reader.reload();
    await expect(reader.locator('.reader-content')).toContainText('network disappears');
    expect(await reader.locator('.reader-content img, .reader-content script, .reader-content iframe').count()).toBe(0);
    expect(remoteRequests).toEqual([]);
    await context.setOffline(false);
    await reader.screenshot({ path: testInfo.outputPath('reader.png'), fullPage: true });
    await reader.getByRole('button', { name: 'Back to library' }).click();
    await reader.getByRole('searchbox').fill('not-in-this-article');
    await expect(reader.getByRole('heading', { name: 'No matching reads' })).toBeVisible();
    await reader.getByRole('searchbox').fill('');
    const backup = structuredClone(seed);
    expect(backup.articles).toHaveLength(1);
    expect(backup.articles[0].text).toContain('marmalade');
    backup.articles[0].url = 'https://example.com/restored';
    backup.articles[0].title = 'Restored article';
    backup.articles[0].content += '<img src="https://evil.invalid/pixel"><script>alert(1)</script>';
    await reader.getByLabel('Restore backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await expect(reader.getByRole('status')).toContainText('Restored 1 article');
    await expect(reader.getByText('2 saved', { exact: true })).toBeVisible();
    const pocketCsv = 'title,url,time_added,tags,status,favorite\n"Pocket, research",https://example.com/pocket#keep,1700000000,"research, offline",0,1\nRepeated,https://example.com/pocket,1700000001,,0,0\nArchived,https://example.com/archive,1700000002,ideas,1,0';
    await reader.getByLabel('Choose Pocket CSV').setInputFiles({ name: 'ril_export.csv', mimeType: 'text/csv', buffer: Buffer.from(pocketCsv) });
    await expect(reader.getByRole('heading', { name: '2 bookmarks ready to import.' })).toBeVisible();
    await reader.getByRole('button', { name: 'Import bookmarks' }).click();
    await expect(reader.getByRole('status')).toContainText('Imported 2 Pocket bookmarks');
    await expect(reader.getByText('4 saved', { exact: true })).toBeVisible();
    await reader.getByRole('heading', { name: 'Pocket, research', exact: true }).click();
    await expect(reader.getByRole('heading', { name: 'This is a bookmark, not an offline copy.' })).toBeVisible();
    await expect(reader.locator('.reader-content')).toHaveCount(0);
    await reader.getByRole('button', { name: 'Back to library' }).click();
    await reader.screenshot({ path: testInfo.outputPath('library.png'), fullPage: true });
    await reader.setViewportSize({ width: 390, height: 844 });
    await reader.screenshot({ path: testInfo.outputPath('mobile.png'), fullPage: true });
    expect(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally {
    await context.close();
    if (!resolve(profile).startsWith(resolve(profilePrefix))) throw new Error('Unexpected test profile path');
    await rm(profile, { recursive: true, force: true });
  }
});
