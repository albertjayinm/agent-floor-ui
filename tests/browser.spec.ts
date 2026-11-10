import { test, expect, type Page } from '@playwright/test';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import { createRelay } from '../scripts/relay.mjs';
import { isFloorEvent } from '../src/protocol';

async function canvasState(page: Page) {
  return page.locator('.af-scene canvas').evaluate(canvas => {
    const element = canvas as HTMLCanvasElement;
    const gl = element.getContext('webgl2')!;
    const pixels = new Uint8Array(element.width * element.height * 4);
    gl.readPixels(0, 0, element.width, element.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    let occupied = 0;
    let hash = 0;
    const colors = new Set<number>();
    for (let offset = 0; offset < pixels.length; offset += 64) {
      if (pixels[offset + 3] > 200) occupied++;
      hash = ((hash * 31) + pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) | 0;
      colors.add((pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]);
    }
    return { coverage: occupied / (pixels.length / 64), hash, colors: colors.size };
  });
}

async function advanceFrames(page: Page, count = 6) {
  await page.evaluate(async frames => {
    for (let frame = 0; frame < frames; frame++) await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }, count);
}

test('desktop floor renders, animates, selects, and changes appearance', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await expect(page.locator('.af-scene canvas')).toBeVisible();
  await advanceFrames(page);
  const first = await canvasState(page);
  expect(first.coverage).toBeGreaterThan(0.08);
  expect(first.colors).toBeGreaterThan(60);
  await advanceFrames(page, 12);
  expect((await canvasState(page)).hash).not.toBe(first.hash);
  await page.screenshot({ path: 'test-results/desktop.png', fullPage: true });
  await page.getByRole('button', { name: /Atlas Orchestrator/ }).click();
  await expect(page.getByLabel('Move Atlas')).toBeVisible();
  await page.getByLabel('Move Atlas').selectOption('lab');
  await expect(page.getByLabel('Move Atlas')).toHaveValue('lab');
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'After hours' }).click();
  await page.getByRole('button', { name: 'Voxel', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.agent-floor')).toHaveClass(/af-theme-midnight/);
  await advanceFrames(page);
  expect((await canvasState(page)).coverage).toBeGreaterThan(0.08);
  await page.screenshot({ path: 'test-results/midnight-voxel.png', fullPage: true });
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await page.getByRole('button', { name: 'Blueprint', exact: true }).click();
  await page.getByRole('button', { name: 'Wireframe', exact: true }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await advanceFrames(page);
  expect((await canvasState(page)).colors).toBeGreaterThan(20);
  await page.screenshot({ path: 'test-results/blueprint-wireframe.png', fullPage: true });
  await page.getByLabel('Search agents').fill('nova');
  await expect(page.locator('.af-agent-row')).toHaveCount(1);
  await page.getByLabel('Search agents').fill('');
  await page.getByRole('button', { name: 'Pause movement' }).click();
  await expect(page.getByRole('button', { name: 'Resume movement' })).toBeVisible();
  await advanceFrames(page);
  const paused = await canvasState(page);
  await advanceFrames(page);
  expect((await canvasState(page)).hash).toBe(paused.hash);
  expect(errors).toEqual([]);
});

test('hovering or selecting a character shows its task status popup', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.locator('.af-scene canvas')).toBeVisible();
  await page.getByRole('button', { name: 'Pause movement' }).click();
  await page.getByRole('button', { name: /Atlas Orchestrator/ }).click();
  const popup = page.locator('.af-agent-popup');
  await expect(popup).toBeVisible();
  await expect(popup).toContainText('Atlas');
  await expect(popup).toContainText('Planning the next sprint');
  await expect(popup.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
  await advanceFrames(page, 4);
  await page.screenshot({ path: 'test-results/popup-pinned.png' });
  const anchor = (await popup.boundingBox())!;
  const below = (await popup.getAttribute('data-placement')) === 'below';
  await popup.getByRole('button', { name: 'Close details' }).click();
  await expect(popup).toHaveCount(0);
  const canvas = page.locator('.af-scene canvas');
  let hovered = false;
  for (let offset = 20; offset < 220 && !hovered; offset += 6) {
    await page.mouse.move(anchor.x + anchor.width / 2, below ? anchor.y - offset : anchor.y + anchor.height + offset);
    await advanceFrames(page, 2);
    hovered = await popup.isVisible();
  }
  expect(hovered).toBe(true);
  await expect(popup).toContainText('Atlas');
  await expect(popup).not.toHaveClass(/pinned/);
  await expect(canvas).toHaveCSS('cursor', 'pointer');
  await page.mouse.move(5, 5);
  await expect(popup).toHaveCount(0);
});

