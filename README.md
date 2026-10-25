# Thesis Calculator

A static, client-side workspace for research calculations, gel image analysis, and field data collection. Open the home page to choose a tool. No package installation or build step is required.

## Run locally

From the repository directory, start a static server:

```sh
python3 -m http.server 8000
```

Open <http://localhost:8000/> in a browser. Stop the server with `Ctrl+C`.

| Page | Tool |
| --- | --- |
| `index.html` | Research & Diagnostic Tools launcher |
| `gel-analyzer.html` | Agarose Gel Analyzer |
| `calculator.html` | Lab Calculator & Utilities |
| `field-collector.html` | Field Data Collector |

The older `/gel-analyzer/` route redirects to `gel-analyzer.html`.

## Gel analysis workflow

1. Load a PNG, JPEG, or TIFF image, paste an image, or load the demo gel.
2. Detect or define lanes, adjust lane geometry, and designate the ladder lane.
3. Review detected bands and add, move, or remove bands as needed.
4. Select the DNA ladder preset or enter known sizes, then review calibration.
5. Use **Annotate & Export** to compose the figure and export an image or results CSV.

Image display adjustments, lane analysis, calibration, and figure composition run in the browser. Cutouts change the figure composition; they do not remove image pixels or exclude lanes from the analysis or results CSV.

## Figure editing

### Lane headers

Double-click (or double-tap on a touch screen) a lane header to rename it inline; the selection inspector's text field also works. `Enter` or `Tab` commits the name and advances to the next visible lane; `Shift+Tab` moves to the previous visible lane. Navigation wraps at either end. `Escape` cancels the active edit. An empty name restores the automatic lane label.

Enable **Angle long headers** to rotate custom names longer than one trimmed character by −45°. Automatic lane numbers and single-character labels stay horizontal. Header changes use the same lane-label data as the existing annotation inspector and CSV export.

### Ladder guides and external ticks

The ladder lane has one green horizontal editing guide for each known ladder size. Drag a guide vertically to align it with a physical band. The corresponding external tick and size label move with it. In step 4 a click on a ladder band still moves the band, so grab a guide by its round handle just outside the lane edge (or type its Rf in the ladder table). If ladder bands are added, deleted or moved after guides were placed by hand, the calibration panel warns that the guides still define the fit; **Auto-assign** rebuilds them from the bands. **External bp ticks** is on by default and adds a **bp** heading in the left margin.

An unplaced guide is provisional and does not enter the calibration fit. Placing a guide creates or updates a manual ladder-band calibration point; review the resulting calibration before using estimated sizes. A manually placed guide assigns its known size to a detected band only when they are within three source-image pixels. Otherwise, that band's assigned ladder size stays blank in labels, results, and CSV. Green guides are editing aids and are omitted from exported figures. External ticks remain available in the figure.

Recheck calibration after changing image orientation. Fine rotation clears manually placed ladder guides and undo/redo history because the physical pixels have shifted. A 90° rotation or horizontal flip re-detects lanes and resets figure annotations.

### Lane cutouts

Use **Add cutout** to define vertical rectangles over the lanes to retain. Drag empty image space to draw a rectangle, drag its body to move it, or drag an edge to resize it. Choose **Done** to show the selected panels side by side with solid borders and gaps. **Cancel** discards the current cutout changes. Choosing **Done** after deleting every cutout returns the figure to the full gel. Undo and redo are paused while cutouts are being edited.

All cutouts share one vertical range and image scale, so bands keep their relative migration positions across panels. The cutout view retains the source image and source coordinates. **Add cutout** reopens the committed rectangles for editing. **Show original** switches between the original gel and the spliced view while retaining the committed cutouts.

### Band callouts

Choose the callout tool and click at a target band's height to create a dashed horizontal reference and a numbered leftward arrow in the right margin. Clicks near detected bands snap to their row. Select a callout to drag it vertically, change its visibility, or delete it through the inspector. Callout positions follow the same image coordinates in the full gel and cutout views.

### Coordinates, history, and export

Figure geometry stays in the analyzer's working-image pixel coordinate system, after the existing import size limits and orientation processing; these coordinates may differ from the original upload's full-resolution pixels, and the existing downscale behavior is unchanged. Zoom, pan, responsive resizing, and cutout placement are view transforms. The image and annotations use the same transforms for pointer input, preview, and export.

Use the existing **Undo** and **Redo** controls for committed figure edits. `Ctrl+Z` / `Cmd+Z` undoes an edit; `Ctrl+Shift+Z` / `Cmd+Shift+Z` redoes it. Each drag is one edit. Calibration settings changed in step 4 (ladder preset, sizes, offset, assignments, fit model, ladder lane) are recorded as their own undo steps, so undoing a figure edit never reverts a later calibration change. Zoom is kept when moving between steps 4 and 5 and when margins change; press **Fit** or `F` to refit.

Image exports use the selected PNG, TIFF, or JPEG format, resolution, and DPI metadata. The figure includes the visible headers, external ladder scale, cutout borders, and callouts, with white outer margins and black tick/callout text. Panels retain the image's displayed colors. Editing handles and green guides are excluded. Results CSV still includes every analyzed lane; profile CSV still exports the selected lane's profile.

## Implementation

The application is plain HTML, CSS, and JavaScript. The gel analyzer keeps its image, lane geometry, bands, calibration, and figure annotations in the existing `state` object. New interactions extend that state and the existing Canvas renderer rather than introducing a second analysis model.

See [UPDATES.md](UPDATES.md) for the figure-editor changes and validation status.

## Browser regression tests

The optional development tests require Node.js, Git history containing baseline commit `9a073d1`, and Playwright. The application itself still has no runtime dependencies.

```sh
npm install --no-save --package-lock=false playwright
npx playwright install chromium
node --test tests/gel-figure-editor.test.cjs
```

The runner uses an installed Chrome when available, then falls back to Playwright's Chromium. Set `CHROME_PATH` to use a specific browser executable. If Playwright is installed outside the repository, set `NODE_PATH` to the directory containing that package.

All 20 browser regression tests passed in Chrome. They compare the demo's original analysis and four calibration models, exercise the new editing workflows, check export dimensions and format metadata, and cover desktop and mobile touch emulation. The mobile checks use a 390 × 844 browser viewport at device scale factor 3; they are not a native-device test.
