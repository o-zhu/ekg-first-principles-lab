# Recorded tachyarrhythmia examples

`clinical-tachyarrhythmias.json` contains five authentic two-channel ECG excerpts. All channels retain their native sampling frequency, original noise and baseline, and calibrated source amplitudes. The source crop and gain/baseline conversion are the only changes. No filtering, resampling, interpolation, amplitude normalization or missing-lead synthesis is applied.

## Excerpts

| Website ID | Original source interval | Native rate | Channels | Displayed rhythm and mean ventricular rate |
| --- | --- | ---: | --- | --- |
| `mitdb-202-af-rvr` | MIT-BIH 202, 1264–1274 s | 360 Hz | MLII, V1 | Source AFIB; calculated ventricular rate **123.838 bpm** |
| `vfdb-421-vt` | VFDB 421, 1360–1370 s | 250 Hz | ECG1, ECG2 | Source VT; visually reviewed waveform maxima give approximately **245.592 bpm** |
| `mitdb-222-flutter` | MIT-BIH 222, 1690–1700 s | 360 Hz | MLII, V1 | Source AFL; calculated ventricular rate **101.887 bpm** |
| `mitdb-209-svt` | MIT-BIH 209, 560–570 s | 360 Hz | MLII, V1 | Source SVTA; calculated ventricular rate **159.669 bpm** |
| `vfdb-422-vf` | VFDB 422, 1550–1560 s | 250 Hz | ECG1, ECG2 | Source VFIB; **no organized ventricular rate assigned** |

Each excerpt is ten seconds. The three MIT-BIH Arrhythmia Database excerpts contain 7,200 channel samples each, and the two Malignant Ventricular Ectopy Database excerpts contain 5,000 each: **31,600 original channel samples** in total.

The original VFDB headers label both channels simply `ECG`. The export names them `ECG1` and `ECG2` to preserve their identity, not to imply standard lead locations. These channels have no known anatomical lead axis. MLII is a modified ambulatory lead II whose exact electrode geometry is also unavailable. The source name V1 is retained for the second MIT-BIH channel. None of these recordings supplies a standard simultaneous twelve-lead set.

## Diagnostic evidence and qualifications

All five excerpts lie entirely within the original rhythm-change intervals recorded in the `.atr` reference annotations:

| Record | Source annotation | Enclosing source interval |
| --- | --- | --- |
| MIT-BIH 202 | `(AFIB` | 1176.330556–1291.650000 s |
| VFDB 421 | `(VT` | 1335.844000–1486.076000 s |
| MIT-BIH 222 | `(AFL` | 1662.616667–1805.555556 s, record end |
| MIT-BIH 209 | `(SVTA` | 555.672222–584.297222 s |
| VFDB 422 | `(VFIB` | 1535.152000–2031.304000 s |

**AF with RVR:** AF comes from the original AFIB annotation. “Rapid ventricular response” is the website's description of the measured mean ventricular rate above 100 bpm, not an additional source diagnostic code. Twenty original conducted QRS events are present, with R–R intervals from 400 to 863.889 ms. Their source `N` beat labels identify QRS morphology; they do not change the enclosing AF diagnosis to sinus rhythm. Later/other PVCs and rhythm transitions in the full record remain outside this selected window.

**VT:** The source VT episode lasts 150.232 seconds, so this excerpt lies within a sustained episode. The source does not separately adjudicate monomorphic/polymorphic VT, torsades, a scar circuit or an exact ventricular origin. The title therefore remains “Ventricular tachycardia.” Its baseline drift and variable amplitude are retained. Neither this VT nor the VF case is relabeled as torsades de pointes.

**Flutter:** The source AFL label is retained. The selected waveform has repetitive atrial deflections with a variable ventricular response. The source does not annotate each flutter-wave onset, adjudicate a CTI-dependent circuit, or provide a beat-by-beat AV conduction ratio. A typical flutter circuit may be illustrated only as a qualified reference mechanism.

