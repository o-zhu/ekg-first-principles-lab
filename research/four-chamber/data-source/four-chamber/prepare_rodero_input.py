#!/usr/bin/env python3
"""Retrieve and reproduce the Rodero population-average myocardial input.

Source: https://zenodo.org/records/4593739 (CC BY 4.0).
Paper: https://doi.org/10.1371/journal.pcbi.1008851.
Attribution and anatomical limitations are in RODERO_ATTRIBUTION.txt / README.md.

When the versioned byte-parts manifest and all parts are present, the script
first reassembles the exact retained NPZ without downloading or reading VTK.
Each part, the complete NPZ, and every canonical array are verified.
The compact downloadable ZIP omits the parts and uses the original source.

The original archive is checksum-pinned. Only its regular-file average.vtk
member is streamed to a chosen local path; archive paths are never extracted.
An existing matching archive or VTK is reused without a network request.
Every output array is checked against the retained model's canonical array
hash, independently of ZIP compression metadata. --verify-against can also
compare each shape, dtype, value, and ordering against a local reference NPZ.

Requires Python 3, NumPy, and VTK. Outputs stay beside this script by default,
outside dist/. No generated source archive is included in the small source ZIP.
"""

from pathlib import Path
import argparse
import hashlib
import json
import os
import shutil
import tarfile
import tempfile
import urllib.request

import numpy as np
import vtk
from vtk.util.numpy_support import vtk_to_numpy


ROOT = Path(__file__).resolve().parent
SOURCE_URL = "https://zenodo.org/api/records/4593739/files/average.tar.gz/content"
SOURCE_MD5 = "992f31e20c1aa73c10c5d9a6b6ac903a"
SOURCE_SHA256 = "d787d6470c8a4a6c7bfb808c55e44e35a7bc18f5888847e2b24380beae2703ee"
ARCHIVE_BYTES = 58_167_648
VTK_BYTES = 187_320_446
VTK_SHA256 = "b8e013832ccf9262d677ad3d6f140a76de6bb0a2d9734132ec9924a29eba8356"
MYOCARDIUM_BYTES = 51_941_194
MYOCARDIUM_SHA256 = "fcaf2e84123ace36721056535b5db566a2c84abdcb6c69c7a7054f1541d6ec7c"
BLOCK_BYTES = 1024 * 1024

# SHA-256 of each C-contiguous little-endian array, measured against the
# original retained rodero-myocardium.npz. The order is also the output order.
EXPECTED_ARRAY_SHA256 = {
    "points": "e85b54c31730a9a3160c49f081aeb0e3daaf0c3adf6f50f069833520305be751",
    "rho": "9d31b287afae6d2467a42f46afd93da9d2963f33b50302f4adb88715182fde69",
    "phi": "bdf8b7cbedb1b068fcfea1994c7073bff871681c7643d508de210f634d9d3ec6",
    "z": "9636c3e0f09288b5682444520d746d47700abec2883e2f83d0499d1348feb618",
    "v": "7c2f32bb07574b38658eb3e9d030ac096246eb61c874f07fa489df76c2a92127",
    "tetrahedra": "b4e968452add8efe08d81f52b10a94ff944e71c5a835e2c8fb5e27fd310154c3",
    "tags": "bb981e18f5c48e31c7d1ea189ec52f4b966cf143a3b3890e3b89661653abd985",
    "fibers": "f2fb9cf8d9bb0a741b4e4300d38f94c7fd72ec650c9a6cb403d90b14d9b28cd1",
    "sheets": "bcfbc4788ce9b2740eb8342e0de801fd94743743fa62464a2e985f1ff178ee64",
    "sourcePointIds": "030e9e78196ce587d43f912e0abbfe9c2427bb3ff09e2deb60333045db5ac6c2",
    "sourceTetIds": "f8553b6f2744db70a8633364b9f8b3c83db6fac402a344d2260f8950678af6eb",
}


def emit(message):
    print(message, flush=True)


def file_hashes(path, names=("sha256",)):
    hashes = {name: hashlib.new(name) for name in names}
    with Path(path).open("rb") as stream:
        for block in iter(lambda: stream.read(BLOCK_BYTES), b""):
            for digest in hashes.values():
                digest.update(block)
    return {name: digest.hexdigest() for name, digest in hashes.items()}


