import { test, expect, chromium } from '@playwright/test';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { readFile } from 'node:fs/promises';

test('saves a real page, deduplicates, reads offline, searches and restores a backup', async ({}, testInfo) => {
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
  await writeFile(resolve(testExtension, 'manifest.json'), JSON.stringify(manifest));
  // Chromium's IndexedDB filenames can exceed Windows path limits when the
  // persistent profile lives inside a long test-results directory.
  const profilePrefix = join(tmpdir(), 'local-reader-test-');
  const profile = await mkdtemp(profilePrefix);
  const context = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true,
    args: [`--disable-extensions-except=${testExtension}`, `--load-extension=${testExtension}`],
  });
  try {
    const worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = new URL(worker.url()).host;
    const page = await context.newPage();
    const paragraph = 'Offline libraries give readers a lasting home for their research. The unusual keyword marmalade makes this article easy to find. Keeping a complete text copy means the passage remains available when the network disappears. ';
    await page.route('https://example.com/story', route => route.fulfill({ contentType: 'text/html', body: `<html><head><title>A lasting library</title></head><body><article><h1>A lasting library</h1>${Array.from({ length: 8 }, () => `<p>${paragraph}</p>`).join('')}<img src="https://tracker.invalid/pixel"></article></body></html>` }));
    await page.goto('https://example.com/story');
    async function capture() {
      return worker.evaluate(async () => {
        const tabs = await chrome.tabs.query({ url: 'https://example.com/story' });
        return (globalThis as unknown as { testCapture: (tab: chrome.tabs.Tab) => Promise<string> }).testCapture(tabs[0]);
      });
    }
    expect(await capture()).toBe('https://example.com/story');
    await capture();
    const reader = await context.newPage();
    const remoteRequests: string[] = [];
    reader.on('request', request => { if (/^https?:/.test(request.url())) remoteRequests.push(request.url()); });
    await context.setOffline(true);
    await reader.goto(`chrome-extension://${id}/library.html`);
    await expect(reader.getByText('1 saved', { exact: true })).toBeVisible();
    await reader.getByRole('searchbox').fill('marmalade');
    await expect(reader.getByRole('heading', { name: 'A lasting library', exact: true })).toBeVisible();
    await reader.getByRole('heading', { name: 'A lasting library', exact: true }).click();
    await reader.reload();
    await expect(reader.locator('.reader-content')).toContainText('network disappears');
    expect(await reader.locator('.reader-content img, .reader-content script, .reader-content iframe').count()).toBe(0);
    expect(remoteRequests).toEqual([]);
    await reader.screenshot({ path: testInfo.outputPath('reader.png'), fullPage: true });
    await reader.getByRole('button', { name: 'Back to library' }).click();
    await reader.getByRole('searchbox').fill('not-in-this-article');
    await expect(reader.getByRole('heading', { name: 'No matching reads' })).toBeVisible();
    await reader.getByRole('searchbox').fill('');
    const downloadPromise = reader.waitForEvent('download');
    await reader.getByRole('button', { name: 'Export backup' }).click();
    const download = await downloadPromise;
    const backup = JSON.parse(await readFile((await download.path())!, 'utf8'));
    expect(backup.articles).toHaveLength(1);
    expect(backup.articles[0].text).toContain('marmalade');
    backup.articles[0].url = 'https://example.com/restored';
    backup.articles[0].title = 'Restored article';
    backup.articles[0].content += '<img src="https://evil.invalid/pixel"><script>alert(1)</script>';
    await reader.getByLabel('Restore backup file').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)) });
    await expect(reader.getByRole('status')).toContainText('Restored 1 article');
    await expect(reader.getByText('2 saved', { exact: true })).toBeVisible();
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
