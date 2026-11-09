# Publish the prepared EKG Lab package

Destination: **https://github.com/o-zhu/ekg-first-principles-lab**. The source and v0.1.0 educational prerelease have been published. The steps below are retained as a historical record of the initial publication; do not repeat release creation for v0.1.0.

These instructions require legitimate GitHub write access. The initial clean Git bundle was independently cloned and the public release assets were downloaded and verified after publication.

## 1. Authenticate on your own machine

Use Git and the official [GitHub CLI](https://cli.github.com/). If GitHub CLI is not already authenticated as the intended owner:

```sh
gh auth login --hostname github.com --web --git-protocol https --scopes workflow
gh auth setup-git --hostname github.com
gh auth status
```

Complete authentication only in GitHub's browser/device flow. The workflow scope permits pushing the included CI workflow. Do not send a password, token, or device code through chat. Use an existing approved Git authentication method instead if it is already configured.

## 2. Clone the reviewed Git bundle

Extract the combined distribution and start in its directory, beside the three ZIP files and the `.bundle` file:

```sh
git clone ekg-lab-public-source-v0.1.0.bundle ekg-first-principles-lab
cd ekg-first-principles-lab
git remote set-url origin https://github.com/o-zhu/ekg-first-principles-lab.git
git status --short
git log --oneline
git ls-remote --heads origin
```

The bundle contains only the reviewed export history. It does not contain the managed website's original Git history, credentials, installed dependencies, or separately bundled scientific data. If `git ls-remote` now lists a branch, inspect those remote changes before proceeding. Do not force-push over work added after this package was prepared.

Restore and check the full local app:

```sh
npm ci
npm run setup:assets -- --archive ../ekg-lab-runtime-v0.1.0.zip
npm run assets:verify
npm test
```

## 3. Publish source and repository metadata

From the reviewed bundle checkout:

```sh
git push -u origin main
gh repo edit o-zhu/ekg-first-principles-lab \
  --description 'Interactive electrophysiology teaching lab: from membrane voltage to clinical ECG patterns.' \
  --homepage https://ekg-first-principles-lab.zhuou557737.chatgpt.site \
  --add-topic electrocardiography \
  --add-topic electrophysiology \
  --add-topic medical-education \
  --enable-issues
```

Inspect GitHub's rendered README, MIT license, citation metadata, and source-only CI result. These commands preserve the already-public repository's visibility and do not configure Pages or deploy the existing website.

## 4. Publish the initial preview and its assets

First inspect the release list so an existing version is not replaced:

```sh
gh release list --repo o-zhu/ekg-first-principles-lab
```

If `v0.1.0` does not exist and the source checks passed, create the prerelease at the exact reviewed commit. Run this from the bundle checkout, keeping the distribution archives in its parent directory:

```sh
ekg_release_commit=$(git rev-parse HEAD)
gh release create v0.1.0 \
  ../ekg-lab-source-v0.1.0.zip \
  ../ekg-lab-runtime-v0.1.0.zip \
  ../ekg-lab-research-v0.1.0.zip \
  ../ekg-lab-public-source-v0.1.0.bundle \
  ../SHA256SUMS-v0.1.0.txt \
  --repo o-zhu/ekg-first-principles-lab \
  --target "$ekg_release_commit" \
  --title 'EKG Lab v0.1.0 — educational preview' \
  --notes-file docs/RELEASE-v0.1.0.md \
  --prerelease
```

GitHub CLI creates the tag when needed and uploads the supplied files. If a partial operation leaves a draft, inspect that draft before continuing; do not delete or replace an already-published version without review. The prepared release notes are in `docs/RELEASE-v0.1.0.md`; the outer package's preparation/status notes are not the public release body.

## 5. Verify publication and finish the metadata

Independently clone the public repository into a new directory. Download the published runtime/research/source ZIPs and checksum file, check their hashes, and follow the README using the downloaded runtime ZIP. Confirm the public files are actual ZIPs rather than HTML errors. Inspect the repository, commit, tag, release assets, and CI in GitHub.

Only after public asset downloads are verified, record their returned URLs in `data/asset-manifest.json`, update its publication status, and add the actual version/release date to `CITATION.cff`. Update the prepared-state wording in the README and verification notes, then commit those confirmed publication facts. Do not alter an immutable published tag or silently replace release asset bytes; use a new version when released contents change. The initial tagged source remains runnable through its documented local-archive setup.

No part of this procedure requires replacing the existing website's managed remote or copying its account-specific configuration.

Official command references: [authentication](https://cli.github.com/manual/gh_auth_login), [Git credential helper](https://cli.github.com/manual/gh_auth_setup-git), [repository metadata](https://cli.github.com/manual/gh_repo_edit), and [release creation](https://cli.github.com/manual/gh_release_create).