def verify_archive(path):
    if path.stat().st_size != ARCHIVE_BYTES:
        raise ValueError(f"Unexpected archive size: {path}")
    hashes = file_hashes(path, ("md5", "sha256"))
    if hashes != {"md5": SOURCE_MD5, "sha256": SOURCE_SHA256}:
        raise ValueError(f"Archive checksum mismatch; refusing to use {path}")
    return hashes


def verify_vtk(path):
    if path.stat().st_size != VTK_BYTES:
        raise ValueError(f"Unexpected VTK size: {path}")
    digest = file_hashes(path)["sha256"]
    if digest != VTK_SHA256:
        raise ValueError(f"VTK checksum mismatch; refusing to use {path}")
    return digest


def temporary_path(destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    handle, name = tempfile.mkstemp(
        prefix=destination.name + ".", suffix=".part", dir=destination.parent
    )
    os.close(handle)
    return Path(name)


def obtain_archive(path):
    if path.exists():
        emit(f"Reusing verified archive: {path}")
        return verify_archive(path)
    temporary = temporary_path(path)
    try:
        emit(f"Downloading {ARCHIVE_BYTES:,} bytes from {SOURCE_URL}")
        request = urllib.request.Request(
            SOURCE_URL, headers={"User-Agent": "CardiacVoltageReproducibility/1.0"}
        )
        size = 0
        with urllib.request.urlopen(request, timeout=60) as response, temporary.open("wb") as output:
            for block in iter(lambda: response.read(BLOCK_BYTES), b""):
                size += len(block)
                if size > ARCHIVE_BYTES:
                    raise ValueError("Download exceeded the pinned archive size")
                output.write(block)
        hashes = verify_archive(temporary)
        temporary.replace(path)
        return hashes
    finally:
        temporary.unlink(missing_ok=True)


def obtain_vtk(archive_path, vtk_path):
    archive_hashes = None
    if archive_path.exists():
        archive_hashes = verify_archive(archive_path)
    if vtk_path.exists():
        digest = verify_vtk(vtk_path)
        emit(f"Reusing verified VTK: {vtk_path}")
        return archive_hashes, digest
    if archive_hashes is None:
        archive_hashes = obtain_archive(archive_path)
    temporary = temporary_path(vtk_path)
    try:
        with tarfile.open(archive_path, "r:gz") as archive:
            matches = [member for member in archive.getmembers() if member.name == "average.vtk"]
            if len(matches) != 1 or not matches[0].isfile() or matches[0].size != VTK_BYTES:
                raise ValueError("Expected exactly one regular average.vtk member of the pinned size")
            # No extract()/extractall(): no archive-provided path, symlink,
            # ownership, mode, or timestamp is applied to the local filesystem.
            with archive.extractfile(matches[0]) as source, temporary.open("wb") as output:
                shutil.copyfileobj(source, output, length=BLOCK_BYTES)
        digest = verify_vtk(temporary)
        temporary.replace(vtk_path)
        emit(f"Extracted and verified VTK: {vtk_path}")
        return archive_hashes, digest
    finally:
        temporary.unlink(missing_ok=True)


def vtk_array(attributes, name):
    value = attributes.GetArray(name)
    if value is None:
        raise ValueError(f"Missing source VTK array: {name}")
    return vtk_to_numpy(value)


def build_myocardium(vtk_path):
    reader = vtk.vtkUnstructuredGridReader()
    reader.SetFileName(str(vtk_path))
    reader.ReadAllScalarsOn()
    reader.ReadAllVectorsOn()
    reader.ReadAllFieldsOn()
    reader.Update()
    grid = reader.GetOutput()
    if reader.GetErrorCode() or grid.GetNumberOfPoints() != 379_158 or grid.GetNumberOfCells() != 1_766_006:
        raise ValueError("VTK reader did not recover the expected original geometry")
    cell_types = vtk_to_numpy(grid.GetCellTypesArray())
    offsets = vtk_to_numpy(grid.GetCells().GetOffsetsArray())
    if not np.all(cell_types == vtk.VTK_TETRA) or not np.all(np.diff(offsets) == 4):
        raise ValueError("Source contains a non-tetrahedral cell")
    tet = vtk_to_numpy(grid.GetCells().GetConnectivityArray()).reshape(-1, 4).astype("<i4")
    original_tags = vtk_array(grid.GetCellData(), "ID")
    source_tet_ids = np.flatnonzero((original_tags >= 1) & (original_tags <= 4)).astype("<i4")
    source_point_ids = np.unique(tet[source_tet_ids]).astype("<i4")
    if len(source_point_ids) != 326_448 or len(source_tet_ids) != 1_526_530:
        raise ValueError("Unexpected myocardial subset size")
    remap = np.full(grid.GetNumberOfPoints(), -1, dtype="<i4")
    remap[source_point_ids] = np.arange(len(source_point_ids), dtype="<i4")

    arrays = {
        "points": np.ascontiguousarray(vtk_to_numpy(grid.GetPoints().GetData())[source_point_ids], dtype="<f4")
    }
    for name, source_name in [("rho", "RHO.dat"), ("phi", "PHI.dat"), ("z", "Z.dat"), ("v", "V.dat")]:
        arrays[name] = np.ascontiguousarray(vtk_array(grid.GetPointData(), source_name)[source_point_ids], dtype="<f4")
    arrays.update(
        tetrahedra=remap[tet[source_tet_ids]],
        tags=np.ascontiguousarray(original_tags[source_tet_ids], dtype="u1"),
        fibers=np.ascontiguousarray(vtk_array(grid.GetCellData(), "fibres")[source_tet_ids], dtype="<f4"),
        sheets=np.ascontiguousarray(vtk_array(grid.GetCellData(), "sheets")[source_tet_ids], dtype="<f4"),
        sourcePointIds=source_point_ids,
        sourceTetIds=source_tet_ids,
    )
    return arrays


def validate_arrays(arrays, reference_path=None):
    if list(arrays) != list(EXPECTED_ARRAY_SHA256):
        raise ValueError("Unexpected output array keys/order")
    validation = {}
    for name, array in arrays.items():
        digest = hashlib.sha256(array.tobytes(order="C")).hexdigest()
        if digest != EXPECTED_ARRAY_SHA256[name]:
            raise ValueError(f"Canonical array checksum mismatch: {name}")
        validation[name] = {
            "shape": list(array.shape), "dtype": array.dtype.str,
            "sha256": digest, "matchesCanonicalArray": True,
        }
    if reference_path is not None:
        with np.load(reference_path, allow_pickle=False) as reference:
            if set(reference.files) != set(arrays):
                raise ValueError("Reference NPZ has different keys")
            for name, array in arrays.items():
                expected = reference[name]
                exact = array.shape == expected.shape and array.dtype == expected.dtype and np.array_equal(array, expected)
                if not exact:
                    raise ValueError(f"Reference array differs in shape, dtype, values, or ordering: {name}")
                validation[name].update(
                    referenceArrayEqual=True,
                    referenceMaxAbsoluteDifference=float(np.max(np.abs(array.astype(np.float64) - expected))),
                )
    return validation


def save_arrays(destination, arrays):
    temporary = temporary_path(destination)
    try:
        with temporary.open("wb") as stream:
            np.savez_compressed(stream, **arrays)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)