**SVT:** SVTA means supraventricular tachyarrhythmia in the original database. All 26 within-window QRS events carry the source `A` (atrial/supraventricular premature beat) annotation. No specific AVNRT, AVRT, accessory pathway or atrial focus is inferred.

**VF:** The source explicitly labels the enclosing interval VFIB. This export does not assign individual QRS events, a QRS duration, an organized ventricular rate, or an atrial timing series.

## Timing and anatomical animation

The MIT-BIH excerpts use the original ventricular beat sample positions from their `.atr` files. They are source event markers, not exact QRS-onset fiducials. Mean ventricular rate is calculated as `60 × (N − 1) / (last marker time − first marker time)` using only the markers inside the displayed excerpt.

The VFDB database provides **rhythm-change annotations, not beat annotations**. For the VT illustration, forty ECG2 waveform maxima were estimated and visually reviewed against both original channels. Their fixed source-sample indices are retained in the import script and provenance file. The estimated rate uses those maxima and is explicitly marked approximate. No such maxima are assigned as beats in VF.

For animation only, conducted MIT-BIH beats use a 35 ms offset before the source marker and a 90 ms reference QRS duration. VT uses a 55 ms offset and a 180 ms reference duration. These values are illustrative, not source measurements. Atrial activity, exact regional spread, recovery and all contraction are modeled mechanisms on reference anatomy. They do not reconstruct patient-specific electrical maps, contraction strength, stroke volume or ejection fraction.

## Provenance and reproducibility

`clinical-tachyarrhythmias-provenance.json` retains source URLs, exact crop samples, native calibration, full source headers, official SHA-256 values, source rhythm intervals, event counts, rate calculations and the VT estimated-anchor indices.

The importer verifies:

- All 15 source `.hea`, `.dat` and `.atr` files against PhysioNet's published SHA-256 lists.
- Every original channel's full-record 16-bit WFDB checksum and initial ADC value.
- The full signal dimensions and each excerpt's uninterrupted source rhythm annotation.
- Exact recovery of every cropped integer ADC sample from the exported mV values using the inverse calibration.

Run `python scripts/import_tachyarrhythmias.py` from the repository. It uses the retained ignored cache under `research-data/tachyarrhythmias/`; add `--download` to retrieve missing source files. The script requires NumPy and regenerates both JSON files deterministically.

## Sources and licenses

- [MIT-BIH Arrhythmia Database v1.0.0](https://physionet.org/content/mitdb/1.0.0/), DOI [10.13026/C2F305](https://doi.org/10.13026/C2F305), by George Moody and Roger Mark. [License: ODC-By 1.0](https://physionet.org/content/mitdb/view-license/1.0.0/). Original publication: Moody GB, Mark RG, *The impact of the MIT-BIH Arrhythmia Database*, IEEE Engineering in Medicine and Biology Magazine 20(3):45–50 (2001), DOI [10.1109/51.932724](https://doi.org/10.1109/51.932724).
- [MIT-BIH Malignant Ventricular Ectopy Database v1.0.0](https://physionet.org/content/vfdb/1.0.0/), DOI [10.13026/C22P44](https://doi.org/10.13026/C22P44), by Paul Albrecht, George Moody and Roger Mark. [License: ODC-By 1.0](https://physionet.org/content/vfdb/view-license/1.0.0/). Original publication: Greenwald SD, [*Development and analysis of a ventricular fibrillation detector*](https://dspace.mit.edu/handle/1721.1/92988), MIT M.S. thesis (1986).
- [Official rhythm-annotation definitions](https://physionet.org/files/vfdb/1.0.0/annotations.shtml) and [MIT-BIH record directory](https://physionet.org/physiobank/database/html/mitdbdir/records.htm).

Contains information from both databases, made available under the Open Data Commons Attribution License v1.0. Source-specific attribution and license links are also included in each displayed record.
