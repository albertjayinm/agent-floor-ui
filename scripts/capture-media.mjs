// Captures README screenshots and GIF frames from a running dev server: `npm run dev`, then `npm run media`.
import { chromium } from '@playwright/test';
import { mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const base = process.env.AF_URL ?? 'http://127.0.0.1:5173';
const media = fileURLToPath(new URL('../docs/media/', import.meta.url));
const framesDir = process.env.AF_FRAMES_DIR ?? fileURLToPath(new URL('../docs/media/.frames/', import.meta.url));
const macLauncher = fileURLToPath(new URL('../tests/chrome-macos.sh', import.meta.url));
const browser = await chromium.launch({
  ...(process.platform === 'darwin' ? { executablePath: macLauncher } : {}),
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
});

async function open(viewport, { scale = 2, appearance } = {}) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: scale });
  if (appearance) await context.addInitScript(value => localStorage.setItem('agent-floor-ui:appearance', value), JSON.stringify({ labels: true, shadows: true, motion: true, ...appearance }));
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-11-10T09:14:00') });
  // Paused before load: time only advances through runFor, so slow software WebGL can't make the demo skip ahead.
  await page.clock.pauseAt(new Date('2026-11-10T09:15:00'));
  await page.goto(base);
  await page.locator('.af-scene canvas').waitFor();
  await page.evaluate(() => document.fonts.ready);
  await page.clock.runFor(1200);
  return { context, page };
}

await mkdir(media, { recursive: true });

// Actionability checks wait on requestAnimationFrame, which the paused clock holds, so click and clip directly.
const press = locator => locator.dispatchEvent('click');
async function shootStage(page, path) {
  await page.screenshot({ path, clip: await page.locator('.af-stage').boundingBox() });
}

{
  const { context, page } = await open({ width: 1440, height: 900 });
  await press(page.getByRole('button', { name: /Nova Frontend engineer/ }));
  await page.clock.runFor(600);
  await page.screenshot({ path: `${media}hero.png` });
  await press(page.getByRole('button', { name: /Pixel Product designer/ }));
  await page.clock.runFor(600);
  await shootStage(page, `${media}task-card.png`);
  await context.close();
}

{
  const { context, page } = await open({ width: 1440, height: 1220 });
  await press(page.getByRole('group', { name: 'Floors' }).getByRole('button', { name: /Research loft/ }));
  await page.clock.runFor(300);
  await press(page.getByRole('button', { name: 'Customize floor' }));
  await page.clock.runFor(600);
  await page.screenshot({ path: `${media}floors.png` });
  await context.close();
}

for (const [name, appearance] of [['theme-midnight-voxel', { theme: 'midnight', art: 'voxel' }], ['theme-blueprint-wireframe', { theme: 'blueprint', art: 'wireframe' }]]) {
  const { context, page } = await open({ width: 1440, height: 900 }, { appearance });
  await shootStage(page, `${media}${name}.png`);
  await context.close();
}

{
  const { context, page } = await open({ width: 390, height: 844 }, { scale: 3 });
  await page.screenshot({ path: `${media}mobile.png` });
  await context.close();
}

const frameCount = Number(process.env.AF_GIF_FRAMES ?? 140);
if (frameCount > 0) {
  const { context, page } = await open({ width: 1280, height: 800 }, { scale: 1 });
  await press(page.getByRole('button', { name: /Nova Frontend engineer/ }));
  await page.clock.runFor(1300);
  await rm(framesDir, { recursive: true, force: true });
  await mkdir(framesDir, { recursive: true });
  for (let frame = 0; frame < frameCount; frame++) {
    await page.clock.runFor(83);
    await shootStage(page, `${framesDir}${String(frame).padStart(3, '0')}.png`);
  }
  await context.close();
  console.log(`GIF frames: ${framesDir}`);
}

await browser.close();
console.log(`Screenshots: ${media}`);
