#!/usr/bin/env python3
"""Restore checksum-pinned EKG Lab release assets using Python's standard library."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
MANIFEST = ROOT / "data" / "asset-manifest.json"
CHUNK = 1024 * 1024


class AssetError(Exception):
    """An actionable integrity, publication, or installation failure."""


def safe_relative(value: str) -> str:
    if not isinstance(value, str) or not value or "\\" in value or "\x00" in value:
        raise AssetError("An asset path is empty or contains an unsafe character.")
    path = PurePosixPath(value)
    if not path.parts or path.is_absolute() or any(part in {"", ".", ".."} or ":" in part for part in path.parts):
        raise AssetError(f"Unsafe asset path: {value!r}")
    if path.as_posix() != value:
        raise AssetError(f"Noncanonical asset path: {value!r}")
    return value


def checked_target(root: Path, relative: str) -> Path:
    relative = safe_relative(relative)
    current = root
    for part in PurePosixPath(relative).parts:
        current = current / part
        if current.is_symlink():
            raise AssetError(f"Refusing a symbolic link in asset destination: {relative}")
    if not current.resolve().is_relative_to(root.resolve()):
        raise AssetError(f"Asset destination escapes the checkout: {relative}")
    return current


def digest(path: Path) -> tuple[int, str]:
    count = 0
    sha = hashlib.sha256()
    with path.open("rb") as handle:
        while block := handle.read(CHUNK):
            count += len(block)
            sha.update(block)
    return count, sha.hexdigest()


def matches(path: Path, item: dict) -> bool:
    return path.is_file() and not path.is_symlink() and path.stat().st_size == item["bytes"] and digest(path)[1] == item["sha256"]


def validate_file_item(item: dict) -> None:
    safe_relative(item.get("path"))
    if type(item.get("bytes")) is not int or item["bytes"] < 0:
        raise AssetError(f"Invalid byte length in manifest: {item['path']}")
    if not isinstance(item.get("sha256"), str) or not re.fullmatch(r"[0-9a-f]{64}", item["sha256"]):
        raise AssetError(f"Invalid SHA-256 in manifest: {item['path']}")


def load_manifest(path: Path = MANIFEST) -> dict:
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError) as error:
        raise AssetError("Cannot read data/asset-manifest.json. Use a complete release source checkout.") from error
    if manifest.get("schemaVersion") != 1 or not isinstance(manifest.get("assets"), list):
        raise AssetError("Unsupported or incomplete asset manifest.")
    assets = {}
    casefolded = set()
    for item in manifest["assets"]:
        validate_file_item(item)
        name = item["path"]
        if name.casefold() in casefolded:
            raise AssetError(f"Duplicate/case-conflicting manifest path: {name}")
        casefolded.add(name.casefold())
        assets[name] = item
        if item.get("storage") not in {"git", "runtime", "research"}:
            raise AssetError(f"Unknown storage group: {name}")
        if type(item.get("required")) is not bool:
            raise AssetError(f"Missing required/optional role: {name}")
    common = {}
    for item in manifest.get("commonFiles", []):
        validate_file_item(item)
        if item["path"].casefold() in casefolded:
            raise AssetError(f"Duplicate common file: {item['path']}")
        casefolded.add(item["path"].casefold())
        common[item["path"]] = item
    if not common:
        raise AssetError("The manifest has no accompanying license/source notices.")
    for group in ("runtime", "research"):
        bundle = manifest.get("bundles", {}).get(group)
        if not isinstance(bundle, dict):
            raise AssetError(f"Missing {group} bundle metadata.")
        validate_file_item({**bundle, "path": bundle.get("fileName")})
        members = bundle.get("members")
        if not isinstance(members, list):
            raise AssetError(f"Missing member allowlist for {group}.")
        expected = {**common, **{name: item for name, item in assets.items() if item["storage"] == group}}
        seen = set()
        for item in members:
            validate_file_item(item)
            name = item["path"]
            if name in seen or name not in expected:
                raise AssetError(f"Unexpected or duplicate {group} allowlist member: {name}")
            seen.add(name)
            if any(item[key] != expected[name][key] for key in ("bytes", "sha256")):
                raise AssetError(f"Conflicting member checksum: {name}")
            if item.get("kind") != ("notice" if name in common else "asset"):
                raise AssetError(f"Conflicting member role: {name}")
        if seen != set(expected):
            raise AssetError(f"The {group} member allowlist is incomplete.")
    return manifest


def selected_files(manifest: dict, research: bool) -> list[dict]:
    return manifest["commonFiles"] + [item for item in manifest["assets"] if research or item["required"]]


def invalid_files(root: Path, items: list[dict]) -> list[str]:
    invalid = []
    for item in items:
        path = checked_target(root, item["path"])
        if not matches(path, item):
            invalid.append(item["path"])
    return invalid


def summarize_paths(paths: list[str], maximum: int = 12) -> str:
    text = "\n".join("  " + name for name in paths[:maximum])
    if len(paths) > maximum:
        text += f"\n  … and {len(paths) - maximum} more"
    return text


def check_archive(path: Path, bundle: dict) -> None:
    if not path.is_file() or path.is_symlink():
        raise AssetError(f"Archive is not a regular local file: {path.name}")
    if not matches(path, bundle):
        raise AssetError(f"Archive size or SHA-256 does not match {bundle['fileName']}. Use the archive for this exact source release.")


def install_archive(root: Path, archive: Path, bundle: dict) -> tuple[int, int]:
    """Verify the whole ZIP and exact member set before staging atomic file writes."""
    check_archive(archive, bundle)
    allowed = {item["path"]: item for item in bundle["members"]}
    changed = []
    reused = 0
    with zipfile.ZipFile(archive) as zipped, tempfile.TemporaryDirectory(prefix=".ekg-assets-", dir=root) as directory:
        infos = zipped.infolist()
        names = [safe_relative(info.filename) for info in infos]
        if len(names) != len(set(names)) or set(names) != set(allowed):
            raise AssetError("Archive members do not match the exact release allowlist.")
        for info in infos:
            item = allowed[info.filename]
            mode = info.external_attr >> 16
            file_type = stat.S_IFMT(mode)
            if info.is_dir() or file_type not in {0, stat.S_IFREG} or info.flag_bits & 1:
                raise AssetError(f"Archive member is not an unencrypted regular file: {info.filename}")
            if info.file_size != item["bytes"]:
                raise AssetError(f"Archive member size mismatch: {info.filename}")
            destination = checked_target(root, item["path"])
            reuse = matches(destination, item)
            if item["kind"] == "notice" and destination.exists() and not reuse:
                raise AssetError(f"A tracked notice differs from this release: {item['path']}. Use matching source/asset versions or rebuild the release; setup will not overwrite edited notices.")
            staged = Path(directory) / str(len(changed))
            sha = hashlib.sha256()
            count = 0
            output = None if reuse else staged.open("wb")
            try:
                with zipped.open(info) as member:
                    while block := member.read(CHUNK):
                        count += len(block)
                        if count > item["bytes"]:
                            raise AssetError(f"Archive member exceeds its declared size: {item['path']}")
                        sha.update(block)
                        if output:
                            output.write(block)
            finally:
                if output:
                    output.close()
            if count != item["bytes"] or sha.hexdigest() != item["sha256"]:
                raise AssetError(f"Archive member checksum mismatch: {item['path']}")
            if reuse:
                reused += 1
            else:
                changed.append((staged, item["path"]))
        # No destination is changed until every member has passed its checksum.
        for staged, relative in changed:
            destination = checked_target(root, relative)
            destination.parent.mkdir(parents=True, exist_ok=True)
            checked_target(root, relative)
            os.chmod(staged, 0o644)
            os.replace(staged, destination)
    return len(changed), reused


def download(url: str, bundle: dict, destination: Path) -> None:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise AssetError("Asset download URLs must be HTTPS URLs without embedded credentials. Use --archive for local/offline files.")
    request = urllib.request.Request(url, headers={"User-Agent": "EKG-Lab-Asset-Setup/1"})
    count = 0
    sha = hashlib.sha256()
    try:
        with urllib.request.urlopen(request, timeout=45) as response, destination.open("wb") as target:
            if urllib.parse.urlsplit(response.geturl()).scheme != "https":
                raise AssetError("Refusing an asset redirect to a non-HTTPS URL.")
            while block := response.read(CHUNK):
                count += len(block)
                if count > bundle["bytes"]:
                    raise AssetError(f"Downloaded archive exceeds the expected size for {bundle['fileName']}.")
                sha.update(block)
                target.write(block)
    except urllib.error.HTTPError as error:
        raise AssetError(f"Asset download returned HTTP {error.code}; use the matching --archive file if publication is unavailable.") from error
    except (urllib.error.URLError, TimeoutError) as error:
        raise AssetError("Asset download failed. Check network access or use the matching --archive file.") from error
    if count != bundle["bytes"] or sha.hexdigest() != bundle["sha256"]:
        raise AssetError(f"Downloaded archive fails the pinned size/SHA-256 check for {bundle['fileName']}.")


def run(args: argparse.Namespace) -> None:
    manifest = load_manifest()
    groups = ["runtime", "research"] if args.research else ["runtime"]
    if args.verify:
        if args.archive or args.url:
            raise AssetError("--verify checks installed files; do not combine it with --archive or --url.")
        items = selected_files(manifest, args.research)
        problems = invalid_files(ROOT, items)
        if problems:
            raise AssetError(f"{len(problems)} installed assets/notices are missing or differ:\n{summarize_paths(problems)}\nRun setup with the matching release archive(s); restore modified Git files from the matching source version.")
        print(f"Verified {len(items)} installed assets/notices (SHA-256; {'runtime and optional research' if args.research else 'required runtime'}).")
        return

    # Notices can be restored from a bundle, but Git-owned runtime assets must
    # come from the source checkout; setup never fetches/replaces application code.
    git_items = [item for item in selected_files(manifest, args.research) if item.get("storage") == "git"]
    problems = invalid_files(ROOT, git_items)
    if problems:
        raise AssetError(f"Git-owned assets are missing or changed:\n{summarize_paths(problems)}\nUse the matching complete source checkout or rebuild its manifest after intentional changes.")

    local = {}
    for value in args.archive:
        path = Path(value).expanduser().resolve()
        if not path.is_file():
            raise AssetError(f"Local archive does not exist: {path.name}")
        size, sha = digest(path)
        identified = next((group for group in groups if (size, sha) == (manifest["bundles"][group]["bytes"], manifest["bundles"][group]["sha256"])), None)
        if identified is None:
            raise AssetError(f"Local archive does not match a selected release bundle: {path.name}. Use --research for the optional research bundle, and the exact archive version from the manifest.")
        if identified in local:
            raise AssetError(f"More than one local archive supplied for {identified}.")
        local[identified] = path

    for group in groups:
        bundle = manifest["bundles"][group]
        missing = invalid_files(ROOT, bundle["members"])
        if not missing:
            print(f"{group}: all {len(bundle['members'])} files already match; no download needed.")
            continue
        url = args.url if group == groups[-1] and args.url else bundle.get("url")
        if group in local:
            written, reused = install_archive(ROOT, local[group], bundle)
        elif url:
            with tempfile.TemporaryDirectory(prefix=".ekg-assets-download-", dir=ROOT) as directory:
                archive = Path(directory) / bundle["fileName"]
                print(f"Downloading checksum-pinned {group} bundle…")
                download(url, bundle, archive)
                written, reused = install_archive(ROOT, archive, bundle)
        else:
            extra = " --research" if group == "research" else ""
            raise AssetError(f"The {group} bundle has not been published: its download URL is null. {len(missing)} files need restoration.\nObtain {bundle['fileName']} with the matching source release, then run:\n  python3 scripts/setup_assets.py{extra} --archive /path/to/{bundle['fileName']}\nAn explicitly supplied HTTPS --url mirror is also checked against the same pinned hashes. No credentials or numerical fitting are required.")
        print(f"{group}: restored {written} files; reused {reused} matching files.")
    problems = invalid_files(ROOT, selected_files(manifest, args.research))
    if problems:
        raise AssetError("Post-install verification failed:\n" + summarize_paths(problems))
    print("Asset setup complete. Start the app with npm start.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", action="append", default=[], metavar="ZIP", help="use a local pinned ZIP; repeat to supply runtime and research bundles")
    parser.add_argument("--url", metavar="HTTPS_URL", help="override the selected bundle's download URL without changing expected hashes")
    parser.add_argument("--research", action="store_true", help="also restore/verify optional research assets; --url then applies to that bundle")
    parser.add_argument("--verify", action="store_true", help="verify installed files without writing or downloading")
    args = parser.parse_args()
    try:
        run(args)
        return 0
    except (AssetError, OSError, zipfile.BadZipFile, EOFError) as error:
        print(f"Asset setup error: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
