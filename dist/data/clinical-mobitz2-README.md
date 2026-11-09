# Recorded Mobitz II teaching example

`clinical-mobitz2.json` contains the first 10 seconds of **MIT-BIH Arrhythmia Database record 231**, in its two original ambulatory channels, **MLII and V1**, at **360 Hz**. All 3,600 samples per channel are retained, with the original header calibration applied to express voltage in millivolts. No waveform is generated, filtered, resampled, normalized, or reconstructed into missing leads.

## Why this record is labeled Mobitz II

The [original header](https://physionet.org/content/mitdb/1.0.0/231.hea) explicitly documents Mobitz II AV block and rate-related right bundle branch block. The [official record directory](https://physionet.org/physiobank/database/html/mitdbdir/records.htm) identifies the opening sample strip, beginning at 0:02, as Mobitz II with RBBB. The selected excerpt contains a visible nonconducted P wave around 5.76 seconds and the original `MISSB` comment at sample 2083 (5.786 seconds).

The subtype comes from the source documentation. It has not been inferred from a generic 2:1 block, and it has not been independently re-adjudicated for this website. The wider source recording contains periods of 2:1 conduction and other findings; those later segments are outside this excerpt. All ten QRS events in this excerpt retain the original `R` (right bundle branch block beat) label. The original `(N` rhythm annotation is also retained: this reflects the underlying sinus rhythm, while the isolated missed beat is documented separately.

## Channel and timing limitations

MLII is a modified limb lead II recorded using chest electrodes. Its 3D lead axis is omitted because the source does not supply the exact modified electrode geometry. V1 is the source label for the second ambulatory chest channel and remains available for comparison. This is not a standard simultaneous 12-lead recording.

The ten ventricular anchors come directly from the original `231.atr` beat positions. They generally mark a major QRS extremum, not QRS onset. Eleven P-wave onsets have been estimated visually in MLII for animation, including one nonconducted P. Those added P estimates, the illustrative 45 ms QRS-onset offset, and the 140 ms reference QRS duration are **not validated source fiducial annotations**. The 3D conduction and contraction are reference illustrations rather than measured patient mechanics. Source morphology varies with rate, and a generic RBBB model does not reconstruct every individual beat.

## Attribution and license

Contains information from the **MIT-BIH Arrhythmia Database v1.0.0**, by **George Moody and Roger Mark**, made available by **PhysioNet** under the **[Open Data Commons Attribution License v1.0 (ODC-By)](https://physionet.org/content/mitdb/view-license/1.0.0/)**.

Source database: <https://physionet.org/content/mitdb/1.0.0/>. Dataset DOI: <https://doi.org/10.13026/C2F305>.

The export selects source samples 0–3599 in each channel, decodes WFDB format 212, applies `(ADC − 1024) / 200`, and serializes the resulting millivolt samples as JSON. Original beat/comment annotations, original teaching descriptions, and explicitly approximate P-onset estimates accompany the signal.

Please preserve this attribution and the license link when redistributing the excerpt. This MIT-BIH example uses ODC-By; the separate PTB-XL examples in the website use their own source license.

### Citations requested by the source

1. Moody G, Mark R. *MIT-BIH Arrhythmia Database (version 1.0.0).* PhysioNet, 2005. <https://doi.org/10.13026/C2F305>.
2. Moody GB, Mark RG. The impact of the MIT-BIH Arrhythmia Database. *IEEE Engineering in Medicine and Biology Magazine.* 2001;20(3):45–50. <https://doi.org/10.1109/51.932724>.
3. Pollard T, et al. PhysioNet as a global platform for biomedical research. *Nature Health.* 2026;1:792–795. <https://doi.org/10.1038/s44360-026-00096-z>.

## Integrity

`clinical-mobitz2-provenance.json` records original URLs, sizes, SHA-256 values, export checksum, calibration, source sample range, and teaching annotation status. The original `.hea`, `.dat`, and `.atr` files were checked against PhysioNet's published SHA-256 list. Both complete-record channel checksums and initial ADC values match the original WFDB header. All exported amplitudes recover the original selected digital samples exactly when the calibration is reversed.
