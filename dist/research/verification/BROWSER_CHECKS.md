# Regenerated package: browser checks

Checked on 2026-10-30 in the managed Chromium desktop preview of the packaged static files.

- Module 1 loads the preserved Cardiac Voltage lesson.
- Module 2 loads the deforming anatomy, electrical controls, ECG, 0.03× playback, and local action-potential rows. This browser uses the application's documented reduced-geometry software fallback.
- Module 5 lists all 24 original clinical recordings. Selecting a different example returns to **Original recording & anatomy**.
- The retained RBBB fitted view loads the heart, scorecards, model alternatives, local action potentials, and all 12 calculated/observed panels.
- The regenerated LBBB view loads its 12 panels, model alternatives, and physiological-search-bound note.
- The Mobitz II full-recording view preserves the recording clock and the two original channel labels, MLII and V1. The modified MLII channel has no inferred anatomical axis.
- The VF full-recording view shows only ECG1 and ECG2, disables the unknown lead axis, and hides beat-median and interquartile controls. A screenshot inspection confirmed the rendered cutaway heart beside recorded and calculated traces.
- Browser verification caught and corrected a CSS rule that had overridden the hidden attribute on full-recording beat-averaging controls.
- Pharmacology verification passed opening the explorer, binding-site focus, effect controls, time scrubbing, nodal defaults, and channel-popup handoff. Zero effect produces identical baseline/drug action-potential paths. Dofetilide uses the hERG reference with its regional-evidence caveat. Detailed checks are in `cardiac-voltage/PHARMACOLOGY.md`.

This is a bounded browser check, not a claim of exhaustive device or clinical validation. All-case numerical coverage is provided separately by the portable verification reports.
