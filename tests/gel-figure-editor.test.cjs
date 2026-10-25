/*
 * Browser regression coverage for the single-file gel editor.
 * Run: NODE_PATH=/path/to/node_modules node --test tests/gel-figure-editor.test.cjs
 * Requires Playwright and a locally installed Chrome (or CHROME_PATH).
 * The original commit is loaded in the same browser for numerical comparisons.
 */
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { chromium } = require('playwright');

const repo = path.resolve(__dirname, '..');
const baseRef = '9a073d136a323840a66a7842abb628d6dc5d7604';
const original = execFileSync('git', ['show', `${baseRef}:gel-analyzer.html`], { cwd: repo, encoding: 'utf8' });
let browser;
let current;
let baseline;

async function openEditor(html = current, viewport = { width: 1440, height: 1000 }) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => { loadDemo(); flush(); });
  page.errors = errors;
  return page;
}

async function analysisSnapshot(page) {
  return page.evaluate(() => {
    const hash = values => { let h = 2166136261; for (const v of values) h = Math.imul(h ^ Math.round(v * 1000), 16777619); return h >>> 0; };
    const modelFits = {};
    for (const model of ['linear', 'quadratic', 'cubic', 'p2p']) {
      state.calib.model = model; calibrate();
      const f = state.calib.fit;
      modelFits[model] = { r2: f.r2, points: state.calib.points.map(p => [p.x, p.y]),
        predictions: [.1, .3, .5, .7].map(x => f.predict(x)),
        bands: state.lanes.map(L => L.bands.map(b => [b.rf, b.pos, b.area, b.height, b.est, b.extrap])) };
    }
    state.calib.model = 'linear'; calibrate();
    return { dimensions: [state.img.width, state.img.height], pixels: hash(state.img.gray),
      lanes: state.lanes.map(L => [L.xTop, L.xBot, L.width, L.dyTop, L.dyBot, L.isLadder]), modelFits };
  });
}

before(async () => {
  const candidates = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean);
  const executablePath = candidates.find(p => fs.existsSync(p));
  browser = await chromium.launch({ executablePath, headless: true });
  current = fs.readFileSync(path.join(repo, 'gel-analyzer.html'), 'utf8');
  const page = await openEditor(original);
  baseline = await analysisSnapshot(page);
  assert.deepEqual(page.errors, []);
  await page.close();
});
after(async () => { if (browser) await browser.close(); });

