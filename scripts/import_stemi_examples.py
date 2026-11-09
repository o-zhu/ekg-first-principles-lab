#!/usr/bin/env python3
"""Import source-labeled STEMI ECGs from unmodified downloaded WFDB files.

Inputs are the public source files, not images or synthetic templates. Run:
  python scripts/import_stemi_examples.py --source-dir /tmp/stemi5

Source acquisition and archive member locators are written to the provenance
JSON. This importer deliberately does not need a network connection. It uses
the Python standard library and fails on unexpected formats or integrity.
"""
import argparse
import array
import csv
import hashlib
import json
import math
from pathlib import Path
import re
import statistics
import sys
import zipfile
import zlib

LEADS = ['I', 'II', 'III', 'aVR', 'aVL', 'aVF', 'V1', 'V2', 'V3', 'V4', 'V5', 'V6']
LUD_EX = ['i', 'ii', 'iii', 'avr', 'avl', 'avf', 'v1', 'v2', 'v3', 'v4', 'v5', 'v6']
ACS_SOURCE = 'https://doi.org/10.6084/m9.figshare.29925314'
ACS_PAGE = 'https://springernature.figshare.com/articles/dataset/A_large-scale_12-lead_electrocardiogram_dataset_for_acute_coronary_syndrome_prediction_containing_19_955_ECGs/29925314'
ACS_PAPER = 'https://www.nature.com/articles/s41597-026-07278-0'
ACS_API = 'https://api.figshare.com/v2/articles/29925314'
ACS_RAW_URL = 'https://ndownloader.figshare.com/files/62951395'
ACS_LABEL_URL = 'https://ndownloader.figshare.com/files/62951134'
LUD_SOURCE = 'https://physionet.org/content/ludb/1.0.1/'
LUD_FILE = 'https://physionet.org/files/ludb/1.0.1/'
ACS_ATTRIBUTION = ('Du, X.-Y., Liu, Y., Wang, L.-L., He, W.-Y., Yang, J.-Y., '
                   'Bin, G.-Y., & Deng, G.-L. (2026). A large-scale 12-lead '
                   'electrocardiogram dataset for acute coronary syndrome prediction '
                   'containing 19,955 ECGs. Figshare. DOI: 10.6084/m9.figshare.29925314.v1. '
                   'Associated paper: Scientific Data 13, 1009 (2026), '
                   'DOI: 10.1038/s41597-026-07278-0.')
LUD_ATTRIBUTION = ('Kalyakulina, A., Yusipov, I., Moskalenko, V., Nikolskiy, A., '
                   'Kosonogov, K., Zolotykh, N., & Ivanchenko, M. (2021). '
                   'Lobachevsky University Electrocardiography Database (version 1.0.1). '
                   'PhysioNet. DOI: 10.13026/eegm-h675. Original publication: '
                   'Kalyakulina et al., LUDB: A New Open-Access Validation Tool for '
                   'Electrocardiogram Delineation Algorithms, IEEE Access 8, '
                   '186181–186190 (2020), DOI: 10.1109/ACCESS.2020.3029211.')


def sha(data):
    return hashlib.sha256(data).hexdigest()


def read_wfdb(root, stem):
    raw = (root / (stem + '.dat')).read_bytes()
    header = (root / (stem + '.hea')).read_text()
    lines = header.splitlines()
    fields = lines[0].split()
    count, fs, samples = int(fields[1]), int(fields[2]), int(fields[3])
    assert count == 12 and fs == 500 and samples == 5000
    assert len(raw) == count * samples * 2
    words = array.array('h', raw)
    if sys.byteorder != 'little':
        words.byteswap()
    signals, calibration, integrity = {}, {}, {}
    for i, line in enumerate(lines[1:13]):
        f = line.split()
        assert f[1] == '16'
        match = re.fullmatch(r'([\d.]+)\((-?\d+)\)/mV', f[2])
        assert match
        gain, baseline = float(match[1]), int(match[2])
        name = LEADS[LUD_EX.index(f[-1])] if f[-1] in LUD_EX else f[-1]
        digital = list(words[i::12])
        signals[name] = [(v - baseline) / gain for v in digital]
        calibration[name] = {'adcGain': gain, 'adcBaseline': baseline, 'units': 'mV'}
        integrity[name] = {
            'headerInitialValue': int(f[5]), 'actualInitialValue': digital[0],
            'headerChecksum': int(f[6]), 'actualChecksumUnsigned16': sum(digital) & 65535,
            'checksumMatches': (sum(digital) & 65535) == (int(f[6]) & 65535),
            'initialMatches': digital[0] == int(f[5]),
            'headerInitialEqualsMaximum': int(f[5]) == max(digital),
            'headerChecksumEqualsMinimum': int(f[6]) == min(digital),
        }
    assert set(signals) == set(LEADS)
    return signals, calibration, integrity, header, raw


