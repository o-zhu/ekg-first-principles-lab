#!/usr/bin/env python3
"""Package existing EKG Lab assets; never regenerate or remove scientific data."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import fnmatch
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sys
import tempfile
import zipfile

from setup_assets import AssetError, CHUNK, digest, safe_relative

ROOT = Path(__file__).resolve().parents[1]
CATALOG = ROOT / "data" / "asset-sources.json"
MANIFEST = ROOT / "data" / "asset-manifest.json"
INVENTORY_ROOTS = (
    "dist/assets", "dist/models", "dist/data", "dist/vendor",
    "dist/cardiac-voltage/assets", "dist/cardiac-voltage/data",
    "dist/research", "data-source", "research", "docs/media",
)
ORIGINAL_REPORTS = {
    "data-source/conduction-render-audit.json",
    "data-source/pathology-fitting/ap-shape-waveform-audit.json",
    "data-source/pathology-fitting/browser-evaluator-verification.json",
    "data-source/pathology-fitting/operator-provenance.json",
    "data-source/pathology-fitting/pose-zero-verification.json",
    "data-source/pathology-fitting/software-versions.json",
    "data-source/pathology-fitting/verification-acs-00004.json",
    "data-source/pathology-fitting/verification-ptbxl-03155.json",
    "dist/cardiac-voltage/data/whole-heart-independent-audit.json",
    "dist/data/pathology-fits/manifest.json",
    "dist/data/pathology-fits/reconstruction-summary.json",
    "dist/research/recovery-provenance.json",
    "dist/research/regenerated-fits/SHA256.json",
    "dist/research/regenerated-fits/environment.json",
    "dist/research/regenerated-fits/midpoint-checks.json",
    "dist/research/regenerated-fits/operator-provenance.json",
    "dist/research/regenerated-fits/summary.json",
    "dist/research/verification/fitted-case-audit.json",
    "dist/research/verification/runtime-asset-audit.json",
    "dist/research/verification/vm-parity-report.json",
}
BEGIN_IGNORE = "# BEGIN GENERATED EKG RELEASE ASSETS"
END_IGNORE = "# END GENERATED EKG RELEASE ASSETS"
BASE_IGNORE = """# Local tools, credentials, caches, and generated working files
node_modules/
.openai/
.sites-checkout/
.venv/
.venv-research/
__pycache__/
*.py[cod]
.DS_Store
.env
.env.*
!.env.example
*.log
.cache/
.ekg-assets-*/
release-artifacts/
"""


def atomic_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", newline="\n", prefix=".asset-build-", dir=path.parent, delete=False) as handle:
        temporary = Path(handle.name)
        handle.write(text)
    try:
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def file_record(path: Path) -> dict:
    if path.is_symlink() or not path.is_file():
        raise AssetError(f"Only regular source files may be packaged: {path.relative_to(ROOT)}")
    relative = safe_relative(path.relative_to(ROOT).as_posix())
    size, sha = digest(path)
    return {"path": relative, "format": path.suffix.lstrip(".").lower() or "text", "bytes": size, "sha256": sha}


def classify(relative: str, size: int) -> tuple[str, str, bool]:
    """Return storage, role, required. Exact runtime dependencies precede research."""
    path = Path(relative)
    if relative == "dist/data/pathology-fits/source/ptbxl-03155-500hz.json":
        return "runtime", "recorded-runtime-signal", True
    research = (
        relative.startswith(("data-source/", "research/", "dist/research/"))
        or relative.endswith((".zip", ".npz"))
        or relative.startswith(("dist/data/pathology-fits/source/", "dist/data/pathology-fits/review/"))
        or relative == "dist/data/pathology-fits/targets-v1.json"
    )
    if research:
        bundle = (
            path.suffix in {".zip", ".npz", ".dat", ".hea", ".glb", ".u8", ".f32"}
            or relative.startswith(("data-source/pathology-fitting/figures/", "dist/data/pathology-fits/review/"))
            or (path.suffix == ".json" and size > 100_000 and relative.startswith(("data-source/pathology-fitting/", "research/", "dist/research/", "dist/data/pathology-fits/")))
        )
        return ("research" if bundle else "git"), "optional-research", False
    if relative.startswith("docs/media/"):
        return "git", "documentation-media", False
    if path.suffix in {".glb", ".u8", ".f32"} or (path.suffix == ".json" and size > 100_000):
        return "runtime", "runtime-data", True
    return "git", "runtime-support", True


def generation(relative: str) -> dict:
    def item(status: str, scripts: list[str] = [], documents: list[str] = [], missing: list[str] = [], notes: str = "") -> dict:
        return {"status": status, "scriptPaths": scripts, "documentPaths": documents, "missingScripts": missing, "notes": notes}
    methods = ["docs/REPRODUCIBILITY.md"]
    four = "research/four-chamber/"
    if relative.startswith("dist/models/"):
        if "junction" in relative:
            return item("retained-script", ["scripts/prepare-heart-junctions.py"], ["dist/models/heart-junctions.json", *methods], notes="Requires the separately downloaded, pinned original BodyParts3D archive; setup restores finished outputs.")
        return item("missing-generator", documents=["dist/models/heart-manifest.json", "dist/models/low-models.json", *methods], missing=["Original BodyParts3D conversion and level-of-detail generator scripts were not recovered."], notes="Source selection, coordinate transforms, input hashes, and reduction notes are retained; runtime geometry is shipped unchanged.")
    if relative.startswith("dist/cardiac-voltage/data/human/"):
        return item("missing-generator", documents=["dist/cardiac-voltage/data/human/README.md", *methods], missing=["process_human_optical.py was not recovered."], notes="Processed optical movies, masks, timing maps, and backgrounds are retained with donor metadata and raw input provenance.")
    if relative.startswith("dist/cardiac-voltage/data/pharmacology/"):
        return item("retained-script", ["dist/scripts/build-pharmacology-structures.py"], methods, notes="Public PDB coordinate preparation; the original raw source directory is an external input.")
    if relative == "dist/cardiac-voltage/data/channel-structures.json" or relative.startswith("data-source/channel-structures/"):
        return item("retained-script", ["scripts/prepare-channel-structures.py"], ["data-source/channel-structures/README.md", *methods])
    if relative.startswith("dist/data/pathology-fits/cases/"):
        legacy = Path(relative).stem in {"ptbxl-03155", "acs-00004"}
        return item("retained-research-pipeline", ["scripts/fit-pathology-export.py"] if legacy else ["dist/research/regenerated-fits/reproduce.py", "dist/research/regenerated-fits/scripts/regenerate_all_cases.py"], ["dist/data/pathology-fits/FORWARD_FIT_METHODS.md" if legacy else "dist/research/regenerated-fits/README.md", *methods], notes="Finished offline source hypothesis. Its saved ECG and source arrays are packaged without fitting. Upstream inputs, numerical environment, and documented limitations remain necessary for regeneration.")
    if relative.startswith("dist/data/clinical-stemi"):
        return item("retained-script", ["scripts/fetch_stemi_sources.py", "scripts/import_stemi_examples.py"], ["dist/data/clinical-stemi-provenance.json", *methods])
    if relative.startswith("dist/data/clinical-tachyarrhythmias"):
        return item("retained-script", ["scripts/import_tachyarrhythmias.py"], ["dist/data/clinical-tachyarrhythmias-provenance.json", *methods])
    if relative.startswith("dist/data/clinical-torsades"):
        return item("retained-script", ["scripts/import_torsades.py"], ["dist/data/clinical-torsades-provenance.json", *methods])
    if relative.startswith(("dist/data/clinical-ecgs", "dist/data/clinical-extra", "dist/data/clinical-mobitz2")):
        return item("missing-generator", documents=["dist/data/DATA-SOURCES.txt", *methods], missing=["A dedicated original import script for this initial recording collection was not recovered."], notes="Finished excerpt samples and available source-record/provenance metadata are retained; later pathology-target preparation is not a replacement for this missing original import.")
    if relative.startswith("dist/data/electrical-atlas"):
        return item("retained-script", ["scripts/build-electrical-atlas.py"], methods)
    if relative == "dist/data/conduction-coupling.json":
        return item("retained-script", ["scripts/build-conduction-coupling.py"], methods)
    if relative.startswith("dist/cardiac-voltage/data/") and any(word in relative for word in ("heart-model", "lead-ii", "qrs-", "ventricular-template", "ptb-healthy", "appendage")):
        return item("retained-research-pipeline", [four + "scripts/build_four_chamber_model.py", four + "scripts/build_torso_operator.py", four + "scripts/build_pooled_optical_template.py"], ["dist/cardiac-voltage/data/FOUR_CHAMBER_METHODS.md", *methods], notes="Original four-chamber/calibration scripts and historical source archive are retained. Optical preprocessing is a separate missing step; the TT06 third-party implementation is excluded because its redistribution license was unspecified.")
    if relative.startswith(("dist/data/pathology-fits/", "data-source/pathology-fitting/")):
        return item("retained-research-pipeline", ["scripts/prepare_pathology_targets.py", "scripts/fit-pathology-model.py", "scripts/fit-pathology-export.py", "scripts/package-propagation-research.py"], ["data-source/pathology-fitting/REPRODUCE.md", *methods], notes="Historical source, intermediate, figure, report, or numerical audit. Script availability does not mean this release repeated the fitting workflow.")
    if relative.startswith("dist/cardiac-voltage/assets/") or relative.startswith("dist/vendor/"):
        return item("upstream-file-or-documented-preparation", documents=["THIRD_PARTY_NOTICES.md", "data/asset-sources.json"], notes="Retained asset with source-specific attribution/provenance. No new image, font, or vendor transformation is performed during packaging.")
    if relative.startswith("research/four-chamber/"):
        return item("recovered-source-or-output", documents=["research/four-chamber/README.md", *methods], notes="Readable material extracted from the retained four-chamber research archive; scripts and upstream implementations keep their individual licenses. Large saved numerical outputs are optional research assets.")
    return item("authored-or-retained-report", documents=methods, notes="Authored source, documentation, metadata, or retained numerical report; no scientific generation is performed by the release builder.")


def inventory(catalog: dict) -> list[dict]:
    source_ids = {item["id"] for item in catalog["sources"]}
    result = []
    files = set()
    for relative in INVENTORY_ROOTS:
        folder = ROOT / relative
        if folder.is_symlink():
            raise AssetError(f"Inventory directory may not be a symlink: {relative}")
        if folder.exists():
            for path in folder.rglob("*"):
                if path.is_symlink():
                    raise AssetError(f"Inventory contains a symlink: {path.relative_to(ROOT)}")
                if path.is_file() and not any(part.startswith(".") or part == "__pycache__" for part in path.relative_to(ROOT).parts):
                    files.add(path)
    for path in sorted(files):
        relative = path.relative_to(ROOT).as_posix()
        rule = next((rule for rule in catalog["pathRules"] if any(fnmatch.fnmatchcase(relative, pattern) for pattern in rule["globs"])), None)
        if not rule or not rule.get("sourceIds") or any(key not in source_ids for key in rule["sourceIds"]):
            raise AssetError(f"No complete source/license classification: {relative}")
        fallback = rule["globs"] == ["**"]
        authored = path.suffix in {".py", ".js", ".mjs", ".md", ".txt", ".html", ".css", ".svg"} or relative in ORIGINAL_REPORTS
        if fallback and not authored:
            raise AssetError(f"Unclassified scientific/binary asset uses the original-code fallback: {relative}. Add a specific reviewed catalog rule.")
        entry = file_record(path)
        storage, role, required = classify(relative, entry["bytes"])
        entry.update(storage=storage, role=role, required=required, sourceIds=rule["sourceIds"], sourceNotes=rule.get("notes", ""), generation=generation(relative))
        result.append(entry)
    return result


def write_bundle(destination: Path, members: list[dict]) -> dict:
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(prefix=".release-build-", suffix=".zip", dir=destination.parent, delete=False) as handle:
        temporary = Path(handle.name)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as zipped:
            for item in sorted(members, key=lambda value: value["path"]):
                path = ROOT / item["path"]
                if path.is_symlink():
                    raise AssetError(f"Source became a symlink during packaging: {item['path']}")
                info = zipfile.ZipInfo(item["path"], date_time=(1980, 1, 1, 0, 0, 0))
                info.create_system = 3
                info.external_attr = (stat.S_IFREG | 0o644) << 16
                info.compress_type = zipfile.ZIP_STORED if path.suffix.lower() in {".zip", ".npz", ".png", ".jpg", ".woff2"} else zipfile.ZIP_DEFLATED
                sha = hashlib.sha256()
                count = 0
                with path.open("rb") as source, zipped.open(info, "w", force_zip64=True) as target:
                    while block := source.read(CHUNK):
                        count += len(block)
                        sha.update(block)
                        target.write(block)
                if (count, sha.hexdigest()) != (item["bytes"], item["sha256"]):
                    raise AssetError(f"Source changed during packaging: {item['path']}; rebuild after edits finish.")
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    size, sha = digest(destination)
    return {"fileName": destination.name, "url": None, "bytes": size, "sha256": sha, "uncompressedBytes": sum(item["bytes"] for item in members), "members": sorted(members, key=lambda value: value["path"])}


def update_ignore(entries: list[dict]) -> None:
    path = ROOT / ".gitignore"
    current = path.read_text(encoding="utf-8") if path.exists() else BASE_IGNORE
    if BEGIN_IGNORE in current or END_IGNORE in current:
        if current.count(BEGIN_IGNORE) != 1 or current.count(END_IGNORE) != 1:
            raise AssetError("Malformed generated asset block in .gitignore.")
        before, tail = current.split(BEGIN_IGNORE, 1)
        _, after = tail.split(END_IGNORE, 1)
    else:
        before, after = current, ""
    def escape(value: str) -> str:
        return re.sub(r"([\\*?\[\]#! ])", r"\\\1", value)
    lines = [BEGIN_IGNORE, "# Finished data lives in checksum-pinned release bundles; source files stay editable."]
    lines.extend("/" + escape(item["path"]) for item in entries if item["storage"] in {"runtime", "research"})
    lines.append(END_IGNORE)
    atomic_text(path, before.rstrip() + "\n\n" + "\n".join(lines) + "\n" + after.lstrip("\n"))


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version", help="release version; defaults to package.json")
    parser.add_argument("--output-dir", type=Path, default=ROOT.parent / "release-artifacts", help="bundle output directory, outside the source checkout")
    args = parser.parse_args()
    try:
        version = args.version or json.loads((ROOT / "package.json").read_text())["version"]
        if not re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+(?:-[A-Za-z0-9.-]+)?", version):
            raise AssetError("Use a semantic release version such as 0.1.0 or 0.2.0-preview.1.")
        output = args.output_dir.expanduser().resolve()
        if output.is_relative_to(ROOT.resolve()):
            raise AssetError("Choose a bundle output directory outside the source checkout.")
        catalog = json.loads(CATALOG.read_text(encoding="utf-8"))
        entries = inventory(catalog)
        if MANIFEST.exists():
            previous = json.loads(MANIFEST.read_text(encoding="utf-8"))
            current = {item["path"] for item in entries}
            missing = [item["path"] for item in previous.get("assets", []) if item["path"] not in current]
            if missing:
                raise AssetError("Previously inventoried assets are missing. Restore them before rebuilding, or deliberately revise the previous manifest if removing them:\n  " + "\n  ".join(missing[:12]))
        common_paths = [ROOT / "LICENSE", ROOT / "THIRD_PARTY_NOTICES.md", CATALOG]
        common_paths.extend(path for path in (ROOT / "licenses").rglob("*") if path.is_file())
        common = [file_record(path) for path in sorted(set(common_paths))]
        if not any(item["path"].startswith("licenses/") for item in common):
            raise AssetError("The full licenses/ notices must be present before bundling.")
        bundles = {}
        for group in ("runtime", "research"):
            members = [{**item, "kind": "notice"} for item in common]
            members.extend({key: item[key] for key in ("path", "bytes", "sha256")} | {"kind": "asset"} for item in entries if item["storage"] == group)
            bundles[group] = write_bundle(output / f"ekg-lab-{group}-v{version}.zip", members)
        # Git-owned notices/metadata can be edited while a large ZIP compresses.
        # Reject that race rather than freezing mismatched inventory hashes.
        for item in entries + common:
            if digest(ROOT / item["path"]) != (item["bytes"], item["sha256"]):
                raise AssetError(f"Source changed during packaging: {item['path']}; rebuild after edits finish.")
        manifest = {
            "schemaVersion": 1,
            "version": version,
            "generatedAt": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "publicationStatus": "unpublished: download URLs intentionally null until the exact archives are public",
            "sourceCommit": catalog.get("reviewedSourceCommit"),
            "sourceCatalog": file_record(CATALOG),
            "licenseScope": "Source IDs identify separately licensed constituents. The original-code MIT license does not relicense external assets or derived data.",
            "pathMatching": "Ordered source-catalog globs use Python fnmatchcase; first match wins. Unknown scientific/binary fallback matches are rejected.",
            "sources": {item["id"]: item for item in catalog["sources"]},
            "commonFiles": common,
            "bundles": bundles,
            "assets": entries,
        }
        atomic_text(MANIFEST, json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
        update_ignore(entries)
        atomic_text(output / f"SHA256SUMS-v{version}.txt", "".join(f"{bundle['sha256']}  {bundle['fileName']}\n" for bundle in bundles.values()))
        for group, bundle in bundles.items():
            count = sum(item["storage"] == group for item in entries)
            print(f"{group}: {count} assets + {len(common)} notices; {bundle['bytes']:,} ZIP bytes; SHA-256 {bundle['sha256']}")
        print(f"Inventoried {len(entries)} assets; {sum(item['storage'] == 'git' for item in entries)} remain in Git.")
        print(f"Bundles: {output}")
        print("No source assets were removed or regenerated. Public download URLs remain null; offline --archive setup is available.")
        return 0
    except (AssetError, OSError, ValueError, KeyError) as error:
        print(f"Asset build error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