test('unchanged demo analysis and all four calibration models match the original application', async () => {
  const page = await openEditor();
  try {
    assert.deepEqual(await analysisSnapshot(page), baseline);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('manual guide positions retain bp identity, recalibrate, and survive reanalysis', async () => {
  const page = await openEditor();
  try {
    const result = await page.evaluate(() => {
      const guides = getCalibrationGuides();
      const target = guides[3], originalY = target.y;
      const ids = guides.map(g => [g.id, g.size]);
      const oldPredictions = {}, newPredictions = {};
      for (const model of ['linear', 'quadratic', 'cubic', 'p2p']) { state.calib.model = model; calibrate(); oldPredictions[model] = state.calib.fit.predict(.2); }
      beginCalibrationGuideEdit(target.id);
      moveCalibrationGuide(target.id, target.y + 5);
      for (const model of ['linear', 'quadratic', 'cubic', 'p2p']) { state.calib.model = model; calibrate(); newPredictions[model] = state.calib.fit.predict(.2); }
      const moved = getCalibrationGuides().find(g => g.id === target.id);
      const afterMove = { y: moved.y, confirmed: moved.confirmed, ids: getCalibrationGuides().map(g => [g.id, g.size]) };
      analyzeAll();
      const afterAnalysis = getCalibrationGuides().find(g => g.id === target.id).y;
      moveCalibrationGuide(target.id, guides[5].y + 1);
      const afterCross = getCalibrationGuides().map(g => [g.id, g.size]);
      moveCalibrationGuide(target.id, -100);
      const minY = getCalibrationGuides().find(g => g.id === target.id).y;
      moveCalibrationGuide(target.id, state.img.height + 100);
      const maxY = getCalibrationGuides().find(g => g.id === target.id).y;
      const L = ladderLane();
      return { ids, afterMove, originalY, afterAnalysis, afterCross, oldPredictions, newPredictions,
        minY, maxY, laneRange: [laneTop(L), laneBot(L)], imageHeight: state.img.height };
    });
    assert.deepEqual(result.afterMove.ids, result.ids);
    assert.deepEqual(result.afterCross, result.ids);
    assert.equal(result.afterMove.y, result.originalY + 5);
    assert.equal(result.afterMove.confirmed, true);
    assert.equal(result.afterAnalysis, result.afterMove.y);
    for (const model of Object.keys(result.oldPredictions)) assert.notEqual(result.newPredictions[model], result.oldPredictions[model], model);
    assert.ok(result.minY >= Math.max(0, result.laneRange[0]));
    assert.ok(result.maxY <= Math.min(result.imageHeight - 1, result.laneRange[1]));
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('a moved calibration marker does not leave stale assigned labels or CSV sizes behind', async () => {
  const page = await openEditor();
  try {
    const result = await page.evaluate(async () => {
      goStep(5);
      const L = ladderLane(), band = L.bands[3], guide = getCalibrationGuides()[3];
      const original = { assigned: assignedLadderSize(L, band), label: bandLabel(L, band, 3, 'size'), estimate: band.est };
      beginEdit(); beginCalibrationGuideEdit(guide.id); moveCalibrationGuide(guide.id, guide.y + 15); endEdit();
      let blob; download = value => { blob = value; }; exportCSV();
      const row = (await blob.text()).split('\r\n').find(line => line.startsWith('1,,Ladder,4,'));
      const edited = { assigned: assignedLadderSize(L, band), label: bandLabel(L, band, 3, 'size'), estimate: band.est, row };
      undo();
      const restored = { assigned: assignedLadderSize(L, band), label: bandLabel(L, band, 3, 'size'), estimate: band.est };
      return { original, edited, restored };
    });
    assert.equal(result.original.assigned, 5000);
    assert.equal(result.edited.assigned, null);
    assert.equal(result.edited.label, '');
    assert.notEqual(result.edited.estimate, result.original.estimate);
    assert.equal(result.edited.row.split(',')[7], '');
    assert.deepEqual(result.restored, result.original);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('calibration undo restores the preset, sizes, offset, model and ladder identity with its guides', async () => {
  const page = await openEditor();
  try {
    const result = await page.evaluate(() => {
      goStep(5);
      const guide = getCalibrationGuides()[3];
      beginCalibrationGuideEdit(guide.id); moveCalibrationGuide(guide.id, guide.y + 5);
      const snapshot = () => ({ preset: state.calib.preset, sizes: state.calib.sizes, offset: state.calib.offset,
        model: state.calib.model, laneId: ladderLane()?.id, guides: getCalibrationGuides().map(g => ({ ...g })) });
      const initial = JSON.parse(JSON.stringify(snapshot()));
      beginEdit();
      state.calib.preset = 'generuler-100bp'; state.calib.sizes = LADDER_PRESETS['generuler-100bp'].sizes.slice(); state.calib.offset = 1; state.calib.model = 'quadratic';
      setLadder(state.lanes[5]); flush(); endEdit();
      const changed = JSON.parse(JSON.stringify(snapshot()));
      undo(); const undone = JSON.parse(JSON.stringify(snapshot()));
      redo(); const redone = JSON.parse(JSON.stringify(snapshot()));
      return { initial, changed, undone, redone };
    });
    assert.notDeepEqual(result.changed, result.initial);
    assert.deepEqual(result.undone, result.initial);
    assert.deepEqual(result.redone, result.changed);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('dragging a ladder guide uses image coordinates at the current zoom', async () => {
  const page = await openEditor();
  try {
    for (const step of [4, 5]) {
      const target = await page.evaluate(step => {
        loadDemo(); goStep(step); fitView(); flush();
        const guide = getCalibrationGuides()[3], L = ladderLane();
        const layout = getFigureLayout(), panel = layout.panels[0];
        const point = sourceToFigure({ x: laneCenterAt(L, guide.y) - L.width * .4, y: guide.y }, panel);
        const p = toScreen(point.x, point.y), r = gel.canvas.getBoundingClientRect();
        return { id: guide.id, y: guide.y, scale: state.view.scale, x: r.left + p.x, screenY: r.top + p.y };
      }, step);
      await page.mouse.move(target.x, target.screenY);
      await page.mouse.down();
      await page.mouse.move(target.x + 12, target.screenY + 9, { steps: 5 });
      await page.mouse.up();
      const moved = await page.evaluate(id => getCalibrationGuides().find(g => g.id === id), target.id);
      assert.ok(Math.abs(moved.y - (target.y + 9 / target.scale)) < 1, `step ${step}: expected y ${target.y + 9 / target.scale}; got ${moved.y}`);
      assert.equal(moved.id, target.id);
    }
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('spliced figure transforms round-trip and exclude gutters and gaps without changing analysis', async () => {
  const page = await openEditor();
  try {
    const before = await analysisSnapshot(page);
    const result = await page.evaluate(() => {
      goStep(5);
      Object.assign(state.annot.figure, { spliced: true, cropY: [80, 660], cutouts: [{ id: 100, x: 80, width: 100 }, { id: 101, x: 350, width: 90 }], callouts: [{ id: 102, y: 300, visible: true }] });
      const layout = getFigureLayout();
      const roundTrips = layout.panels.map(panel => {
        const p = { x: panel.sx + panel.sw / 2, y: panel.sy + panel.sh / 2 };
        const projected = sourceToFigure(p, panel, layout);
        return { source: p, restored: figureToSource(projected, layout), projected };
      });
      const first = layout.panels[0], second = layout.panels[1];
      const gap = figureToSource({ x: (first.dx + first.sw + second.dx) / 2, y: first.dy + 20 }, layout);
      const margin = figureToSource({ x: 1, y: 1 }, layout);
      drawGel();
      return { layout, roundTrips, gap, margin };
    });
    assert.equal(result.layout.panels.length, 2);
    assert.equal(result.layout.panels[0].sy, 80);
    assert.equal(result.layout.panels[0].sh, 580);
    assert.equal(result.gap, null);
    assert.equal(result.margin, null);
    for (const pair of result.roundTrips) {
      assert.equal(pair.restored.x, pair.source.x);
      assert.equal(pair.restored.y, pair.source.y);
    }
    assert.deepEqual(await analysisSnapshot(page), before);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('figure and guide edits undo and redo atomically', async () => {
  const page = await openEditor();
  try {
    const result = await page.evaluate(() => {
      goStep(5);
      const initial = annotSnapshot();
      beginEdit();
      Object.assign(state.annot.figure, { angleHeaders: true, spliced: true, cropY: [60, 650], cutouts: [{ id: 500, x: 60, width: 120 }], callouts: [{ id: 501, y: 250, visible: true }] });
      const guide = getCalibrationGuides()[2];
      beginCalibrationGuideEdit(guide.id); moveCalibrationGuide(guide.id, guide.y + 4);
      endEdit();
      const edited = annotSnapshot();
      undo(); const undone = annotSnapshot();
      redo(); const redone = annotSnapshot();
      return { initial, edited, undone, redone };
    });
    assert.notEqual(result.initial, result.edited);
    assert.equal(result.undone, result.initial);
    assert.equal(result.redone, result.edited);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('double-click edits headers inline and keyboard navigation commits or cancels correctly', async () => {
  const page = await openEditor();
  try {
    const point = await page.evaluate(() => {
      goStep(5); fitView(); flush();
      const e = projectedFigureElements().find(e => e.kind === 'laneLabel' && e.lane === state.lanes[1]);
      const p = toScreen(e.x, e.y - e.size * .25), r = gel.canvas.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    });
    await page.mouse.dblclick(point.x, point.y);
    const input = page.locator('#laneInlineEditor');
    await input.waitFor({ state: 'visible' });
    await input.fill('Sample 1');
    await input.press('Enter');
    assert.equal(await page.evaluate(() => inlineLaneEdit.lane.id), 3);
    await input.fill('Sample 2');
    await input.press('Tab');
    assert.equal(await page.evaluate(() => inlineLaneEdit.lane.id), 4);
    await input.press('Shift+Tab');
    assert.equal(await page.evaluate(() => inlineLaneEdit.lane.id), 3);
    await input.fill('Cancelled name');
    await input.press('Escape');
    const result = await page.evaluate(() => {
      state.lanes[0].numLab = { text: 'A' }; state.annot.figure.angleHeaders = true;
      return { names: state.lanes.slice(0, 3).map(L => L.numLab?.text), editing: inlineLaneEdit,
        angles: projectedFigureElements().filter(e => e.kind === 'laneLabel').slice(0, 3).map(e => e.angle) };
    });
    assert.deepEqual(result.names, ['A', 'Sample 1', 'Sample 2']);
    assert.equal(result.editing, null);
    assert.equal(result.angles[0], 0);
    assert.equal(result.angles[1], -Math.PI / 4);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('Done and Cancel preserve committed cutouts and source arrays', async () => {
  const page = await openEditor();
  try {
    const result = await page.evaluate(() => {
      goStep(5);
      const img = state.img, base = state.base, display = state.dispCanvas;
      startCutoutEdit();
      cutoutEdit.cutouts = [{ id: 600, x: 100, width: 80 }, { id: 601, x: 500, width: 90 }];
      cutoutEdit.cropY = [100, 600];
      finishCutoutEdit(true);
      const committed = JSON.stringify(state.annot.figure);
      startCutoutEdit();
      cutoutEdit.cutouts[0].x = 200;
      finishCutoutEdit(false);
      return { committed, cancelled: JSON.stringify(state.annot.figure), sameSource: state.img === img && state.base === base && state.dispCanvas === display };
    });
    assert.equal(result.cancelled, result.committed);
    assert.equal(result.sameSource, true);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('pointer gestures draw and resize cutouts, then toggle right-side callouts in the spliced view', async () => {
  const page = await openEditor();
  const sourcePoint = async (x, y, panelIndex = 0) => page.evaluate(({ x, y, panelIndex }) => {
    const layout = getFigureLayout(), f = sourceToFigure({ x, y }, layout.panels[panelIndex]), p = toScreen(f.x, f.y), r = gel.canvas.getBoundingClientRect();
    return { x: r.left + p.x, y: r.top + p.y };
  }, { x, y, panelIndex });
  const dragPointer = async (a, b) => { await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up(); };
  try {
    await page.evaluate(() => { goStep(5); fitView(); flush(); });
    await page.locator('#btnAddCutout').click();
    await dragPointer(await sourcePoint(60, 90), await sourcePoint(140, 650));
    await dragPointer(await sourcePoint(350, 200), await sourcePoint(450, 500));
    await dragPointer(await sourcePoint(450, 300), await sourcePoint(470, 300));
    await page.locator('#btnCutoutsDone').click();
    const figure = await page.evaluate(() => state.annot.figure);
    assert.equal(figure.cutouts.length, 2);
    assert.ok(Math.abs(figure.cutouts[1].width - 120) < 1);
    assert.ok(Math.abs(figure.cropY[0] - 90) < 1 && Math.abs(figure.cropY[1] - 650) < 1);
    assert.equal(figure.spliced, true);
    await page.locator('[data-tool="callout"]').click();
    const at = await sourcePoint(100, 330);
    await page.mouse.click(at.x, at.y);
    assert.deepEqual(await page.evaluate(() => state.annot.figure.callouts.map(c => c.visible)), [true]);
    await page.mouse.click(at.x, at.y);
    assert.deepEqual(await page.evaluate(() => state.annot.figure.callouts.map(c => c.visible)), [false]);
    await page.mouse.click(at.x, at.y);
    assert.deepEqual(await page.evaluate(() => state.annot.figure.callouts.map(c => c.visible)), [true]);
    const gap = await page.evaluate(() => {
      const l = getFigureLayout(), a = l.panels[0], b = l.panels[1], p = toScreen((a.dx + a.sw + b.dx) / 2, a.dy + 100), r = gel.canvas.getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y };
    });
    await page.mouse.click(gap.x, gap.y);
    assert.equal(await page.evaluate(() => state.annot.figure.callouts.length), 1);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('image upload and orientation changes clear stale figure edits', async () => {
  const page = await openEditor();
  try {
    const png = await page.evaluate(() => {
      Object.assign(state.annot.figure, { spliced: true, cutouts: [{ id: 800, x: 100, width: 80 }], callouts: [{ id: 801, y: 200, visible: true }] });
      const guide = getCalibrationGuides()[0]; moveCalibrationGuide(guide.id, guide.y + 3);
      return generateDemoGel().canvas.toDataURL('image/png').split(',')[1];
    });
    await page.locator('#fileInput').setInputFiles({ name: 'regression-upload.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
    await page.waitForFunction(() => state.fileName === 'regression-upload');
    const result = await page.evaluate(() => {
      flush();
      const uploaded = { size: [state.img.width, state.img.height], cutouts: state.annot.figure.cutouts.length, callouts: state.annot.figure.callouts.length, spliced: state.annot.figure.spliced, guides: state.calib.guides };
      Object.assign(state.annot.figure, { spliced: true, cutouts: [{ id: 802, x: 100, width: 80 }] });
      reorient('cw'); flush();
      return { uploaded, rotated: { size: [state.img.width, state.img.height], cutouts: state.annot.figure.cutouts.length, spliced: state.annot.figure.spliced } };
    });
    assert.deepEqual(result.uploaded.size, [1100, 760]);
    assert.equal(result.uploaded.cutouts, 0);
    assert.equal(result.uploaded.callouts, 0);
    assert.equal(result.uploaded.spliced, false);
    assert.equal(result.uploaded.guides, null);
    assert.deepEqual(result.rotated.size, [760, 1100]);
    assert.equal(result.rotated.cutouts, 0);
    assert.equal(result.rotated.spliced, false);
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('exports use composed dimensions and preserve PNG/JPEG/TIFF format metadata', async () => {
  const page = await openEditor();
  try {
    const result = await page.evaluate(async () => {
      goStep(5);
      Object.assign(state.annot.figure, { angleHeaders: true, spliced: true, cropY: [80, 660], cutouts: [{ id: 700, x: 40, width: 100 }, { id: 701, x: 350, width: 100 }], callouts: [{ id: 702, y: 300, visible: true }] });
      state.lanes[0].numLab = { text: 'Long sample name for export' };
      const layout = getFigureLayout();
      const downloads = [];
      download = (blob, name) => downloads.push({ blob, name });
      const files = [];
      const greenPixels = canvas => {
        const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > 70 && pixels[i + 1] > pixels[i] * 1.5 && pixels[i + 1] > pixels[i + 2] * 1.3) count++;
        return count;
      };
      const editedCanvas = document.createElement('canvas');
      editedCanvas.width = Math.round(layout.width); editedCanvas.height = Math.round(layout.height);
      drawComposition(editedCanvas.getContext('2d'), 1, 0, 0, { editing: true, layout });
      const editingGreenPixels = greenPixels(editedCanvas);
      let exportedGreenPixels;
      for (const scale of [1, 2, 4]) for (const format of ['png', 'jpeg', 'tiff']) {
        Object.assign(state.annot.exp, { format, scale, dpi: 300 });
        await exportImage();
        const entry = downloads.pop();
        if (!entry) throw new Error(`${format}: export did not produce a download`);
        const bytes = new Uint8Array(await entry.blob.arrayBuffer());
        let width, height;
        if (format === 'tiff') {
          const d = new DataView(bytes.buffer), le = bytes[0] === 73, ifd = d.getUint32(4, le), count = d.getUint16(ifd, le);
          for (let i = 0; i < count; i++) { const at = ifd + 2 + i * 12, tag = d.getUint16(at, le); if (tag === 256) width = d.getUint32(at + 8, le); if (tag === 257) height = d.getUint32(at + 8, le); }
        } else {
          const bitmap = await createImageBitmap(entry.blob); width = bitmap.width; height = bitmap.height;
          if (format === 'png' && scale === 1) {
            const exportedCanvas = document.createElement('canvas'); exportedCanvas.width = width; exportedCanvas.height = height;
            exportedCanvas.getContext('2d').drawImage(bitmap, 0, 0); exportedGreenPixels = greenPixels(exportedCanvas);
          }
          bitmap.close();
        }
        files.push({ format, scale, name: entry.name, width, height, signature: Array.from(bytes.slice(0, 4)), size: bytes.length });
      }
      return { layout: { width: layout.width, height: layout.height }, files, editingGreenPixels, exportedGreenPixels };
    });
    assert.equal(result.files.length, 9);
    for (const file of result.files) {
      assert.equal(file.width, Math.round(result.layout.width * file.scale), `${file.format} ${file.scale}x`);
      assert.equal(file.height, Math.round(result.layout.height * file.scale), `${file.format} ${file.scale}x`);
      assert.ok(file.size > 100, file.format);
      if (file.format === 'png') assert.deepEqual(file.signature, [137, 80, 78, 71]);
      else if (file.format === 'jpeg') assert.deepEqual(file.signature.slice(0, 2), [255, 216]);
      else assert.deepEqual(file.signature, [73, 73, 42, 0]);
    }
    assert.ok(result.editingGreenPixels > 0, 'editable green guides are visible on the grayscale demo');
    assert.equal(result.exportedGreenPixels, 0, 'export omits the editing guides');
    assert.deepEqual(page.errors, []);
  } finally { await page.close(); }
});

test('narrow touch viewport fits the composed figure and keeps panel mappings precise at HiDPI', async () => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  try {
    await page.setContent(current);
    const result = await page.evaluate(() => {
      loadDemo(); goStep(5);
      Object.assign(state.annot.figure, { spliced: true, cutouts: [{ id: 900, x: 50, width: 100 }, { id: 901, x: 400, width: 100 }], cropY: [50, 700], callouts: [{ id: 902, y: 250, visible: true }] });
      flush(); fitView(); drawGel();
      const layout = getFigureLayout(), a = toScreen(0, 0), z = toScreen(layout.width, layout.height);
      const panel = layout.panels[1], source = { x: panel.sx + 20.5, y: panel.sy + 70.25 };
      const point = sourceToFigure(source, panel, layout), restored = figureToSource(point, layout);
      return { a, z, canvas: { width: gel.w, height: gel.h }, restored, source,
        dpr: window.devicePixelRatio, touch: navigator.maxTouchPoints,
        pageWidth: document.documentElement.scrollWidth, viewport: window.innerWidth };
    });
    assert.ok(result.a.x >= 0 && result.a.y >= 0);
    assert.ok(result.z.x <= result.canvas.width + 1 && result.z.y <= result.canvas.height + 1);
    assert.ok(Math.abs(result.source.x - result.restored.x) < 1e-9);
    assert.ok(Math.abs(result.source.y - result.restored.y) < 1e-9);
    assert.equal(result.dpr, 3);
    assert.ok(result.touch > 0);
    assert.ok(result.pageWidth <= result.viewport + 1, `horizontal page overflow: ${result.pageWidth} > ${result.viewport}`);
    assert.deepEqual(errors, []);
  } finally { await context.close(); }
});
