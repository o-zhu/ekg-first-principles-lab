# Maintaining the source release and live demo

## Snapshot and synchronization

The initial public export was prepared from the working live-site **version 22**, source commit `9d3fed5ae0fb6ec66de4da53319e1cd1c3435336`, on 2026-11-09 UTC. The original source tree was clean when inspected. Its managed history and remote were preserved separately; this release starts a clean public history so account-specific hosting configuration and prior working material are not published.

The source is buildless and uses `dist/` as its editable runtime tree. Release-specific changes concern packaging, documentation, dependency portability, and validation. The precomputed scientific fits are retained; this export does not run fitting again.

**Synchronization is manual in both directions.** There is no background job, automatic mirror, or GitHub-to-demo deploy hook. The existing demo remains [here](https://ekg-first-principles-lab.zhuou557737.chatgpt.site).

To bring later website changes into this repository:

1. Identify the new deployed version and its authoritative source commit. Open or export it in a separate directory; do not reset an active shared checkout.
2. Compare the editable runtime files and affected scientific/provenance files with this release. Copy only the project changes. Never copy `.git/`, account-specific hosting files, credentials, temporary caches, signed URLs, or unrelated history.
3. Preserve the public repository's release/setup/documentation tooling. Update the snapshot note and describe the imported behavior in the release notes.
4. If bytes in a bundled asset change, update its provenance and release version, rebuild the bundle and manifest, and rerun integrity and relevant scientific checks. Do not silently replace an old asset at an existing immutable release URL.
5. Follow the verification/release procedure below. A public source update does not automatically alter the hosted demo.

To deploy a public-repository change back to the existing website, review the runtime diff in an isolated checkout of that website's source, restore the required assets, verify it, and use its supported hosting workflow. Preserve that site's identity, URL, audience, and original origin. Do not point its managed origin at this public GitHub repository.

## Develop and verify

Use `npm ci`, `npm run setup:assets`, and `npm start`. Run the source-only CI checks on routine changes, and `npm test` plus asset verification for a release. Exercise affected views in a real browser, including a narrow viewport. Keep original numerical reports distinct from new observations in `docs/VERIFICATION.md`.

Review new sources and license terms, update `docs/REFERENCES.md` and `THIRD_PARTY_NOTICES.md`, and revise the source catalog before changing the asset manifest. The asset builder rejects unclassified resources. Follow `docs/ASSETS.md` for exact bundling/setup commands. Expensive regeneration is separate from assembling a release from approved precomputed outputs.

## Make a release

Use a new semantic version, with a preview label if appropriate to the educational project's maturity. Before publication:

1. Review the complete staged tree and history for private data, secrets, unexpected files, and required notices. Keep the public commit focused and meaningful.
2. Build the runtime and optional research bundles with the release packaging script. Keep per-file and archive SHA-256 values. Validate a clean checkout using those exact archives.
3. Set the release download URLs in the manifest only when the corresponding public assets exist. Reverify their fetched bytes. Confirm that source-only CI succeeds without requiring private accounts or large asset downloads.
4. Update `CITATION.cff` with the actual repository URL, version, and release date; do not invent a DOI. Validate the CFF.
5. Commit, create a version tag, and publish a GitHub release with notes identifying the asset versions, scientific limits, missing generators, and checks actually run.
6. Independently retrieve the public commit and release assets, run setup and critical checks, and inspect the rendered README, license, citation, and links.

Keep GitHub Actions permissions minimal and pin external actions by immutable commit. No deployment credentials are needed for the current CI. Do not enable GitHub Pages, scheduled fitting, or additional services as part of a routine source release without a separate project decision.