def reassemble_parts(manifest_path, destination, reference_path=None):
    """Return verified arrays/report, or None when byte parts are unavailable."""
    if not manifest_path.exists():
        return None
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("sha256") != MYOCARDIUM_SHA256 or manifest.get("bytes") != MYOCARDIUM_BYTES:
        raise ValueError("Parts manifest does not identify the canonical myocardial NPZ")
    parts = manifest.get("parts", [])
    if not parts or sum(part["bytes"] for part in parts) != MYOCARDIUM_BYTES:
        raise ValueError("Invalid byte-parts sizes in manifest")
    names = [part["filename"] for part in parts]
    if len(set(names)) != len(names) or any(Path(name).name != name for name in names):
        raise ValueError("Part names must be distinct local filenames, without directories")
    part_paths = [manifest_path.parent / name for name in names]
    if not all(path.is_file() for path in part_paths):
        emit("Byte parts are incomplete; using the pinned original-source retrieval path")
        return None
    if destination in {manifest_path.resolve(), *(path.resolve() for path in part_paths)}:
        raise ValueError("Output NPZ must not overwrite a byte part or its manifest")

    emit(f"Reassembling {len(parts)} verified byte parts; no source download is needed")
    temporary = temporary_path(destination)
    full_digest = hashlib.sha256()
    try:
        with temporary.open("wb") as output:
            for part, path in zip(parts, part_paths):
                if path.stat().st_size != part["bytes"]:
                    raise ValueError(f"Byte-part size mismatch: {path}")
                digest = hashlib.sha256()
                with path.open("rb") as source:
                    for block in iter(lambda: source.read(BLOCK_BYTES), b""):
                        digest.update(block)
                        full_digest.update(block)
                        output.write(block)
                if digest.hexdigest() != part["sha256"]:
                    raise ValueError(f"Byte-part checksum mismatch: {path}")
        if temporary.stat().st_size != MYOCARDIUM_BYTES or full_digest.hexdigest() != MYOCARDIUM_SHA256:
            raise ValueError("Reassembled NPZ does not match the complete canonical checksum")
        with np.load(temporary, allow_pickle=False) as archive:
            arrays = {name: archive[name] for name in archive.files}
        validation = validate_arrays(arrays, reference_path)
        temporary.replace(destination)
        return arrays, validation, {
            "manifest": str(manifest_path),
            "manifestSHA256": file_hashes(manifest_path)["sha256"],
            "bytes": MYOCARDIUM_BYTES,
            "sha256": full_digest.hexdigest(),
            "parts": parts,
            "allPartHashesVerified": True,
        }
    finally:
        temporary.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--archive", type=Path, default=ROOT / "source-downloads/average.tar.gz", help="Existing archive or download destination")
    parser.add_argument("--vtk", type=Path, default=ROOT / "source-downloads/average.vtk", help="Existing original VTK or safe extraction destination")
    parser.add_argument("--output", type=Path, default=ROOT / "rodero-myocardium.npz", help="Reproduced myocardial NPZ")
    parser.add_argument("--report", type=Path, default=None, help="Validation JSON; defaults beside --output")
    parser.add_argument("--verify-against", type=Path, default=None, help="Optional retained NPZ for explicit array-by-array equality")
    parser.add_argument("--parts-manifest", type=Path, default=ROOT / "rodero-myocardium-parts.json", help="Optional local byte-parts manifest; checked before original-source retrieval")
    args = parser.parse_args()
    archive_path, vtk_path, output_path = (path.resolve() for path in (args.archive, args.vtk, args.output))
    report_path = (args.report or output_path.with_name("rodero-input-validation.json")).resolve()
    if len({archive_path, vtk_path, output_path, report_path}) != 4:
        parser.error("Archive, VTK, output NPZ, and report must have distinct paths")

    assembled = reassemble_parts(args.parts_manifest.resolve(), output_path, args.verify_against)
    archive_hashes = vtk_digest = parts_info = None
    if assembled is not None:
        arrays, validation, parts_info = assembled
    else:
        archive_hashes, vtk_digest = obtain_vtk(archive_path, vtk_path)
        emit("Reading original VTK and retaining myocardial labels 1–4")
        arrays = build_myocardium(vtk_path)
        validation = validate_arrays(arrays, args.verify_against)
        save_arrays(output_path, arrays)
    report = {
        "source": "https://zenodo.org/records/4593739",
        "downloadUrl": SOURCE_URL,
        "paper": "https://doi.org/10.1371/journal.pcbi.1008851",
        "license": "CC-BY-4.0",
        "preparationMethod": "verified byte-part reassembly" if parts_info else "verified original VTK extraction",
        "verifiedByteParts": parts_info,
        "archiveBytes": ARCHIVE_BYTES,
        "expectedArchiveMD5": SOURCE_MD5,
        "expectedArchiveSHA256": SOURCE_SHA256,
        "archiveVerifiedThisRun": archive_hashes is not None,
        "verifiedArchiveHashes": archive_hashes,
        "vtkBytes": VTK_BYTES,
        "verifiedVTKSHA256": vtk_digest,
        "numpyVersion": np.__version__,
        "vtkVersion": vtk.vtkVersion.GetVTKVersion(),
        "originalPointCount": 379_158,
        "originalTetCount": 1_766_006,
        "myocardialPointCount": len(arrays["points"]),
        "myocardialTetCount": len(arrays["tetrahedra"]),
        "ordering": "Original tetrahedral order restricted to tags 1–4; ascending original point IDs; local tetrahedral vertex order unchanged.",
        "referenceCompared": str(args.verify_against.resolve()) if args.verify_against else None,
        "arrays": validation,
        "outputSHA256": file_hashes(output_path)["sha256"],
    }
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    emit(f"Wrote {output_path}: {len(arrays['points']):,} points, {len(arrays['tetrahedra']):,} tetrahedra")
    emit(f"All {len(arrays)} canonical array checks passed. Validation: {report_path}")


if __name__ == "__main__":
    main()
