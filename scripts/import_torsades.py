#!/usr/bin/env python3
"""Export a source-adjudicated TdP excerpt from the original SDDB47 waveform.

Uses only the standard library. Inputs are the unmodified 47.hea, 47.dat and
SHA256SUMS.txt files from https://physionet.org/files/sddb/1.0.0/ .
The official public mirror is https://physionet-open.s3.amazonaws.com/sddb/1.0.0/ .

  python scripts/import_torsades.py --source-dir research-content/tdp6

Lerma et al. (2007), Table1 and Fig2, identify this source record as TdP in a
prolonged-QT setting. The figure-to-waveform timing alignment is approximate;
its printed strip time and the header's vfon comment are NOT exact TdP or VF
transition fiducials. No paper image is digitized and no ECG is synthesized.
"""
import argparse
import hashlib
import json
from pathlib import Path

SOURCE = 'https://physionet.org/content/sddb/1.0.0/'
FILES = 'https://physionet.org/files/sddb/1.0.0/'
PAPER = 'https://doi.org/10.1016/j.jelectrocard.2006.04.011'
AUTHOR_PDF = 'https://www.mcgill.ca/physiological-dynamics/files/physiological-dynamics/rule_2007.pdf'
LICENSE = 'https://physionet.org/content/sddb/view-license/1.0.0/'
START, END, FS = 22390, 22404, 250
EXPECTED = {
    '47.hea': '2880509d50e1d409bb690d5251c0f6ef44324ee99aa613819bff714d12663951',
    '47.dat': '85b58548ddadcadd695596017fe13b66d660d7f2f2481793a7469b58fe753a0c',
    '47.ari': '77e7c7acfa75eaf7c840941a96fc92ba75bb790848983a3e90d3bfcdc6f29d7d',
}
ATTRIBUTION = ('Contains information from the Sudden Cardiac Death Holter Database '
               'v1.0.0, collected by Scott Greenwald and made available by PhysioNet '
               'under the Open Data Commons Attribution License v1.0 (ODC-By). '
               'Dataset DOI: 10.13026/C2W306. The TdP classification is from Lerma C, '
               'Lee CF, Glass L, Goldberger AL. The rule of bigeminy revisited: '
               'analysis in sudden cardiac death syndrome. J Electrocardiol '
               '40(1):78–88 (2007), DOI: 10.1016/j.jelectrocard.2006.04.011.')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def decoded_pairs(raw):
    assert len(raw) % 3 == 0
    for a, b, c in zip(raw[0::3], raw[1::3], raw[2::3]):
        left, right = a | ((b & 15) << 8), c | ((b & 240) << 4)
        yield left - 4096 if left >= 2048 else left, right - 4096 if right >= 2048 else right


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True)
    parser.add_argument('--output-dir', type=Path, default=Path(__file__).resolve().parents[1] / 'dist' / 'data')
    args = parser.parse_args()
    root, out = args.source_dir, args.output_dir
    manifest = {line.split()[1]: line.split()[0] for line in (root / 'SHA256SUMS.txt').read_text().splitlines() if line.strip()}
    raw = (root / '47.dat').read_bytes()
    header = (root / '47.hea').read_text()
    lines = header.splitlines()
    fields = lines[0].split()
    assert fields[:5] == ['47', '2', '250', '21237500', '12:00:00']
    assert len(raw) == int(fields[3]) * 3
    integrity = []
    for name in ['47.hea', '47.dat', '47.ari']:
        p = root / name
        if not p.exists() and name == '47.ari':
            continue
        data = p.read_bytes()
        digest = sha(data)
        assert digest == EXPECTED[name] == manifest[name], (name, digest)
        integrity.append({'name': name, 'url': FILES + name, 'bytes': len(data),
                          'sha256': digest, 'officialSha256Verified': True})

    # Verify the complete channels, not a checksum of the selected short crop.
    totals, first = [0, 0], None
    for pair in decoded_pairs(raw):
        if first is None:
            first = pair
        totals[0] += pair[0]
        totals[1] += pair[1]
    sums = [((v + 32768) % 65536) - 32768 for v in totals]
    assert first == (-18, 10) and sums == [-26505, 31895]
    for i, line in enumerate(lines[1:3]):
        f = line.split()
        assert f[:5] == ['47.dat', '212', '200', '12', '0']
        assert int(f[5]) == first[i] and int(f[6]) == sums[i] and f[-1] == 'ECG'

    source_bytes = raw[START * FS * 3:END * FS * 3]
    pairs = list(decoded_pairs(source_bytes))
    assert len(pairs) == (END - START) * FS
    signals = {f'ECG{i+1}': [pair[i] / 200 for pair in pairs] for i in range(2)}
    for i, name in enumerate(signals):
        assert all(round(value * 200) == pair[i] for value, pair in zip(signals[name], pairs))

    timing_notes = [
        'The excerpt spans source elapsed 06:13:10–06:13:24, or clock 18:13:10–18:13:24 using the header’s 12:00:00 start. It is a native 14-second, 250 Hz excerpt.',
        'The first approximately eight seconds contain preceding complex ventricular ectopy/runs. The later portion matches the region marked as TdP in Lerma et al. Figure 2. The approximate eight-second transition is a graphical alignment for teaching, with about one second uncertainty; it is not a source beat-level onset annotation.',
        'The paper’s printed 18:12:50 label belongs to the illustrated longer strip and is not used as an exact transition here. The header vfon comment is also not used to assign a VF boundary. This excerpt makes no claim about the exact onset, termination or transition to VF.',
        'No validated beat-level fiducials are provided for this polymorphic segment. The source 47.ari annotations are explicitly unaudited and are not used as reliable QRS-onset labels. Conduction, cycle timing and all contraction are schematic and are not reconstructed from the patient.',
    ]
    profile = {
        'title': 'Torsades de pointes · prolonged QT',
        'summary': 'An actual Holter waveform from a published prolonged-QT/TdP case, including preceding complex ventricular runs and a source-identified TdP segment.',
        'electrical': 'The source authors identify polymorphic ventricular tachycardia with TdP morphology in the setting of prolonged repolarization. Rapid, changing ventricular activation is shown schematically; the apparent twisting on the ECG reflects changing electrical projection, not physical rotation of the heart.',
        'mechanical': 'Rapid, heterogeneous ventricular activation disrupts coordinated ventricular pumping. The reference heart illustrates poorly coordinated motion; this ECG does not measure cardiac output, arterial pressure, wall-motion amplitude or patient-specific contraction.',
        'observe': 'Compare ECG1 with ECG2 and follow the changing broad-complex morphology. The source-identified TdP portion begins approximately eight seconds into this short excerpt. The source paper documents QTc greater than 0.60 seconds in the preceding rhythm; that context is not a QT measurement from the tachycardia itself.',
        'recommendedLead': 'ECG1',
    }
    record = {
        'id': 'sddb-47-torsades', 'ecgId': '47', 'conditionId': 'torsades',
        'title': profile['title'], 'description': profile['summary'],
        'tags': ['Torsades de pointes', 'Polymorphic VT', 'Prolonged QT', 'Recorded'],
        'source': 'PhysioNet · Sudden Cardiac Death Holter Database v1.0.0',
        'sourceUrl': SOURCE, 'recordUrl': SOURCE + '47.hea',
        'downloadUrl': FILES + '47.dat', 'metadataUrl': SOURCE + '47.hea',
        'publicationUrl': PAPER, 'diagnosisSourceUrl': PAPER, 'license': 'ODC-By 1.0',
        'licenseUrl': LICENSE, 'attribution': ATTRIBUTION,
        'fs': FS, 'seconds': END - START, 'sampleCount': len(pairs), 'units': 'mV',
        'leadOrder': ['ECG1', 'ECG2'], 'recommendedLead': 'ECG1',
        'leadConfigurationNote': 'Both original channels are labeled only ECG in the source header. ECG1 and ECG2 distinguish them by channel index. Their standard lead identities and exact electrode geometry are unavailable, so no standard 3D lead axis or missing lead is inferred.',
        'sourceChannelNames': {'ECG1': 'ECG (source channel 0)', 'ECG2': 'ECG (source channel 1)'},
        'sourceLabels': [
            {'code': 'Published TdP diagnosis', 'description': 'Record 47 is classified as TdP with prolonged QT in Table 1 and illustrated in Figure 2 of Lerma et al. (2007).', 'sourceUrl': PAPER},
            {'code': 'Prolonged QT context', 'description': 'The paper reports QTc greater than 0.60 seconds in the preceding rhythm; its tabulated record-level QTc is 0.63 ± 0.08 seconds. These are source-study measurements, not values calculated by this site.', 'sourceUrl': PAPER},
        ],
        'labelExplanation': 'The TdP subtype comes from the published analysis of this exact source record. It is not inferred merely from polymorphic morphology. The short excerpt and approximate event boundary were graphically matched to the published Figure 2; no patient-specific activation map or beat-onset annotation is supplied.',
        'validatedByHuman': True,
        'sourceValidationNote': 'The published study classified rhythm morphology and QT context by manual review. Export alignment and the schematic animation are not independently adjudicated source fiducials.',
        'sourceSignalQuality': {'processing': 'Original baseline drift, amplitude changes and noise preserved; no filtering, smoothing, resampling or normalization.'},
        'coexistingFindings': ['Preceding complex ventricular ectopy, couplets and ventricular runs remain visible.', 'The source study describes prolonged QT, ST depression and T-wave inversion in the preceding rhythm.'],
        'notes': [
            'Authentic two-channel clinical recording. Both original channels and all 3,500 samples per channel are retained at 250 Hz.',
            'The paper assigns this record to a prolonged-QT/TdP group. It does not supply the patient’s exact electrophysiological activation map, and this site does not independently re-adjudicate the diagnosis.',
            'ECG1 and ECG2 are display names for the source’s two generically labeled ECG channels, not standard limb or precordial lead assignments.',
        ] + timing_notes,
        'excerpt': {'sourceRecord': '47', 'startSample': START * FS, 'endSampleExclusive': END * FS,
                    'startSeconds': START, 'endSeconds': END, 'startElapsed': '06:13:10', 'endElapsed': '06:13:24',
                    'sourceHeaderStartClock': '12:00:00', 'startClock': '18:13:10', 'endClock': '18:13:24',
                    'originalRecordSamples': 21237500, 'originalSamplingHz': FS},
        'calibration': {name: {'adcGain': 200, 'adcBaseline': 0, 'units': 'mV', 'format': '212', 'sourceChannel': i} for i, name in enumerate(signals)},
        'recordSha256': EXPECTED['47.dat'], 'checksumVerified': True,
        'originalFileIntegrity': integrity, 'signals': signals,
        'teaching': {
            'conditionId': 'torsades', 'rhythmKind': 'torsades',
            'rhythmSegments': [
                {'start': 0, 'end': 8, 'kind': 'ventricular-ectopy', 'label': 'Preceding ectopy / ventricular runs', 'approximate': True, 'uncertaintySeconds': 1},
                {'start': 8, 'end': 14, 'kind': 'torsades', 'label': 'Source-identified TdP segment', 'approximate': True, 'uncertaintySeconds': 1},
            ],
            'ventricularAnchors': [], 'atrialOnsets': [], 'atrialTimingAvailable': False,
            'anchorUnits': 'seconds from selected excerpt start',
            'anchorStatus': 'No validated beat-level fiducials; approximate graphical alignment of the published TdP segment only.',
            'qrsAnchorSource': 'Not supplied: polymorphic ventricular deflections are not treated as validated QRS-onset annotations.',
            'focusEvents': [{'time': 10, 'label': 'Inspect the source-identified torsades segment', 'kind': 'torsades', 'approximate': True}],
            'profile': profile, 'notes': timing_notes,
            'mechanismModelNote': 'The real ECG remains unchanged. Segment timing aligns the educational display; changing activation patterns and disorganized motion are illustrative, not measured patient electrophysiology or hemodynamics.',
        },
    }
    dataset = {
        'title': 'Source-adjudicated torsades de pointes from SDDB record 47',
        'version': '1.0.0', 'sourceUrl': SOURCE, 'doi': '10.13026/C2W306',
        'publicationUrl': PAPER, 'license': 'ODC-By 1.0', 'licenseUrl': LICENSE,
        'attribution': ATTRIBUTION, 'recordCount': 1, 'samplesPerLead': len(pairs), 'leadsPerRecord': 2,
        'modifications': 'Selected original source samples 5597500–5600999. Decoded WFDB format 212 and converted ADC to mV by dividing by 200, preserving both original ECG channels. No filtering, interpolation, normalization, resampling, waveform replacement or missing-lead synthesis.',
        'samplingNote': 'Native 250 Hz; 14 seconds; two channels; 7,000 calibrated channel samples.',
        'annotationNote': timing_notes[1] + ' ' + timing_notes[3],
        'citations': [
            {'title': 'Greenwald SD. Development and analysis of a ventricular fibrillation detector. MIT MS thesis (1986).', 'url': 'https://dspace.mit.edu/handle/1721.1/92988'},
            {'title': 'Lerma C, Lee CF, Glass L, Goldberger AL. The rule of bigeminy revisited: analysis in sudden cardiac death syndrome. J Electrocardiol 40(1):78–88 (2007).', 'url': PAPER},
            {'title': 'Pollard T et al. PhysioNet as a global platform for biomedical research. Nature Health (2026).', 'url': 'https://doi.org/10.1038/s44360-026-00096-z'},
        ],
    }
    provenance = {
        'sourceDataset': SOURCE, 'sourceFiles': integrity,
        'acquisitionMirror': 'https://physionet-open.s3.amazonaws.com/sddb/1.0.0/47.dat',
        'manifestUrl': FILES + 'SHA256SUMS.txt', 'sourceHeader': header,
        'fullChannelIntegrity': [{'channel': i, 'initialADC': first[i], 'checksum': sums[i], 'headerMatches': True} for i in range(2)],
        'excerpt': record['excerpt'], 'excerptSourceBytesSha256': sha(source_bytes),
        'conversion': 'mV = signed12bitADC / 200; header ADC zero is0; WFDB default amplitude unit is mV.',
        'sourceDiagnosis': {'publication': PAPER, 'authorHostedPDF': AUTHOR_PDF, 'table': 'Table 1, record47', 'figure': 'Figure 2, lower ECG strip',
                            'diagnosis': 'TdP in prolonged-QT setting; source QTc 0.63 ± 0.08 s, preceding-rhythm statement >0.60 s.'},
        'alignment': {'method': 'Visual waveform comparison with the published Figure 2, using header clock mapping and distinctive complexes.',
                      'approximateTdPSegmentStartSecondsInExcerpt': 8, 'uncertaintySeconds': 1,
                      'limits': 'The printed figure strip starts18:12:50, while its TdP asterisk appears later. No exact onset is inferred from that label or from the header vfon comment. The crop ends within the graphically matched published strip; no later VF or termination label is assigned.'},
        'beatFiducials': 'Not supplied. Source47.ari is unaudited and is not used to assert reliable QRS onsets in the polymorphic segment.',
        'checks': {'nativeSampleCount': len(pairs), 'channels': 2, 'channelSamples': len(pairs) * 2,
                   'allValuesFinite': True, 'inverseCalibrationRecoversADC': True, 'officialSHA256Matches': True,
                   'fullWFDBChecksumsMatch': True, 'fullInitialADCMatches': True},
        'license': 'ODC-By1.0', 'licenseUrl': LICENSE, 'attribution': ATTRIBUTION,
    }
    out.mkdir(parents=True, exist_ok=True)
    (out / 'clinical-torsades.json').write_text(json.dumps({'dataset': dataset, 'records': [record]}, ensure_ascii=False, separators=(',', ':')) + '\n')
    (out / 'clinical-torsades-provenance.json').write_text(json.dumps(provenance, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'result': 'PASS', 'id': record['id'], 'seconds': END - START, 'fs': FS,
                      'channels': list(signals), 'channelSamples': 2 * len(pairs), 'sha256': EXPECTED['47.dat'],
                      'fullChecksums': sums, 'inverseCalibration': True}))


if __name__ == '__main__':
    main()
