# Updates

## Gel figure editor

The gel analyzer adds interactive figure controls while retaining the existing upload, lane detection, signal processing, band analysis, calibration models, and export workflow. Changes are contained in `gel-analyzer.html`; the launcher and other tools retain their existing navigation.

### Added interactions

- Inline lane-header editing with next/previous keyboard navigation and cancellation.
- Optional −45° rotation for custom lane names longer than one trimmed character, with automatic lane numbers and single-character labels kept horizontal.
- Individually draggable green ladder guides and a live external **bp** scale.
- Provisional guide placement that creates or updates manual calibration points only after alignment.
- Non-destructive lane cutouts, a shared vertical crop range, side-by-side panel composition, solid borders, and gaps; **Cancel** discards draft changes and **Show original** retains committed cutouts.
- Numbered right-margin arrows with horizontal dashed band references.
- Preview and export support for figure margins, headers, ladder ticks, panel borders, and callouts.
- Undo and redo for committed figure edits, including one history entry per drag.

### Integration details

Figure positions remain in the analyzer's working-image pixel coordinate system, after the existing import size limits and orientation processing; these coordinates may differ from the original upload's full-resolution pixels, and the existing downscale behavior is unchanged. Pointer input is converted through the existing zoom/pan transform, and the renderer projects the same geometry into full-gel and cutout views. Cutouts preserve the original image data and keep a common height and scale.

Ladder guide placement is an explicit manual calibration edit. Provisional, unplaced guides are excluded from regression. A manual guide matches a detected band only within three source-image pixels; moving a guide farther away removes the stale assigned size from the band's label, results, and CSV. Green guides and editing handles are visible only while editing; exported figures use the external ladder ticks and labels. Existing band analysis and full-gel CSV data are retained when the figure displays selected cutouts.

Fine rotation clears manual ladder guides and undo/redo history because source pixels shift. A 90° rotation or horizontal flip re-detects lanes and resets figure annotations. Calibration should be reviewed after any orientation change.

### Local use

No build step or dependency installation is required. Run `python3 -m http.server 8000` from the repository directory and open <http://localhost:8000/>. The home page links to the gel analyzer, field collector, and calculator. The older `/gel-analyzer/` route redirects to the analyzer page.

### Validation

All 13 Chrome browser regression tests passed. The checks cover:

- Numerical parity with the original demo, including lane geometry, source pixels, detected bands, and linear, quadratic, cubic, and point-to-point calibration.
- Manual marker identity, placement, recalibration, persistence through reanalysis, and removal of stale ladder assignments from labels and CSV.
- Atomic undo/redo of figure edits and calibration settings, including ladder identity.
- Actual inline keyboard input, commit/cancel behavior, and navigation between visible headers.
- Cutout drawing, moving, resizing, shared-height composition, **Done**, **Cancel**, and unchanged source arrays.
- Callout visibility, placement in the spliced view, and rejection of clicks in panel gaps.
- Image upload and orientation resets, composed export dimensions, and PNG/JPEG/TIFF format metadata.
- Desktop rendering at device scale factor 2 and mobile touch emulation at 390 × 844 and device scale factor 3, with precise coordinate mapping, no horizontal page overflow, and no browser script errors.

The mobile checks use browser emulation, not a physical mobile device. Run `node --test tests/gel-figure-editor.test.cjs` with Node.js, Git history containing baseline commit `9a073d1`, and Playwright available. An installed Chrome, `CHROME_PATH`, or Playwright's installed Chromium supplies the browser. See [README.md](README.md#browser-regression-tests) for optional test dependency installation.
