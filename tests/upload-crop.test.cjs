'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');

const html = fs.readFileSync(path.join(__dirname, '..', 'gel-analyzer.html'), 'utf8');
let browser;
before(async () => {
  const executablePath = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
  browser = await chromium.launch({ executablePath, headless: true });
});
after(async () => { if (browser) await browser.close(); });

async function openEditor(context = browser) {
  const page = await context.newPage();
  page.errors = [];
  page.on('pageerror', error => page.errors.push(error.message));
  await page.setContent(html, { waitUntil: 'load' });
  return page;
}
async function uploadPaddedPng(page) {
  const png = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 180; canvas.height = 140;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 180, 140);
    ctx.fillStyle = '#606060'; ctx.fillRect(25, 20, 130, 100);
    ctx.fillStyle = '#c0c0c0';
    for (let x = 35; x < 150; x += 20) for (const y of [40, 70, 100]) ctx.fillRect(x, y, 10, 3);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  await page.locator('#fileInput').setInputFiles({ name: 'padded-gel.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
  await page.waitForFunction(() => state.fileName === 'padded-gel');
  await page.evaluate(() => flush());
}
function tiff16(width, height, samples) {
  const tags = [[256, 4, width], [257, 4, height], [258, 3, 16], [259, 3, 1], [262, 3, 1], [273, 4, 0], [277, 3, 1], [278, 4, height], [279, 4, width * height * 2], [284, 3, 1]];
  const offset = 8 + 2 + tags.length * 12 + 4, buffer = Buffer.alloc(offset + width * height * 2);
  buffer.write('II'); buffer.writeUInt16LE(42, 2); buffer.writeUInt32LE(8, 4); buffer.writeUInt16LE(tags.length, 8);
  tags.forEach(([tag, type, value], index) => {
    const at = 10 + index * 12; buffer.writeUInt16LE(tag, at); buffer.writeUInt16LE(type, at + 2); buffer.writeUInt32LE(1, at + 4);
    buffer.writeUInt32LE(tag === 273 ? offset : value, at + 8);
  });
  samples.forEach((value, index) => buffer.writeUInt16LE(value, offset + index * 2));
  return buffer;
}

test('border detection trims a broad padded gel conservatively and leaves uncertain images intact', async () => {
  const page = await openEditor();
  try {
    const result = await page.evaluate(() => {
      const make = (fill = 0) => ({ width: 180, height: 140, gray: new Float32Array(180 * 140).fill(fill), rgba: null, bits: 16, origW: 180, origH: 140, scaled: false });
      const padded = make();
      for (let y = 20; y < 120; y++) for (let x = 25; x < 155; x++) padded.gray[y * 180 + x] = 0.5 + ((x + y) % 7) * 0.001;
      padded.gray[0] = 255; // A bright edge speck must not make the entire border part of the gel.
      const before = Array.from(padded.gray), rect = detectBlackBorderCrop(padded);
      const sparse = make(); for (let x = 60; x < 110; x++) sparse.gray[60 * 180 + x] = 200;
      return { rect, unchanged: before.every((v, i) => v === padded.gray[i]), blank: detectBlackBorderCrop(make()), full: detectBlackBorderCrop(make(80)), sparse: detectBlackBorderCrop(sparse) };
    });
    assert.ok(result.rect.x <= 25 && result.rect.y <= 20);
    assert.ok(result.rect.x + result.rect.width >= 155 && result.rect.y + result.rect.height >= 120, 'retain the entire gel including its edge signal');
    assert.ok(result.rect.width < 180 && result.rect.height < 140);
    assert.equal(result.unchanged, true);
    for (const rect of [result.blank, result.full, result.sparse]) assert.deepEqual(rect, { x: 0, y: 0, width: 180, height: 140 });
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('cropping copies exact grayscale and color samples without changing the retained source', async () => {
  const page = await openEditor();
  try {
    const result = await page.evaluate(() => {
      const gray = Float32Array.from({ length: 48 }, (_, i) => (i + 0.25) / 257), rgba = Uint8ClampedArray.from({ length: 192 }, (_, i) => (i * 17) % 256);
      const base = { width: 8, height: 6, gray, rgba, bits: 16, origW: 8, origH: 6, scaled: false };
      const before = [Array.from(gray), Array.from(rgba)], crop = cropImageBase(base, { x: 2, y: 1, width: 3, height: 4 });
      const expectedGray = [], expectedRgba = [];
      for (let y = 1; y < 5; y++) for (let x = 2; x < 5; x++) { const i = y * 8 + x; expectedGray.push(gray[i]); expectedRgba.push(...rgba.slice(i * 4, i * 4 + 4)); }
      const same = JSON.stringify(before) === JSON.stringify([Array.from(gray), Array.from(rgba)]);
      crop.gray[0] = 999; crop.rgba[0] = 99;
      return { size: [crop.width, crop.height], bits: crop.bits, orig: [crop.origW, crop.origH], gray: Array.from(crop.gray).slice(1), rgba: Array.from(crop.rgba).slice(1), expectedGray: expectedGray.slice(1), expectedRgba: expectedRgba.slice(1), same, independent: gray[10] !== 999 && rgba[40] !== 99 };
    });
    assert.deepEqual(result.size, [3, 4]); assert.equal(result.bits, 16); assert.deepEqual(result.orig, [8, 6]);
    assert.deepEqual(result.gray, result.expectedGray); assert.deepEqual(result.rgba, result.expectedRgba);
    assert.equal(result.same, true); assert.equal(result.independent, true);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('PNG upload removes black borders immediately and keeps the original available for recropping', async () => {
  const page = await openEditor();
  try {
    await page.evaluate(() => { loadDemo(); flush(); state.annot.caption = 'old figure'; });
    await uploadPaddedPng(page);
    const result = await page.evaluate(() => ({ size: [state.img.width, state.img.height], source: [state.importOriginal.width, state.importOriginal.height], crop: state.base.crop, dialog: $('#uploadCropDialog').open, caption: state.annot.caption, step: state.step, enabled: !$('#btnRecropImage').disabled }));
    assert.ok(result.size[0] < 180 && result.size[1] < 140);
    assert.deepEqual(result.source, [180, 140]); assert.equal(result.dialog, false); assert.equal(result.caption, ''); assert.equal(result.step, 1); assert.equal(result.enabled, true);
    assert.ok(result.crop.x <= 25 && result.crop.y <= 20);
    await page.locator('#btnRecropImage').click();
    assert.equal(await page.locator('#uploadCropDialog').evaluate(dialog => dialog.open), true);
    assert.deepEqual(await page.evaluate(() => uploadCrop.rect), { x: result.crop.x, y: result.crop.y, width: result.crop.width, height: result.crop.height });
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('manual crop Cancel preserves analysis and Apply can restore the complete original', async () => {
  const page = await openEditor();
  try {
    await uploadPaddedPng(page);
    const before = await page.evaluate(() => { state.annot.caption = 'keep until Apply'; return { gray: Array.from(state.base.gray), size: [state.base.width, state.base.height], lanes: state.lanes.map(L => [L.id, L.xTop, L.xBot]), crop: state.base.crop }; });
    await page.locator('#btnRecropImage').click();
    await page.locator('#cropX').fill('30'); await page.locator('#cropX').press('Tab');
    await page.locator('#btnCropFull').click();
    await page.locator('#btnCancelCrop').click();
    const cancelled = await page.evaluate(() => ({ gray: Array.from(state.base.gray), size: [state.base.width, state.base.height], lanes: state.lanes.map(L => [L.id, L.xTop, L.xBot]), crop: state.base.crop, caption: state.annot.caption, dialog: $('#uploadCropDialog').open }));
    assert.deepEqual(cancelled.gray, before.gray); assert.deepEqual(cancelled.size, before.size); assert.deepEqual(cancelled.lanes, before.lanes); assert.deepEqual(cancelled.crop, before.crop); assert.equal(cancelled.caption, 'keep until Apply'); assert.equal(cancelled.dialog, false);
    await page.locator('#btnRecropImage').click(); await page.locator('#btnCropFull').click(); await page.locator('#btnApplyCrop').click();
    const restored = await page.evaluate(() => ({ size: [state.img.width, state.img.height], caption: state.annot.caption, originalSame: state.base === state.importOriginal, dialog: $('#uploadCropDialog').open }));
    assert.deepEqual(restored.size, [180, 140]); assert.equal(restored.caption, ''); assert.equal(restored.originalSame, true); assert.equal(restored.dialog, false);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('manual crop pointer gestures draw, move and resize before an explicit Apply', async () => {
  const page = await openEditor();
  try {
    await uploadPaddedPng(page); const before = await page.evaluate(() => [state.img.width, state.img.height]); await page.locator('#btnRecropImage').click();
    const point = (x, y) => page.evaluate(({ x, y }) => { const r = $('#uploadCropCanvas').getBoundingClientRect(), v = uploadCrop.view; return { x: r.left + v.ox + x * v.s, y: r.top + v.oy + y * v.s }; }, { x, y });
    const drag = async (a, b) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up(); };
    await page.locator('#btnDrawCrop').click(); await drag(await point(40, 30), await point(100, 90));
    const drawn = await page.evaluate(() => ({ ...uploadCrop.rect })); assert.ok(Math.abs(drawn.x - 40) <= 1 && Math.abs(drawn.y - 30) <= 1 && Math.abs(drawn.width - 60) <= 1 && Math.abs(drawn.height - 60) <= 1);
    await drag(await point(70, 60), await point(80, 65));
    const moved = await page.evaluate(() => ({ ...uploadCrop.rect })); assert.ok(Math.abs(moved.x - drawn.x - 10) <= 1 && Math.abs(moved.y - drawn.y - 5) <= 1);
    await drag(await point(moved.x + moved.width, moved.y + moved.height / 2), await point(moved.x + moved.width + 10, moved.y + moved.height / 2));
    const resized = await page.evaluate(() => ({ ...uploadCrop.rect })); assert.ok(Math.abs(resized.width - moved.width - 10) <= 1);
    assert.deepEqual(await page.evaluate(() => [state.img.width, state.img.height]), before, 'draft gestures leave the active analysis intact');
    await page.locator('#btnApplyCrop').click(); assert.deepEqual(await page.evaluate(() => [state.img.width, state.img.height]), [resized.width, resized.height]);
    await page.locator('#btnRecropImage').click(); await page.locator('#btnDrawCrop').click();
    const bottomRight = await point(180, 140), topLeft = await point(0, 0);
    await drag({ x: bottomRight.x - 0.5, y: bottomRight.y - 0.5 }, { x: topLeft.x + 0.5, y: topLeft.y + 0.5 });
    assert.deepEqual(await page.evaluate(() => uploadCrop.rect), { x: 0, y: 0, width: 180, height: 140 }, 'reverse drawing near the preview corners retains the last source row and column');
    await page.locator('#btnCancelCrop').click();
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('16-bit TIFF upload and manual recrop retain the decoder samples without 8-bit quantization', async () => {
  const page = await openEditor();
  try {
    const width = 80, height = 64, samples = Array.from({ length: width * height }, (_, i) => { const x = i % width, y = Math.floor(i / width); return x >= 10 && x < 70 && y >= 8 && y < 56 ? 200 + (x * 31 + y * 13) % 1000 : 0; });
    await page.locator('#fileInput').setInputFiles({ name: 'low-signal.tif', mimeType: 'image/tiff', buffer: tiff16(width, height, samples) });
    await page.waitForFunction(() => state.fileName === 'low-signal');
    const loaded = await page.evaluate(() => ({ bits: state.base.bits, original: [state.importOriginal.width, state.importOriginal.height], size: [state.base.width, state.base.height], all: Array.from(state.importOriginal.gray), dialog: $('#uploadCropDialog').open }));
    assert.equal(loaded.bits, 16); assert.deepEqual(loaded.original, [80, 64]); assert.equal(loaded.dialog, false); assert.ok(loaded.size[0] < 80 && loaded.size[1] < 64);
    const expected = samples.map(v => Math.fround(v / 257)); assert.deepEqual(loaded.all, expected);
    await page.locator('#btnRecropImage').click();
    for (const [id, value] of [['cropX', 12], ['cropY', 10], ['cropWidth', 30], ['cropHeight', 25]]) {
      const field = page.locator('#' + id);
      await field.fill(String(value));
      if (id === 'cropX') {
        await page.evaluate(() => renderUploadCrop());
        assert.equal(await field.inputValue(), '12', 'a preview repaint must preserve the focused coordinate before it commits');
      }
      await field.press('Tab');
    }
    assert.deepEqual(await page.evaluate(() => uploadCrop.rect), { x: 12, y: 10, width: 30, height: 25 });
    await page.locator('#btnApplyCrop').click();
    const cropped = await page.evaluate(() => ({ bits: state.base.bits, gray: Array.from(state.base.gray), original: Array.from(state.importOriginal.gray), size: [state.base.width, state.base.height] }));
    const selected = []; for (let y = 10; y < 35; y++) for (let x = 12; x < 42; x++) selected.push(expected[y * width + x]);
    assert.equal(cropped.bits, 16); assert.deepEqual(cropped.size, [30, 25]); assert.deepEqual(cropped.gray, selected); assert.deepEqual(cropped.original, expected);
    assert.ok(cropped.gray.some(v => v !== Math.round(v)), 'low-valued fractional samples are retained'); assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('the optional crop dialog fits a narrow touch viewport and Escape cancels its draft', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await openEditor(context);
  try {
    await uploadPaddedPng(page); const before = await page.evaluate(() => [state.img.width, state.img.height]); await page.locator('#btnRecropImage').tap();
    const bounds = await page.locator('#uploadCropDialog').boundingBox(); assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 391);
    await page.locator('#btnCropFull').tap(); await page.keyboard.press('Escape');
    assert.equal(await page.locator('#uploadCropDialog').evaluate(dialog => dialog.open), false); assert.deepEqual(await page.evaluate(() => [state.img.width, state.img.height]), before); assert.deepEqual(page.errors, []);
  } finally { await context.close(); }
});
