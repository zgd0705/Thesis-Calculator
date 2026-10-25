# Updates

## Automatic border trimming and optional image crop

Uploads automatically trim clear black borders before analysis. Uncertain boundaries retain the full image. Step 1's **Crop / restore original** opens an optional crop tool with pointer resizing, moving and drawing, exact pixel fields, **Auto-trim black borders**, and **Use full image**. Changes take effect on **Apply crop & analyze**; **Cancel** or `Escape` preserves the active analysis.

The decoded original is retained in memory for recropping. Crops copy grayscale and color samples without quantizing 16-bit intensities. Applying a crop starts fresh analysis and resets lane, band, manual standard-position/assignment, and annotation edits. Ladder preset, known sizes, offset, and fit-model settings are retained. Coordinates refer to the cropped working image; existing import size limits and downscaling remain in place. Lane cutouts remain a separate figure-composition feature.

Green calibration guides and their drag handles have been removed from the editor and exports. **Edit standard positions** opens the existing Rf/**Use** table in step 4. External bp ticks, calibration fits, and the original detected/manual band controls remain available.

## Gel figure editor

The gel analyzer adds interactive figure controls while retaining the existing upload, lane detection, signal processing, band analysis, calibration models, and export workflow. Changes are contained in `gel-analyzer.html`; the launcher and other tools retain their existing navigation.

### Added interactions

- Inline lane-header editing with next/previous keyboard navigation and cancellation.
- Optional −45° rotation for custom lane names longer than one trimmed character, with automatic lane numbers and single-character labels kept horizontal.
- An external **bp** scale that follows the standard positions; manual positions are edited from the calibration sidebar.
- Unconfirmed standard positions are excluded from calibration until selected for use.
- Non-destructive lane cutouts, a shared vertical crop range, side-by-side panel composition, solid borders, and gaps; **Cancel** discards draft changes, **Done** with no cutouts left restores the full gel, and **Show original** retains committed cutouts.
- Numbered right-margin arrows with horizontal dashed band references.
- Preview and export support for figure margins, headers, ladder ticks, panel borders, and callouts.
- Undo and redo for committed figure edits, including one history entry per drag; calibration setting changes are separate history entries.

### Integration details

Figure positions remain in the analyzer's working-image pixel coordinate system after cropping, the existing import size limits, and orientation processing. The cropped top-left corner is the coordinate origin, and the existing downscale behavior is unchanged. Pointer input is converted through the existing zoom/pan transform, and the renderer projects the same geometry into full-gel and cutout views. Cutouts preserve the image data and keep a common height and scale.

Editing standard positions is an explicit manual calibration edit. Unconfirmed positions are excluded from regression. A manual position matches a detected band only within three working-image pixels; moving it farther away removes the stale assigned size from the band's label, results, and CSV. Exported figures use external ladder ticks and labels. Existing band analysis and full-gel CSV data are retained when the figure displays selected cutouts.

Fine rotation clears manual standard positions and undo/redo history because source pixels shift. A 90° rotation or horizontal flip re-detects lanes and resets figure annotations. Calibration should be reviewed after any orientation change.

### Local use

No build step or dependency installation is required. Run `python3 -m http.server 8000` from the repository directory and open <http://localhost:8000/>. The home page links to the gel analyzer, field collector, and calculator. The older `/gel-analyzer/` route redirects to the analyzer page.

### Validation

All 27 Chrome browser regression tests passed. The checks cover:

- Numerical parity with the original demo, including lane geometry, source pixels, detected bands, and linear, quadratic, cubic, and point-to-point calibration.
- Manual marker identity, placement, recalibration, persistence through reanalysis, and removal of stale ladder assignments from labels and CSV.
- Atomic undo/redo of figure edits and calibration settings, including ladder identity.
- Actual inline keyboard input, commit/cancel behavior, and navigation between visible headers.
- Cutout drawing, moving, resizing, shared-height composition, **Done**, **Cancel**, and unchanged source arrays.
- Callout visibility, consecutive numbering of shown callouts, placement in the spliced view, and rejection of clicks in panel gaps.
- Standard-position Rf/**Use** edits from the sidebar without moving detected bands, separate calibration undo steps, step-4 band dragging and analysis overlays, the manual-position band-change warning, and independent positions for repeated ladder sizes.
- Zoom and image position kept across steps 4 and 5 and margin changes, sharp pixels when zoomed in, removal of every cutout, undo paused during cutout editing, and touch double-tap header editing.
- Image upload and orientation resets, composed export dimensions, and PNG/JPEG/TIFF format metadata.
- Conservative border detection, immediate PNG/TIFF auto-trimming, unchanged source buffers, lossless 16-bit crop samples, optional crop drawing/moving/resizing, Cancel, original restoration, and crop-dialog touch layout. Green calibration overlays are absent from the editor and exports.
- Desktop rendering at device scale factor 2 and mobile touch emulation at 390 × 844 and device scale factor 3, with precise coordinate mapping, no horizontal page overflow, and no browser script errors.

The mobile checks use browser emulation, not a physical mobile device. Run `node --test tests/*.test.cjs` with Node.js, Git history containing baseline commit `9a073d1`, and Playwright available. An installed Chrome, `CHROME_PATH`, or Playwright's installed Chromium supplies the browser. See [README.md](README.md#browser-regression-tests) for optional test dependency installation.
