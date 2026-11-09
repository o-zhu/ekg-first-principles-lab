#!/usr/bin/env python3
"""Fetch the exact open source files needed by import_stemi_examples.py.

Usage:
  python scripts/fetch_stemi_sources.py --source-dir /tmp/stemi-sources
  python scripts/import_stemi_examples.py --source-dir /tmp/stemi-sources

This accesses only public official PhysioNet and Figshare download endpoints.
Byte ranges retrieve the ACS ZIP directory and two selected records instead
of the entire 1.277 GB archive. Source ZIP CRCs and the label-archive MD5 are
checked. The large local ZIP is sparse; its allocated disk size is a few MB.
"""
import argparse
import hashlib
import io
import json
from pathlib import Path
import struct
import urllib.request
import zipfile

from import_stemi_examples import ACS_API, LUD_FILE, LUD_EX


def fetch(url, byte_range=None):
    headers = {'Range': 'bytes=' + byte_range} if byte_range else {}
    with urllib.request.urlopen(urllib.request.Request(url, headers=headers), timeout=60) as response:
        if byte_range and response.status != 206:
            raise RuntimeError('The source did not honor the requested byte range; full download refused.')
        return response.read()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    args = parser.parse_args()
    root = args.source_dir
    root.mkdir(parents=True, exist_ok=True)

    metadata_bytes = fetch(ACS_API)
    (root / 'acs-figshare.json').write_bytes(metadata_bytes)
    metadata = json.loads(metadata_bytes)
    assert metadata['license']['name'] == 'CC0'
    files = {f['name']: f for f in metadata['files']}
    label_info, raw_info = files['CSV.zip'], files['ECG_row_data.zip']
    labels = fetch(label_info['download_url'])
    assert hashlib.md5(labels).hexdigest() == label_info['computed_md5']
    (root / 'CSV.zip').write_bytes(labels)
    with zipfile.ZipFile(io.BytesIO(labels)) as archive:
        (root / 'train.csv').write_bytes(archive.read('CSV/train.csv'))

    size = raw_info['size']
    tail = fetch(raw_info['download_url'], f'{size - 131072}-{size - 1}')
    eocd = tail.rfind(b'PK\x05\x06')
    assert eocd >= 0
    signature, disk, central_disk, disk_count, total_count, directory_size, directory_offset, comment_length = struct.unpack('<4s4H2LH', tail[eocd:eocd + 22])
    assert disk == central_disk == 0 and disk_count == total_count and comment_length == 0
    assert directory_offset + directory_size <= size
    directory = fetch(raw_info['download_url'], f'{directory_offset}-{size - 1}')
    sparse_path = root / 'raw-sparse.zip'
    with sparse_path.open('wb') as sparse:
        sparse.seek(directory_offset)
        sparse.write(directory)

    with zipfile.ZipFile(sparse_path) as archive:
        # The listed member paths, sizes and byte offsets come from the actual
        # official central directory. Do not assume offsets from a prior run.
        for number in ['00004', '18206']:
            for extension in ['dat', 'hea']:
                member = 'row_data/' + number + '.' + extension
                info = archive.getinfo(member)
                local_header = fetch(raw_info['download_url'], f'{info.header_offset}-{info.header_offset + 29}')
                assert local_header[:4] == b'PK\x03\x04'
                name_length, extra_length = struct.unpack('<HH', local_header[26:30])
                end = info.header_offset + 30 + name_length + extra_length + info.compress_size
                content = fetch(raw_info['download_url'], f'{info.header_offset}-{end - 1}')
                with sparse_path.open('r+b') as sparse:
                    sparse.seek(info.header_offset)
                    sparse.write(content)
    # Reading via ZipFile checks the original ZIP member CRC32 during extraction.
    with zipfile.ZipFile(sparse_path) as archive:
        for number in ['00004', '18206']:
            for extension in ['dat', 'hea']:
                (root / ('acs-' + number + '.' + extension)).write_bytes(
                    archive.read('row_data/' + number + '.' + extension))

    for name in ['LICENSE.txt', 'SHA256SUMS.txt', 'ludb.csv', 'ANNOTATORS']:
        (root / name).write_bytes(fetch(LUD_FILE + name))
    for extension in ['dat', 'hea'] + LUD_EX:
        (root / ('21.' + extension)).write_bytes(fetch(LUD_FILE + 'data/21.' + extension))
    print('Downloaded and verified selected public source entries into ' + str(root))


if __name__ == '__main__':
    main()
