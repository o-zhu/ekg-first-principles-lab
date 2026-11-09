# Contributing to EKG Lab

Start with the [README](README.md), [architecture](docs/ARCHITECTURE.md), and [scientific reproducibility guide](docs/REPRODUCIBILITY.md). The application source is the editable `dist/` tree; there is no framework build step.

## Local workflow

Use the Node version in `.nvmrc`, Python 3.10+, and a current WebGL-capable browser:

```sh
npm ci
npm run setup:assets
npm start
```

Make a focused change on a branch. Run `npm run test:ci` and the checks relevant to the modified behavior. Run `npm test` and `npm run assets:verify` when changing data, field evaluation, playback, or the anatomy pipeline. Inspect the affected module in a desktop and a narrow viewport. State the browser engine and whether the viewport was emulated.

The code uses plain ES modules. Follow nearby conventions; a new framework or a broad formatting rewrite is unnecessary. Do not commit dependencies, local credentials, site-management configuration, downloaded research caches, or generated runtime bundles.

## Scientific and visual changes

Keep the distinction between measured signals, reference anatomy, inferred geometry, illustrative motion, and fitted hypotheses visible. Report source units, coordinate transforms, orientation, sample rates, timing conventions, channel identities, and calibration changes. Do not silently improve a fit by altering the observed ECG or by hiding residuals.

For anatomy, labels, cutaways, or lead-axis changes, inspect anterior, lateral, posterior, superior, and oblique views. Check labels with axes both on and off, narrow layouts, rotation and zoom, and the relation between arrow direction and lead polarity. Check the cutaway seam and internal surfaces when the mesh changes. Preserve the existing deformation/activation alignment and clearly identify synthetic additions.

For playback or chart changes, verify seeking during playback, explicit pause, dragging, speed changes, and route cleanup. Check calibrated gain against known millivolt values. For performance changes, report a reproducible scenario and actual measurement; fixture work counts and browser frame rates are different measurements.

## New data and assets

Before adding a resource, establish redistribution rights for the exact version and its derivatives. A public URL or paper citation alone is not a license. Include the creator, source URL/DOI/accession, license, required attribution, version, sizes, SHA-256 hashes, role, and processing/generation method. Retain original licenses and notices, and update `data/asset-sources.json`, `data/asset-manifest.json`, `THIRD_PARTY_NOTICES.md`, and `docs/REFERENCES.md` as appropriate.

Use public, appropriately licensed examples only. Do not include identifiable patient data, private communications, account tokens, signed download URLs, or local absolute paths. Keep large required assets in the versioned release bundles; do not rely on an unpublished local copy. A replacement asset must have a working retrieval path and pass the documented integrity checks.

## Pull requests and issue reports

A useful pull request describes the problem, the resulting behavior, the files/data affected, the checks actually run, and remaining limits. Include screenshots for a visual change and explain any scientific assumption or license boundary that changed. Update the user documentation when controls or setup change.

For a reproducible issue, include the module/case, browser and OS, viewport size, steps, expected/observed behavior, and relevant console errors with credentials removed. Use the repository's issue tracker after publication. Do not post security credentials or private health information. This project does not claim to provide a private security-reporting channel or a support-response guarantee.

Contributions to original code and documentation are accepted under the repository's MIT license. Third-party assets retain their own terms. Submit only material you are entitled to contribute, and keep scholarly citation requests separate from license obligations.
