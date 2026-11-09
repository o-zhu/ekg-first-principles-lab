# Runtime and optional research assets

The editable application is kept in Git. Larger finished scientific files are distributed in two versioned ZIPs and restored to their original relative paths. Setup **does not fit models, alter recorded ECGs, or regenerate anatomy**.

## Publication status

The initial [`v0.1.0` educational preview](https://github.com/o-zhu/ekg-first-principles-lab/releases/tag/v0.1.0) provides the archives. The public runtime and research URLs in [`data/asset-manifest.json`](../data/asset-manifest.json) were verified against the downloaded archives and their SHA-256 checksums. The offline archive procedure remains available.

| Group | Contents | Asset files | Uncompressed asset bytes | ZIP bytes, including notices |
| --- | --- | ---: | ---: | ---: |
| Git | Editable code, vendor source, fonts, microscopy images, small metadata, methods, and readable research source | 193 inventoried assets, in addition to application/developer source | 9,627,916 | Included in the source package |
| Runtime | GLBs, optical arrays, electrical fields, large runtime JSON, all fitted cases, and the native-rate RBBB recording used by the app | 54 | 163,792,404 | 54,030,937 |
| Optional research | Two historical research archives, retained fit intermediates/figures/source data, and larger saved research outputs | 30 | 52,372,614 | 40,298,097 |

Each ZIP also includes 15 accompanying files: the project license, third-party notices, source catalog, and full upstream license notices. The exact sizes and SHA-256 values in the manifest are authoritative if a later release changes this table.

## Offline setup

From a source checkout with the matching archives beside it:

```sh
npm ci
npm run setup:assets -- --archive ../ekg-lab-runtime-v0.1.0.zip
npm run assets:verify
npm start
```

For the optional research material, after runtime setup:

```sh
npm run setup:research -- --archive ../ekg-lab-research-v0.1.0.zip
python3 scripts/setup_assets.py --verify --research
```

Both archives can also be supplied in one command:

```sh
python3 scripts/setup_assets.py --research \
  --archive ../ekg-lab-runtime-v0.1.0.zip \
  --archive ../ekg-lab-research-v0.1.0.zip
```

`--research` adds optional research files to the required runtime set. It does not execute research code. The existing historical archives are installed as ZIP files; they are **not expanded over the current application**. Use the isolated workflows in [reproducibility](REPRODUCIBILITY.md) if you intentionally explore those earlier snapshots.

Python 3.10+ and its standard library handle asset setup. Node/npm are used by the local server and development checks. You can run the Python setup command before installing npm dependencies.

## Download, reuse, and verification

Once a public bundle URL exists in the manifest, `npm run setup:assets` downloads it automatically when needed. An explicit HTTPS mirror is supported:

```sh
python3 scripts/setup_assets.py --url https://example.org/ekg-lab-runtime-v0.1.0.zip
```

With `--research`, `--url` applies to the research bundle; required runtime files must already be present or available through their manifest URL/local archive. A mirror changes only the retrieval location, never the expected archive or file hashes. No API token or account is needed.

Setup reuses matching local files and avoids a download if the selected bundle is already complete. It checks source-controlled assets against the same inventory; missing or modified Git-owned files must be restored from the matching source version or deliberately incorporated into a new release.

Before extracting anything, setup verifies the ZIP's byte count and SHA-256, then enforces its **exact member allowlist**. Absolute paths, traversal, symbolic links, encrypted members, unexpected files, wrong lengths, and wrong per-file hashes are rejected. New files are staged until all members pass verification, then each destination is replaced atomically. Existing edited license/catalog notices are preserved by refusing the mismatched installation. It also rejects symbolic links in destination paths.

`npm run assets:verify` verifies required runtime data, Git-owned runtime assets, and shared notices without writing or downloading. `python3 scripts/setup_assets.py --verify --research` additionally verifies the optional research inventory. These are integrity checks, not scientific validation or evidence of uniquely identified patient physiology.

If setup fails:

- **Download URL is null:** obtain the matching offline ZIP; publication has not provided an automatic retrieval endpoint yet.
- **Archive hash/size differs:** use the ZIP for this exact source release. Do not update expected hashes merely to accept an unexplained file.
- **A Git-owned asset or notice differs:** use a matching checkout, or rebuild intentionally after reviewing your changes. Setup will not silently replace edited notices.
- **A destination is a symlink:** use an ordinary checkout directory with regular files at the expected paths.

## Inventory and license boundaries

The manifest inventories runtime/data/model/media/vendor assets and retained research material. Each entry records its relative path, format, bytes, SHA-256, required/optional role, storage group, source IDs, and generation/provenance information. Its frozen `sources` mapping resolves those IDs to creators, source/version URLs, attribution, and license evidence. The readable catalog is [`data/asset-sources.json`](../data/asset-sources.json).

Ordered catalog rules identify constituent sources; they do not turn mixed assets into MIT-licensed data. Original code/documentation, public recordings, anatomy, optical data, figures, fonts, and third-party implementations retain the boundaries described in [`THIRD_PARTY_NOTICES.md`](../THIRD_PARTY_NOTICES.md). Missing original generators are explicitly named in the manifest and reproducibility notes rather than replaced by invented workflows.

## Build a new asset release

Restore all required and optional assets first, finish source/catalog/notice edits, then run:

```sh
python3 scripts/build_release_assets.py --version 0.1.0
```

The builder writes `ekg-lab-runtime-v0.1.0.zip`, `ekg-lab-research-v0.1.0.zip`, and `SHA256SUMS-v0.1.0.txt` into `../release-artifacts/`. Use `--output-dir` for another directory outside the checkout. It updates the manifest and a marked block of exact asset paths in `.gitignore`, while preserving other ignore rules. It never removes or regenerates source assets. Gitignore does not untrack files already committed, so inspect the staged release tree.

Unknown scientific/binary assets using the catalog's generic original-code fallback cause a build error. Add a reviewed source rule before packaging them. The ZIPs use sorted paths, fixed timestamps, regular-file permissions, and retained license notices. The manifest is outside the archives to avoid a circular archive hash; the catalog and notices are inside and individually hashed.

After publication, set the bundle URLs and publication status in the manifest only after retrieving and verifying the actual uploaded archives. Verify setup from a clean source checkout using those exact URLs. Rebuilding clears URLs to null because it does not itself upload or verify publication. Never silently replace the contents of a previously published version; make a new version when bundled bytes change.
