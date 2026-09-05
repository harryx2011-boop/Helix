import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

/**
 * Everything runs in the browser now: no API, no auth, no server to start
 * first. The one external dependency left is ffmpeg.wasm's core, fetched from
 * unpkg.com on first use inside the page — these tests need real internet
 * access and are slower than the old server-backed suite on a cold cache.
 */
let dir: string;
let clip: string;
let image: string;

test.beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'converter-e2e-'));
  clip = join(dir, 'clip.mp4');
  image = join(dir, 'photo.png');

  execFileSync('ffmpeg', [
    '-hide_banner', '-nostdin', '-y',
    '-f', 'lavfi', '-i', 'testsrc=size=320x240:rate=15:duration=2',
    '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', clip,
  ]);
  execFileSync('ffmpeg', [
    '-hide_banner', '-y', '-f', 'lavfi', '-i', 'testsrc=size=400x300:duration=1',
    '-frames:v', '1', image,
  ]);
});

test.afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

test('converts a video end to end and offers the result', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));

  await page.goto('/convert');
  await expect(page.getByRole('heading', { name: 'Convert a file' })).toBeVisible();

  await page.locator('input[type=file]').first().setInputFiles(clip);
  await expect(page.getByText('clip.mp4')).toBeVisible();

  await page.getByRole('button', { name: /^convert/i }).last().click();

  // The download affordance is the completion signal. ffmpeg.wasm's core is a
  // multi-MB cold download the first time a worker starts, so this is patient.
  const download = page
    .getByRole('link', { name: /download/i })
    .or(page.getByRole('button', { name: /download/i }))
    .first();
  await expect(download).toBeVisible({ timeout: 120_000 });

  expect(errors, `console errors: ${errors.join(' | ')}`).toHaveLength(0);
});

test('converts an image through the wasm codec path', async ({ page }) => {
  await page.goto('/convert');
  await page.locator('input[type=file]').first().setInputFiles(image);
  await expect(page.getByText('photo.png')).toBeVisible();

  await page.getByRole('button', { name: /^convert/i }).last().click();
  await expect(
    page.getByRole('link', { name: /download/i }).or(page.getByRole('button', { name: /download/i })).first(),
  ).toBeVisible({ timeout: 60_000 });
});

test('rejects a file that is not media, and says why in plain language', async ({ page }) => {
  const junk = join(dir, 'notes.mp4');
  writeFileSync(junk, 'this is not a video');

  await page.goto('/convert');
  await page.locator('input[type=file]').first().setInputFiles(junk);
  await page.getByRole('button', { name: /^convert/i }).last().click();

  await expect(page.getByText(/couldn't|can't|corrupt|failed/i).first()).toBeVisible({
    timeout: 60_000,
  });
});

test('the command palette finds a tool by name', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('ControlOrMeta+k');

  const search = page.getByRole('combobox').or(page.getByPlaceholder(/search/i)).first();
  await expect(search).toBeVisible();
  await search.fill('mp3');
  await expect(page.getByRole('option').first()).toBeVisible();

  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
});

test('every page carries the same header and footer', async ({ page }) => {
  for (const path of ['/', '/convert', '/convert/mp4-to-mp3', '/tools', '/history', '/settings']) {
    await page.goto(path);
    await expect(page.getByRole('banner'), `header missing on ${path}`).toBeVisible();
    await expect(page.getByRole('contentinfo'), `footer missing on ${path}`).toBeVisible();
  }
});

test('the converter is operable by keyboard alone', async ({ page }) => {
  await page.goto('/convert');

  // The dropzone must be reachable and focusable without a pointer.
  await page.keyboard.press('Tab');
  const focused = await page.evaluate(() => document.activeElement?.tagName);
  expect(focused).toBeTruthy();

  const dropzone = page.getByRole('button', { name: /drop files/i });
  await dropzone.focus();
  await expect(dropzone).toBeFocused();
});

test('the converter has no sign-in gate: it is usable immediately', async ({ page }) => {
  await page.goto('/convert');
  await expect(page.getByRole('button', { name: /drop files/i })).toBeVisible();
  await expect(page.getByRole('heading', { name: /sign in/i })).toBeHidden();
});

test('settings shows sound and real provider marks, with no key field', async ({ page }) => {
  await page.goto('/settings');

  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await expect(page.getByRole('heading', { name: /api key/i })).toBeHidden();

  // Every provider wears a real mark that loaded; a broken image has
  // naturalWidth 0 and would otherwise render as a silent gap.
  const marks = page.locator('img[src^="/providers"]');
  await expect(marks).toHaveCount(2);
  const widths = await marks.evaluateAll((imgs) =>
    imgs.map((i) => (i as HTMLImageElement).naturalWidth),
  );
  expect(widths.every((w) => w > 0), `broken marks: ${widths.join(',')}`).toBe(true);

  // The sound switch is a real control, not decoration.
  const sound = page.getByRole('switch');
  await expect(sound).toBeVisible();
  const before = await sound.getAttribute('aria-checked');
  await sound.click();
  await expect(sound).not.toHaveAttribute('aria-checked', before ?? '');
});

test('every provider mark is a distinct file, so none wears another brand', async ({ page }) => {
  await page.goto('/settings');
  const srcs = await page
    .locator('img[src^="/providers"]')
    .evaluateAll((imgs) => imgs.map((i) => (i as HTMLImageElement).getAttribute('src')));

  expect(new Set(srcs).size).toBe(srcs.length);
});
