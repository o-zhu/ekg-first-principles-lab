# EKG Lab v0.1.0 — educational preview

The initial open-source package preserves the six-module EKG Lab implementation and precomputed datasets from live-site version 22. It adds portable setup, a locked development environment, source-only CI, asset integrity checks, scientific provenance, and separate upstream license notices.

## Included

- Editable HTML, CSS, ES modules, shaders, and the software rendering fallback in `dist/`.
- Electrical foundations, action-potential and electrolyte exploration, interactive anatomy/conduction, 12-lead comparison, ECG measurements, 24 clinical cases, and the rhythm builder.
- Versioned runtime and optional research ZIPs with complete-archive and per-file SHA-256 verification. Restore them using the README's `--archive` procedure.
- User and developer guides, references, citation metadata, preparation scripts, and explicit records of missing original generators.

## Verification and limits

The clean offline package passed 16 full checks, five source-only checks, and three numerical audits. Runtime/research integrity checks, representative HTTP delivery, and citation-schema validation passed. The live demo was exercised in Chrome's software fallback; this is not a fresh hardware-WebGL, mobile, narrow-viewport, or cross-browser performance certification. Full raw preprocessing and numerical fitting were not rerun.

The original optical processing script, initial BodyParts3D conversion/LOD generators, and some initial recording-import scripts were not recovered. Finished runtime outputs are included. The unspecified-license third-party TT06 implementation is excluded; retained numerical outputs and the preparation wrapper are documented separately.

MIT covers original software and original documentation. Anatomy, recordings, optical data, microscopy, fonts, and incorporated implementations retain their own terms, including CC BY, CC0, ODC-By, OFL, and separate MIT notices. See `THIRD_PARTY_NOTICES.md`, `licenses/`, and `data/asset-sources.json`.

This is an educational project, not validated for clinical diagnosis or treatment. Fitted fields are hypotheses on reference anatomy, not measured patient activation maps. See `docs/MODEL_PROVENANCE.md` and `docs/VERIFICATION.md` for the interpretation and testing boundaries.

Live demo: https://ekg-first-principles-lab.zhuou557737.chatgpt.site

The existing demo is maintained separately; a GitHub release does not redeploy it. GitHub Pages is not configured.