def annotation_waves(path):
    """Read this source's simple WFDB ( onset / peak / ) annotations.

    All encountered annotation codes are asserted. A future source format
    change fails rather than silently misdecoding extended annotations.
    """
    raw = path.read_bytes()
    assert len(raw) % 2 == 0
    events, sample = [], 0
    for i in range(0, len(raw), 2):
        low, high = raw[i:i + 2]
        code, delta = high >> 2, low + ((high & 3) << 8)
        if code == 0 and delta == 0:
            break
        assert code in {1, 24, 27, 39, 40}, (path, code)
        sample += delta
        events.append((sample, code))
    waves = {'p': [], 'qrs': [], 't': []}
    names = {1: 'qrs', 24: 'p', 27: 't'}
    for i, (sample, code) in enumerate(events):
        if code in names:
            assert i > 0 and i + 1 < len(events)
            onset, open_code = events[i - 1]
            offset, close_code = events[i + 1]
            assert open_code == 39 and close_code == 40 and onset <= sample <= offset
            waves[names[code]].append({'onset': onset / 500, 'peak': sample / 500, 'offset': offset / 500})
    return waves


def acs_record(root, number, territory, lead, anchors, source_rows, archive):
    signals, calibration, integrity, header, raw = read_wfdb(root, 'acs-' + number)
    row = source_rows[number + '.dat']
    assert all(row[k] == '1' for k in ['STEMI', 'AMI', 'OMI'])
    assert all(row[k] == '0' for k in ['CTO', 'Paced', 'VF_VT', 'Prior_PCI'])
    vessel_code = 'PLAD' if territory == 'anterior' else 'PRCA'
    vessel_name = 'proximal left anterior descending artery' if territory == 'anterior' else 'proximal right coronary artery'
    assert row[vessel_code] == '1'
    members = {}
    for extension in ['dat', 'hea']:
        member = 'row_data/' + number + '.' + extension
        contents = (root / ('acs-' + number + '.' + extension)).read_bytes()
        info = archive.getinfo(member)
        assert zlib.crc32(contents) & 0xffffffff == info.CRC
        members[member] = {'byteCount': len(contents), 'archiveCRC32': f'{info.CRC:08x}',
                           'archiveCRC32Verified': True, 'sha256': sha(contents)}
    # This is a reproducible source-header issue, not a failed download:
    # source header initial/checksum slots hold each channel's maximum/minimum.
    assert all(v['headerInitialEqualsMaximum'] and v['headerChecksumEqualsMinimum'] for v in integrity.values())
    assert not any(v['checksumMatches'] for v in integrity.values())
    rate = 60 / statistics.median(b - a for a, b in zip(anchors, anchors[1:]))
    clinical_flags = {key: int(value) for key, value in row.items()
                      if key not in ['Patient_id', 'ecg_row_record', 'ecg_med_record', 'gender', 'age', 'Time_Interval']}
    notes = [
        'Authentic deidentified patient recording. Source discharge diagnosis: STEMI; source angiographic labels: acute occlusion (OMI) and ' + vessel_name + '.',
        'The ' + territory + ' pattern is a teaching interpretation of the recorded lead distribution, not a separately supplied source territory diagnosis or a patient-specific injury map.',
        'All 12 original channels and all 5,000 samples per channel are retained at 500 Hz. Header gain/baseline conversion to mV is the only signal transformation; no filtering, interpolation, normalization or denoising was applied.',
        'QRS peaks were estimated from lead I and visually reviewed. The animation places QRS onset 40 ms before each peak and P onset 160 ms before that illustrative onset; those offsets are not measured patient intervals.',
        'Source waveform noise and baseline variations remain visible. The anatomical activation, highlighted territory, recovery and contraction are schematic teaching illustrations.',
    ]
    description = ('Recorded 12-lead ECG with source discharge diagnosis STEMI and angiographic acute occlusion of the ' + vessel_name + '. ')
    description += ('Inspect the anterior ST changes in V1–V3; this is the source paper’s illustrated STEMI case. ' if territory == 'anterior'
                    else 'Compare inferior leads II, III and aVF with reciprocal changes in I and aVL. ')
    description += ('The ' + territory + ' label describes the teaching pattern; the source supplies STEMI and the culprit vessel, not a separately adjudicated wall-location label.')
    profile = {
        'title': 'STEMI · ' + territory + ' pattern',
        'config': {'rate': round(rate, 3)},
        'electrical': 'Acute regional myocardial injury can shift the ST segment. The recorded ECG is source-labeled STEMI with acute ' + vessel_name + ' occlusion; the highlighted ' + territory + ' region explains the lead projection schematically.',
        'mechanical': 'The ventricular reference motion follows estimated QRS landmarks. This recording does not measure regional wall motion, infarct size, viability or ejection fraction. Atrial timing is prescribed relative to QRS rather than extracted from this recording.',
        'observe': ('Compare V2 and V3 with the limb leads. The waveform is the actual recording used for the STEMI illustration in the source paper.' if territory == 'anterior'
                    else 'Compare II, III and aVF with I and aVL. Follow the original ST changes and preserved noise; the source verifies STEMI and proximal RCA occlusion.'),
    }
    record = {
        'id': 'acs-' + number, 'ecgId': number, 'conditionId': 'stemi-' + territory,
        'title': profile['title'], 'description': description,
        'tags': ['STEMI', territory.title() + ' pattern', 'Real recording', vessel_code + ' occlusion'],
        'source': 'ACS ECG dataset · Figshare v1', 'sourceLabel': 'ACS ' + number,
        'sourceUrl': ACS_SOURCE, 'recordUrl': ACS_PAGE, 'sourcePaperUrl': ACS_PAPER,
        'recordLocator': 'ECG_row_data.zip / row_data/' + number + '.dat and .hea; CSV.zip / CSV/train.csv, ecg_row_record=' + number + '.dat',
        'downloadUrl': ACS_RAW_URL, 'metadataUrl': ACS_LABEL_URL,
        'license': 'CC0 1.0', 'licenseUrl': 'https://creativecommons.org/publicdomain/zero/1.0/',
        'attribution': ACS_ATTRIBUTION, 'fs': 500, 'seconds': 10, 'sampleCount': 5000,
        'units': 'mV', 'leadOrder': LEADS, 'recommendedLead': lead, 'signals': signals,
        'kind': 'recorded', 'synthetic': False, 'group': 'ischemia',
        'injuryTerritory': territory, 'injuryLabel': territory.title() + ' teaching pattern · source-confirmed STEMI',
        'sourceLabels': [
            {'code': 'STEMI', 'description': 'ST-elevation myocardial infarction, from discharge diagnosis', 'value': 1},
            {'code': 'AMI', 'description': 'Acute myocardial infarction, from discharge diagnosis', 'value': 1},
            {'code': 'OMI', 'description': 'Acute culprit-vessel occlusion with TIMI flow grade 0 or 1 before PCI', 'value': 1},
            {'code': vessel_code, 'description': vessel_name + ' occlusion', 'value': 1},
        ],
        'sourceClinicalFlags': clinical_flags,
        'sourcePatientId': row['Patient_id'],
        'sourceTimeToAngiographyMinutes': int(row['Time_Interval']),
        'sourceTerritoryLabel': None,
        'territoryInterpretation': 'ECG teaching interpretation, supported by the lead distribution and source culprit-vessel label; not a separately provided source territory diagnosis.',
        'labelExplanation': 'Diagnostic and culprit-vessel flags are taken from the source CSV. They are not PTB-XL SCP codes or confidence percentages. No independent clinical adjudication was performed for this website.',
        'coexistingFindings': ['Source labels acute occlusion of the ' + vessel_name + '.',
                              'ECG recorded ' + row['Time_Interval'] + ' minutes before angiography, according to source metadata.'],
        'notes': notes, 'calibration': calibration,
        'recordSha256': sha(raw), 'checksumVerified': False, 'archiveCRC32Verified': True,
        'integrityNote': 'ZIP entry CRC32 verified for raw data and header. Source WFDB initial-value and checksum fields contain channel maxima/minima rather than valid WFDB initial values/checksums; that source-header defect is preserved in provenance and not used for calibration.',
        'teaching': {'conditionId': 'stemi-' + territory, 'profile': profile,
                     'ventricularAnchors': anchors, 'anchorOffset': 0.04,
                     'atrialOnsets': None, 'atrialTimingAvailable': False,
                     'anchorLead': 'I', 'qrsAnchorSource': 'visually-reviewed-recorded-qrs-peaks',
                     'anchorUnits': 'seconds from recording start',
                     'anchorStatus': 'Estimated QRS extrema for synchronization; not validated clinical annotations.',
                     'notes': notes[3:],
                     'mechanismModelNote': 'All anatomical activation, recovery and mechanics are illustrative; only the displayed ECG waveform is measured data.'},
        'timingProvenance': {'qrsAnchorSource': 'visually-reviewed-recorded-qrs-peaks',
                             'qrsOnsetSource': 'fixed-40-ms-offset-from-estimated-peak',
                             'atrialTimingSource': 'prescribed-160-ms-before-illustrative-qrs-onset',
                             'mechanicsSource': 'illustrative', 'signalSource': 'recorded'},
    }
    provenance = {'id': record['id'], 'sourceMetadataRow': row, 'sourceHeader': header,
                  'sourceMembers': members, 'channelIntegrityReview': integrity,
                  'integrityNote': record['integrityNote'], 'sourcePaperUrl': ACS_PAPER,
                  'sourceArchiveUrl': ACS_RAW_URL, 'sourceCsvArchiveUrl': ACS_LABEL_URL,
                  'sourceLicense': record['license'], 'sourceLicenseUrl': record['licenseUrl'],
                  'processing': 'Little-endian WFDB format16, gain1000 digital units/mV and baseline0. All original samples retained. No additional signal processing.',
                  'timingProvenance': record['timingProvenance'],
                  'territoryInterpretation': record['territoryInterpretation']}
    return record, provenance


