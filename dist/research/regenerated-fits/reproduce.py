#!/usr/bin/env python3
"""Reproduce the 22 regenerated cases using the bundled original source releases.

Writes only into the explicitly chosen working directory and the requested
website's case-data directory. The original two deep-fit cases are excluded.
"""
from pathlib import Path
import argparse
import importlib.util
import os
import shutil
import stat
import subprocess
import sys
import zipfile


def extract_regular_files(archive, destination):
    destination = destination.resolve()
    with zipfile.ZipFile(archive) as bundle:
        for item in bundle.infolist():
            target = (destination / item.filename).resolve()
            if not target.is_relative_to(destination):
                raise ValueError('Unsafe archive member: ' + item.filename)
            mode = item.external_attr >> 16
            if stat.S_ISLNK(mode):
                raise ValueError('Symlink archive member: ' + item.filename)
            if item.is_dir():
                target.mkdir(parents=True, exist_ok=True)
            else:
                target.parent.mkdir(parents=True, exist_ok=True)
                with bundle.open(item) as source, target.open('wb') as output:
                    shutil.copyfileobj(source, output)


def main():
    here = Path(__file__).resolve().parent
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--site', type=Path, default=here.parents[1],
                        help='Website directory containing index.html and data/.')
    parser.add_argument('--work-dir', type=Path, required=True,
                        help='Isolated working directory; several GB of free space recommended.')
    parser.add_argument('--case', help='Optional single new case ID. Omit to regenerate all 22.')
    parser.add_argument('--skip-operators', action='store_true',
                        help='Reuse a previously completed operator cache in this working directory.')
    args = parser.parse_args()
    site = args.site.resolve()
    work = args.work_dir.resolve()
    if work == site or work.is_relative_to(site):
        raise ValueError('Choose a work directory outside the packaged website.')
    work.mkdir(parents=True, exist_ok=True)
    heart_release = site / 'cardiac-voltage/data/heart-model-reproducible-source.zip'
    pathology_release = site / 'data/pathology-fits/propagation-research.zip'
    for release in [heart_release, pathology_release]:
        extract_regular_files(release, work)
    (work / 'scripts').mkdir(exist_ok=True)
    shutil.copy2(here / 'scripts/regenerate_all_cases.py', work / 'scripts/regenerate_all_cases.py')
    shutil.copy2(here / 'clinical-events.json', work / 'clinical-events.json')
    model_dest = work / 'dist/cardiac-voltage/data'
    model_dest.mkdir(parents=True, exist_ok=True)
    shutil.copy2(site / 'cardiac-voltage/data/heart-model.json', model_dest / 'heart-model.json')
    shutil.copy2(heart_release, model_dest / heart_release.name)
    os.environ['OPENBLAS_NUM_THREADS'] = '2'
    os.environ['OMP_NUM_THREADS'] = '2'
    os.environ['EKG_LAB_SITE'] = str(site)
    if not args.skip_operators:
        source = work / 'scripts/fit-pathology-prepare.py'
        spec = importlib.util.spec_from_file_location('prepare_original_operator', source)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        # Reuse the source scripts in the isolated extraction. The exact mesh
        # download and every canonical array are checked by the original code.
        module.WORK = work
        module.SRC = work / 'data-source/four-chamber'
        # Only the two retained legacy RBBB experiments need those auxiliary
        # slow-RV maps. The new cases use the native 15 delivery-site maps.
        module.RV_FACTORS = module.np.array([], dtype=float)
        original_argv = sys.argv
        try:
            sys.argv = [str(source), '--midpoint']
            module.main()
        finally:
            sys.argv = original_argv
    command = [sys.executable, str(work / 'scripts/regenerate_all_cases.py')]
    if args.case:
        command += ['--case', args.case]
    subprocess.run(command, cwd=work, env=os.environ.copy(), check=True)


if __name__ == '__main__':
    main()
