# Readable four-chamber research source

This directory exposes the recovered Python/CellML sources and small methods/provenance files from `dist/cardiac-voltage/data/heart-model-reproducible-source.zip` for browsing and review. The archived files were copied without changing their contents. `SOURCE_README.md` is the original archive's README.

This is a source selection, not a second independently runnable reconstruction package. Larger inputs, arrays, and original directory companions remain in the optional research release bundle. The supported regeneration entry point is [`dist/research/regenerated-fits/reproduce.py`](../../dist/research/regenerated-fits/reproduce.py), which extracts the original archives into an explicitly chosen isolated work directory. Do not extract an archive over this public checkout: it contains historical runtime copies.

See [reproducibility](../../docs/REPRODUCIBILITY.md) for dependencies, commands, expensive steps, and the original optical/BodyParts3D generator gaps. These scripts were retained, not rerun to refit the release. Original wrappers are covered by the root MIT license; incorporated CellML/generated implementation and upstream data retain the separate terms in [third-party notices](../../THIRD_PARTY_NOTICES.md).