def ludb_record(root):
    signals, calibration, integrity, header, raw = read_wfdb(root, '21')
    assert all(v['checksumMatches'] and v['initialMatches'] for v in integrity.values())
    checksums = dict((line.split()[1].lstrip('*'), line.split()[0])
                     for line in (root / 'SHA256SUMS.txt').read_text().splitlines())
    files = {}
    for ext in ['hea', 'dat'] + LUD_EX:
        contents = (root / ('21.' + ext)).read_bytes()
        digest = sha(contents)
        assert digest == checksums['data/21.' + ext]
        files['data/21.' + ext] = {'sha256': digest, 'sourceSHA256Verified': True,
                                   'sourceUrl': LUD_FILE + 'data/21.' + ext}
    original = {lead: annotation_waves(root / ('21.' + ext)) for lead, ext in zip(LEADS, LUD_EX)}
    start, end = 1.6, 8.2
    start_sample, end_sample = 800, 4100
    signals = {lead: values[start_sample:end_sample] for lead, values in signals.items()}
    annotations = {lead: {kind: [{key: round(value - start, 3) for key, value in wave.items()}
                                for wave in waves if wave['onset'] >= start and wave['offset'] < end]
                           for kind, waves in groups.items()}
                   for lead, groups in original.items()}
    qrs, p = annotations['II']['qrs'], annotations['II']['p']
    assert len(qrs) == len(p) == 8
    for pw, qw in zip(p, qrs):
        assert .08 <= qw['onset'] - pw['onset'] <= .6
    source_labels = [line.lstrip('#').strip().rstrip('.') for line in header.splitlines()
                     if line.startswith('#') and not line.startswith('#<')]
    notes = [
        'Authentic clinical excerpt from LUDB record21. The source explicitly labels STEMI in the anterior, lateral, septal and apical regions; this is not an isolated lateral infarct.',
        'The source also labels left anterior hemiblock and left axis deviation. The displayed lateral focus is a teaching emphasis within the source’s overlapping diagnoses.',
        'The original recording is10seconds at500Hz. This excerpt keeps original seconds1.6 through8.2, where complete P/QRS complexes have supplied cardiologist annotations. All12leads and3,300samples per channel are retained for that interval.',
        'Source gain and baseline conversion to mV and the documented time crop are the only transformations. No filtering, resampling, normalization or artifact removal was applied.',
        'The real tracing includes evolving ST/T changes and visible baseline variation in V5–V6. It is not a clean synthetic lateral-ST-elevation template.',
        'P and QRS event timings use the source cardiologists’ lead-II onset, peak and end annotations, shifted by the1.6second excerpt offset. Spatial electrical spread, recovery and every contraction remain schematic rather than patient-specific.',
    ]
    # Keep prose naturally spaced; the strings above are explicit about numbers.
    notes = [s.replace('record21', 'record 21').replace('is10seconds', 'is 10 seconds')
              .replace('at500Hz', 'at 500 Hz').replace('seconds1.6', 'seconds 1.6')
              .replace('through8.2', 'through 8.2').replace('All12leads', 'All 12 leads')
              .replace('and3,300samples', 'and 3,300 samples').replace('the1.6second', 'the 1.6 second')
             for s in notes]
    profile = {
        'title': 'STEMI · anterolateral / overlapping regions',
        'config': {'rate': round(60 / statistics.median(b['peak'] - a['peak'] for a, b in zip(qrs, qrs[1:])), 3)},
        'electrical': 'The source labels anterior, lateral, septal and apical STEMI together with left anterior hemiblock and left axis deviation. The recorded ST/T morphology is a real, mixed presentation rather than an isolated textbook lateral pattern.',
        'mechanical': 'P and QRS timing follows source cardiologist annotations in lead II. The lateral highlight is an educational focus, not a reconstruction of the complete injury extent. Contraction and regional activation remain generic and do not measure this patient’s ventricular function.',
        'observe': 'Compare V5 and V6 with I/aVL and the anterior leads. Preserve the source’s overlapping territories and coexisting hemiblock when interpreting this example; baseline drift and evolving ST/T changes remain visible.',
    }
    record = {
        'id': 'ludb-021', 'ecgId': '21', 'conditionId': 'stemi-lateral',
        'title': profile['title'],
        'description': 'Real LUDB recording with source-labeled anterior, lateral, septal and apical STEMI, plus left anterior hemiblock and left axis deviation. This fully annotated excerpt illustrates the lateral component of a mixed presentation; it is not an isolated lateral infarct or an idealized ST-elevation template.',
        'tags': ['STEMI', 'Overlapping territories', 'Anterolateral', 'Source-annotated timing'],
        'source': 'PhysioNet · LUDB v1.0.1', 'sourceLabel': 'LUDB 21',
        'sourceUrl': LUD_SOURCE, 'recordUrl': LUD_SOURCE + 'data/21.hea',
        'downloadUrl': LUD_FILE + 'data/21.dat', 'metadataUrl': LUD_SOURCE + 'ludb.csv',
        'license': 'ODC-By 1.0', 'licenseUrl': 'https://opendatacommons.org/licenses/by/1-0/',
        'attribution': LUD_ATTRIBUTION, 'fs': 500, 'seconds': 6.6, 'sampleCount': 3300,
        'sourceDurationSeconds': 10, 'sourceSampleCount': 5000,
        'sourceStartSeconds': start, 'sourceEndSeconds': end,
        'units': 'mV', 'leadOrder': LEADS, 'recommendedLead': 'V5', 'signals': signals,
        'kind': 'recorded', 'synthetic': False, 'group': 'ischemia',
        'injuryTerritory': 'lateral', 'injuryTerritories': ['anterior', 'lateral', 'septal', 'apical'],
        'injuryLabel': 'Lateral teaching focus · overlapping source STEMI territories',
        'sourceLabels': [{'description': label} for label in source_labels],
        'sourceDiagnosisText': source_labels, 'sourceTerritoryLabels': ['anterior wall', 'lateral wall', 'septal', 'apical'],
        'labelExplanation': 'The source header’s cardiologist diagnostic labels are preserved as supplied. The website does not independently adjudicate acute timing or infer an isolated wall diagnosis from these overlapping labels.',
        'coexistingFindings': ['Source STEMI labels also include the anterior wall, septum and apex.',
                              'Source labels left anterior hemiblock and left axis deviation.',
                              'Visible V5–V6 baseline variation is preserved; this is a website waveform-review observation, not a source quality flag.'],
        'heartAxis': 'Left axis deviation (source narrative)', 'notes': notes,
        'calibration': calibration, 'sourceAnnotations': annotations,
        'recordSha256': sha(raw), 'checksumVerified': True, 'sourceSHA256Verified': True,
        'teaching': {
            'conditionId': 'stemi-lateral', 'profile': profile,
            'fiducialSource': 'source-cardiologist-annotations',
            'ventricularAnchors': [{'anchor': w['peak'], 'onset': w['onset'],
                                     'qrsDuration': round(w['offset'] - w['onset'], 3)} for w in qrs],
            'atrialOnsets': [{'onset': w['onset'], 'duration': round(w['offset'] - w['onset'], 3)} for w in p],
            'atrialTimingAvailable': True, 'anchorOffset': 0,
            'anchorLead': 'II', 'atrialAnchorLead': 'II',
            'qrsAnchorSource': 'source-cardiologist-qrs-peak-onset-end-annotations',
            'anchorUnits': 'seconds from excerpt start; add 1.6 seconds for original-source time',
            'anchorStatus': 'Original source cardiologist waveform annotations; no inferred edge timings included.',
            'notes': [notes[-1], 'QRS onsets and durations are supplied directly for each event; no fixed 40 ms onset offset is applied.'],
            'mechanismModelNote': 'Only waveform event timings are source-annotated. Spatial conduction, repolarization, injury shading and all mechanics remain illustrative.',
        },
        'timingProvenance': {'qrsAnchorSource': 'source-cardiologist-qrs-peak-onset-end-annotations',
                             'qrsOnsetSource': 'source-cardiologist-qrs-onsets',
                             'atrialTimingSource': 'source-cardiologist-p-onsets',
                             'annotationLead': 'II', 'sourceTimeOffsetSeconds': start,
                             'mechanicsSource': 'illustrative', 'signalSource': 'recorded'},
    }
    provenance = {'id': record['id'], 'sourceHeader': header, 'sourceMembers': files,
                  'channelIntegrityReview': integrity, 'originalSourceAnnotations': original,
                  'sourceLicense': record['license'], 'sourceLicenseUrl': record['licenseUrl'],
                  'sourceDiagnosisText': source_labels,
                  'processing': 'Convert each channel with its own source gain and baseline; take source samples [800:4100] (1.6 ≤ time < 8.2 seconds). No other waveform processing.',
                  'sourceCrop': {'startSampleInclusive': 800, 'endSampleExclusive': 4100,
                                 'sourceFs': 500, 'sourceSampleCount': 5000, 'sampleCount': 3300},
                  'timingProvenance': record['timingProvenance']}
    return record, provenance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'dist' / 'data')
    args = parser.parse_args()
    root, out = args.source_dir, args.output_dir
    out.mkdir(parents=True, exist_ok=True)
    rows = {r['ecg_row_record']: r for r in csv.DictReader((root / 'train.csv').open())}
    metadata = json.loads((root / 'acs-figshare.json').read_text())
    assert metadata['license']['name'] == 'CC0'
    csv_zip = (root / 'CSV.zip').read_bytes()
    csv_info = next(f for f in metadata['files'] if f['name'] == 'CSV.zip')
    assert hashlib.md5(csv_zip).hexdigest() == csv_info['computed_md5']
    # The sparse archive contains the authentic ZIP central directory. Individual
    # imported entries were downloaded by HTTP range and validated by ZIP CRC32.
    with zipfile.ZipFile(root / 'raw-sparse.zip') as archive:
        anterior = acs_record(root, '00004', 'anterior', 'V2',
                             [.776, 1.594, 2.436, 3.272, 4.128, 4.990, 5.856, 6.702, 7.566, 8.444, 9.324], rows, archive)
        inferior = acs_record(root, '18206', 'inferior', 'III',
                             [.666, 1.644, 2.644, 3.600, 4.598, 5.602, 6.658, 7.710, 8.818, 9.924], rows, archive)
    lateral = ludb_record(root)
    records = [anterior[0], inferior[0], lateral[0]]
    for r in records:
        assert all(len(r['signals'][lead]) == r['sampleCount'] for lead in LEADS)
        assert all(math.isfinite(v) for lead in LEADS for v in r['signals'][lead])
        assert r['sampleCount'] == round(r['fs'] * r['seconds'])
    dataset = {'name': 'Source-labeled real STEMI teaching recordings',
               'description': 'Two ACS recordings with discharge STEMI and angiographic acute-occlusion labels, plus a source-diagnosed multiterritory LUDB STEMI excerpt. Native 500 Hz samples; no synthesized ECG data.',
               'version': '2026-10-28', 'recordCount': 3,
               'licenses': [{'dataset': 'ACS ECG dataset, Figshare v1', 'license': 'CC0 1.0',
                             'url': 'https://creativecommons.org/publicdomain/zero/1.0/'},
                            {'dataset': 'LUDB v1.0.1', 'license': 'ODC-By 1.0',
                             'url': 'https://opendatacommons.org/licenses/by/1-0/'}],
               'attribution': ACS_ATTRIBUTION + '\n\n' + LUD_ATTRIBUTION,
               'sourceUrls': [ACS_SOURCE, ACS_PAPER, LUD_SOURCE],
               'limitations': 'Source diagnostic labels are preserved without independent adjudication. Anterior/inferior wall patterns for ACS records are teaching interpretations, not separately supplied source territory labels. The 3D mechanism and every contraction remain schematic.'}
    (out / 'clinical-stemi.json').write_text(json.dumps({'dataset': dataset, 'records': records}, ensure_ascii=False, separators=(',', ':')) + '\n')
    provenance = {'created': '2026-10-28', 'importer': 'scripts/import_stemi_examples.py',
                  'acsSourceApi': ACS_API, 'acsFigshareLicense': metadata['license'],
                  'acsDataLicenseNote': 'The downloadable dataset is CC0 as supplied by Figshare. The associated paper has a different article license; no article figure or adapted paper content is redistributed.',
                  'acsCsvArchiveMD5': hashlib.md5(csv_zip).hexdigest(), 'acsCsvArchiveMD5Verified': True,
                  'acsRawArchiveFullMD5Verified': False,
                  'archiveAcquisition': 'Public official file fetched by HTTP byte ranges: ZIP central directory plus selected member ranges. Each selected .dat and .hea matches its original ZIP entry CRC32. The entire 1.277 GB archive was not downloaded, so its full-file MD5 is not claimed as verified.',
                  'records': [anterior[1], inferior[1], lateral[1]],
                  'sourceNotImported': 'No unverified posterior STEMI record was relabeled from ischemia, chronic MI or a generic LCX diagnosis. Previously simulated templates are not part of this real clinical collection.'}
    (out / 'clinical-stemi-provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n')
    (out / 'LUDB-LICENSE.txt').write_bytes((root / 'LICENSE.txt').read_bytes())
    (out / 'STEMI-DATA-SOURCES.txt').write_text(
        'REAL STEMI RECORDINGS — SOURCE AND REUSE NOTICE\n\n' + ACS_ATTRIBUTION + '\n' +
        'Source: ' + ACS_SOURCE + '\nAPI metadata: ' + ACS_API + '\n' +
        'Dataset reuse: CC0 1.0 Universal, https://creativecommons.org/publicdomain/zero/1.0/\n' +
        'Records: row_data/00004 (.dat/.hea) and row_data/18206 (.dat/.hea), ECG_row_data.zip.\n' +
        'Diagnostic rows: CSV.zip / CSV/train.csv.\n' +
        'These are real, complete 10-second waveforms with 12 leads at 500 Hz. No source paper figures are reproduced.\n\n' +
        LUD_ATTRIBUTION + '\nSource: ' + LUD_SOURCE + '\n' +
        'This application contains information from LUDB v1.0.1, which is made available here under the Open Data Commons Attribution License (ODC-By) v1.0.\n' +
        'License: https://opendatacommons.org/licenses/by/1-0/ (full source license bundled as LUDB-LICENSE.txt).\n' +
        'Record 21: all 12 leads, excerpt from source seconds 1.6–8.2; native 500 Hz. Cardiologist wave annotations from source annotation files.\n\n' +
        'Signals have source gain/baseline conversion to mV. LUDB has the documented time crop; ACS retains full recordings. No filtering, resampling, denoising or amplitude normalization.\n' +
        'Per-record diagnoses, labels, attribution, calibration, integrity results and timing provenance are in clinical-stemi.json and clinical-stemi-provenance.json.\n' +
        'ACS source header initial-value/checksum slots contain channel maxima/minima. ZIP CRC32 verifies imported member bytes; WFDB header checksum verification is explicitly false. LUDB source SHA256 and all channel initial values/checksums pass.\n' +
        'Diagnostic labels are source labels, not independent website adjudication. Territory shading and all 3D conduction/contraction are schematic teaching models, not measured patient mechanics.\n', encoding='utf-8')
    print(json.dumps({'records': [{'id': r['id'], 'fs': r['fs'], 'seconds': r['seconds'],
                                  'sampleCount': r['sampleCount'], 'recommendedLead': r['recommendedLead']}
                                 for r in records], 'output': str(out / 'clinical-stemi.json'),
                      'sampleValues': sum(r['sampleCount'] * 12 for r in records)}))


if __name__ == '__main__':
    main()
