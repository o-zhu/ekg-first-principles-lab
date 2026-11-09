# Initial source-release verification

Verified 2026-11-09 UTC against the isolated export of live-site version 22, source commit `9d3fed5ae0fb6ec66de4da53319e1cd1c3435336`. The existing hosted site and its source history were not changed by this packaging task.

## Environment and commands

- Node.js **24.22.1**, npm **11.9.0**.
- Python **3.12.14**, NumPy **2.3.5** for the numerical parity checks.
- Chrome in the available cloud browser. Main-lesson 3D views selected the **software rendering fallback** because WebGL was unavailable in that browser.
- `cffconvert` **2.0.0**, CFF schema **1.2.0**, used for citation validation.

| Check actually run | Result and scope |
| --- | --- |
| `npm ci` | Passed with the committed lockfile; 31 development packages installed. The app has no npm runtime dependencies. |
| `npm test` | **16/16 checks passed**: clinical samples/scaling, playback/gain, label geometry, scene interaction, electrical/conduction evaluation, fitted playback, electrolytes, and DOM regressions. |
| `npm run test:ci` in a separate source-only fixture | **5/5 passed** without clinical JSON, GLB, optical binaries, images, or research archives. |
| Runtime asset audit | **152 required assets present**, none missing; checked optical binary lengths and the electrical-atlas hash. |
| Fitted-case audit | **24 cases passed**, with no internal coverage or field-consistency failures. |
| Python/JavaScript voltage parity | **478,776 source comparisons** and **144,400 rendered-node comparisons**; maximum difference approximately **3.35 × 10⁻¹² mV**. |
| Lead-label fixture | Passed **1,683 camera orientations**. This tests mathematical placement/stability, not all rendered browser pixels. |
| Scene-interaction fixture | Passed the **600-frame** scenario with no layout read/write barriers. Operation counts are fixture results, not browser FPS. |
| Local HTTP delivery | HTML, JavaScript, nested Module 1 HTML, clinical JSON, GLB, optical `.u8`, electrical `.f32`, and the large RBBB fitted-case JSON returned HTTP 200, correct MIME types, and exact SHA-256 equality with local files. |
| Local server boundary checks | Directory redirect, nested paths, HEAD, missing-file handling, traversal rejection, and method restriction passed. |
| Citation metadata | `cffconvert --validate --infile CITATION.cff` passed against schema 1.2.0. Unknown repository/release metadata is omitted until publication. |
| Clean source ZIP and offline setup | Extracted the actual source ZIP into a new directory, ran `npm ci`, and passed the five source-only checks. Restored 54 runtime assets and 30 optional research assets from the matching archives, preserving 15 bundled notices. Required verification passed **159/159** files; full research verification passed **292/292**. Repeated setup reused all valid files without downloads. All **16 full tests** passed after restoration. |
| Archive installation safety | **17 focused checks passed**, including invalid archive/member hashes, unsafe paths, symlinks, mismatched notices, and reuse of valid files. |
| Restored-package HTTP and source integrity | Eight representative resources returned HTTP 200 with correct MIME types and exact installed-file hashes. All **359 packaged source files** remained byte-identical after asset restoration and serving. Final edits after this check affected only README/setup wording and this verification record. |
| Public-content audit | Reviewed source files and members of both retained scientific ZIPs, including nested NPZ members. No confirmed embedded credentials, private network URLs, signed account URLs, or unrelated private material were found. |

The DOM regressions use explicit canvas/WebGL/frame stubs. They do not replace real rendering or assistive-technology testing. The fresh numerical runner writes temporary reports and does not overwrite the historical scientific reports.

## Browser observations

The unchanged public version 22 loaded in Chrome. The following interactions were observed:

- Module 1 membrane lesson and its navigation shell loaded.
- Module 2 reference anatomy loaded; surface/cutaway selection changed; the in-scene **0.1×** speed propagated to the transport and action-potential speed selectors. **Explore tissue action potentials** moved focus to the cellular section, where the traces and tissue selectors were present.
- Module 3 reference heart/torso, lead axes, selected traces, and playback controls loaded in the software renderer. Selected/all-lead controls and calibrated waveform gain responded. The documentation screenshot is of this actual live view, not a mockup.
- Module 5 loaded the 24-case browser, the original normal-sinus ECG, and illustrative anatomy. After clicking the clinical tracing, the control still showed **Pause**, confirming continuing playback. The normal-sinus fitted view loaded its source geometry controls, calculated/recorded curves, local A/B action potentials, and reported error metrics.

The managed preview for the isolated export loaded source UI but returned 404s for assets that were present on disk. A temporary narrow-viewport harness also returned 404 through that preview route and was removed. The independent local HTTP server delivered the same files correctly, as recorded above. The browser evidence from the live site therefore verifies the unchanged runtime snapshot; it is **not** a claim that every isolated-preview asset rendered successfully.

## Limits of this release check

- No fresh hardware-WebGL, Safari/WebKit, Firefox, physical phone/tablet, or assistive-technology session was run.
- Narrow-viewport rendering was not verified in this release session; no supported viewport-resize path was available in the browser session. Historical responsiveness notes are not counted as new tests.
- No measured browser frame-rate claim is made. Software fallback observations do not establish hardware rendering performance.
- Full raw-data preprocessing, torso-operator reconstruction, and numerical fitting were **not rerun**. This release preserves the already fitted assets and documents missing original generators.
- A metadata or numerical pass does not validate clinical use, physiological uniqueness, or independent-patient accuracy.

## Publication state

The source, runtime, and optional research packages are prepared and locally verified. The owner created the public repository [o-zhu/ekg-first-principles-lab](https://github.com/o-zhu/ekg-first-principles-lab). Its metadata and empty branch list were verified. The first file upload was rejected by GitHub with HTTP 403, `Resource not accessible by integration`; no source commit, tag, or release was published by that attempt. The account owner's repository permissions do not establish the connected app's write permissions.

Automatic asset download URLs remain unset; the documented offline archive setup is the verified path. Independent retrieval of a published revision and verification of public release downloads remain pending publication. Repository-specific publication instructions and a clean Git bundle are included in the offline distribution.

The older `ekg-lab-v15-regenerated.zip` Box backup was examined through its archive preview. All five visible Python filenames and both nested research archive filenames are already represented in this release. No additional missing generator was found in the visible listing. Download attempts did not complete, so exact byte identity and contents of the backup's nested archives were not verified. No backup files were copied into this release.

For source changes, follow the checks in [CONTRIBUTING.md](../CONTRIBUTING.md). For the boundaries of scientific regeneration, see [REPRODUCIBILITY.md](REPRODUCIBILITY.md).