test('floors can be added, customized, persisted, and populated', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const tabs = page.getByRole('group', { name: 'Floors' });
  await expect(tabs.getByRole('button', { name: /Main floor/ })).toHaveAttribute('aria-pressed', 'true');
  await tabs.getByRole('button', { name: /Research loft/ }).click();
  await expect(page.locator('.af-workspace-heading')).toContainText('Research loft');
  await tabs.getByRole('button', { name: 'Add floor' }).click();
  const dialog = page.getByRole('dialog', { name: 'Customize floor' });
  await expect(dialog).toBeVisible();
  await dialog.getByLabel('Floor name').fill('Design studio');
  await dialog.getByRole('button', { name: 'Concrete' }).click();
  await dialog.getByRole('button', { name: '6 desks' }).click();
  await dialog.getByRole('button', { name: 'Wall color #b8c7d9' }).click();
  await dialog.getByRole('switch', { name: 'Plants' }).uncheck();
  await advanceFrames(page);
  await dialog.getByRole('button', { name: 'Done' }).click();
  await expect(tabs.getByRole('button', { name: /Design studio/ })).toHaveAttribute('aria-pressed', 'true');
  await advanceFrames(page);
  expect((await canvasState(page)).coverage).toBeGreaterThan(0.08);
  await page.screenshot({ path: 'test-results/custom-floor.png', fullPage: true });
  await page.getByRole('button', { name: /Nova Frontend engineer/ }).click();
  await page.getByLabel('Floor for Nova').selectOption({ label: 'Design studio' });
  await expect(tabs.getByRole('button', { name: /Design studio/ })).toContainText('1');
  await expect(page.locator('.af-agent-popup')).toContainText('Design studio');
  await page.reload();
  await expect(tabs.getByRole('button', { name: /Design studio/ })).toBeVisible();
  await tabs.getByRole('button', { name: /Design studio/ }).click();
  await page.getByRole('button', { name: 'Customize floor' }).click();
  await expect(dialog.getByRole('button', { name: '6 desks' })).toHaveAttribute('aria-pressed', 'true');
  await expect(dialog.getByRole('switch', { name: 'Plants' })).not.toBeChecked();
  await dialog.getByRole('button', { name: 'Remove floor' }).click();
  await dialog.getByRole('button', { name: /Confirm/ }).click();
  await expect(tabs.getByRole('button', { name: /Design studio/ })).toHaveCount(0);
});

test('mobile floor stays framed and panels and dialogs fit', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.locator('.af-scene canvas')).toBeVisible();
  await advanceFrames(page);
  expect((await canvasState(page)).coverage).toBeGreaterThan(0.05);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true });
  await page.getByRole('button', { name: 'Agents', exact: true }).click();
  await page.getByRole('button', { name: /Nova Frontend engineer/ }).click();
  await expect(page.getByLabel('Move Nova')).toBeVisible();
  await page.getByRole('button', { name: 'Activity', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Live activity' })).toBeVisible();
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const bounds = await page.getByRole('dialog').boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.width).toBeLessThanOrEqual(390);
  await page.screenshot({ path: 'test-results/mobile-connect.png', fullPage: true });
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
});

test('real relay events replace the demo and update the live scene', async ({ page }) => {
  const server = createRelay({ validate: isFloorEvent });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const endpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/events`;
  const post = (body: unknown) => fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    await post({ type: 'agent.upsert', agent: { id: 'live-builder', name: 'Live Builder', role: 'Real adapter', color: '#58a278', status: 'working', task: 'Running a real integration', zone: 'desks' } });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Connect a project' }).click();
    await page.getByLabel('Server-sent events endpoint').fill(endpoint);
    await page.getByRole('button', { name: 'Connect event stream' }).click();
    await expect(page.locator('.af-agent-row')).toHaveCount(1);
    await expect(page.locator('.af-agent-row')).toContainText('Live Builder');
    await expect(page.locator('.af-source')).toContainText('Connected');
    await expect(page.locator('.af-feed-item')).toHaveCount(0);
    await post({ type: 'activity', id: 'live-builder', message: 'A real event arrived' });
    await expect(page.locator('.af-feed-item')).toContainText('A real event arrived');
    await post({ type: 'agent.move', id: 'live-builder', zone: 'lab' });
    await page.locator('.af-agent-row').click();
    await expect(page.getByLabel('Move Live Builder')).toHaveValue('lab');
    await advanceFrames(page);
    expect((await canvasState(page)).coverage).toBeGreaterThan(0.08);
    await page.screenshot({ path: 'test-results/live-source.png', fullPage: true });
    await post({ type: 'agent.remove', id: 'live-builder' });
    await expect(page.locator('.af-agent-row')).toHaveCount(0);
  } finally {
    await page.goto('about:blank');
    server.closeAllConnections();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});