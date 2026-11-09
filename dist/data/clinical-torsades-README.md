# Recorded torsades de pointes: SDDB record 47

This export adds **one authentic two-channel, 14-second ECG excerpt** at the native **250 Hz** sample rate. It contains **3,500 samples per channel / 7,000 channel samples**. The original calibrated waveform is preserved; the 3D animation is an educational mechanism illustration.

## Diagnosis evidence

Lerma C, Lee CF, Glass L, Goldberger AL. *The rule of bigeminy revisited: analysis in sudden cardiac death syndrome.* Journal of Electrocardiology 40(1):78–88 (2007). [DOI: 10.1016/j.jelectrocard.2006.04.011](https://doi.org/10.1016/j.jelectrocard.2006.04.011).

The study's **Table 1 explicitly classifies record 47 as TdP**, in a prolonged-QT setting. Its reported record-level QTc is 0.63 ± 0.08 seconds; the accompanying discussion describes preceding-rhythm QTc above 0.60 seconds. **Figure 2 identifies the TdP portion with an asterisk**, after complex ventricular ectopy and runs. This diagnosis is not inferred solely from a changing ECG morphology by this website. The article is linked for evidence; its published figure is not redistributed or digitized into the ECG data.

The author-hosted PDF is available at:
<https://www.mcgill.ca/physiological-dynamics/files/physiological-dynamics/rule_2007.pdf>

## Exact waveform extraction and approximate episode alignment

| Property | Value |
| --- | --- |
| Original dataset | Sudden Cardiac Death Holter Database v1.0.0 |
| Source record | `47` |
| Original rate | 250 Hz |
| Source sample interval | 5,597,500 through 5,600,999 inclusive |
| Source elapsed interval | 06:13:10–06:13:24 |
| Source header clock | 12:00:00 |
| Corresponding clock interval | 18:13:10–18:13:24 |
| Source format | Two-channel WFDB 212 |
| Amplitude conversion | signed ADC / 200, in mV |

Distinctive source waveform complexes were visually matched to the lower strip in Figure 2. The crop retains approximately **eight seconds of preceding complex ventricular ectopy/runs**, followed by approximately **six seconds in the source-identified TdP region**. The eight-second display transition is a graphical teaching alignment, with about one second uncertainty. It is **not a source-validated onset fiducial**. A focus point at ten seconds selects the interior of the TdP portion.

The printed 18:12:50 time belongs to the longer illustrated strip; its TdP asterisk appears later. The header's `#vfon: 06:13:01` comment occurs earlier than that asterisk and is not used as a precise VF transition. This export does not label a transition to VF, termination, or a precise beginning of TdP. Its right boundary stays within the graphically matched published strip.

No reliable beat-level fiducials are supplied for this polymorphic segment. The accompanying source `47.ari` file is explicitly **unaudited**, and neither its markers nor arbitrary waveform extrema are represented as validated QRS onsets. QTc context comes from the paper's preceding-rhythm measurements; QT is not measured from this tachycardia excerpt. Animation timing is schematic and follows broad episode context only.

## Channels and integrity

Both source channel names are simply `ECG`. Display names `ECG1` and `ECG2` identify source channels 0 and 1, respectively. Their standard lead identities and exact electrode geometry are unknown. No standard lead axis or missing lead is synthesized.

The full original waveform, header and unaudited annotation file match PhysioNet's published SHA-256 manifest. The full waveform's initial ADC values match `−18, 10`; the complete channel checksums match `−26505, 31895`. Every exported voltage recovers the selected original ADC value under inverse calibration. No filtering, resampling, smoothing, interpolation, normalization or denoising is applied.

`clinical-torsades-provenance.json` retains these checks, the original header, crop indices, source URLs and graphical-alignment limitations. Reproduce the export offline with the standard-library importer:

```bash
python scripts/import_torsades.py --source-dir research-content/tdp6
```

Download `47.hea`, `47.dat`, `47.ari` and `SHA256SUMS.txt` from the [official files](https://physionet.org/files/sddb/1.0.0/) into that directory. The dataset's advertised public S3 mirror also supplies the same files under `https://physionet-open.s3.amazonaws.com/sddb/1.0.0/`.

## Attribution and license

Contains information from the **Sudden Cardiac Death Holter Database v1.0.0**, collected by Scott Greenwald and made available by PhysioNet under the **Open Data Commons Attribution License v1.0 (ODC-By)**. [Dataset DOI: 10.13026/C2W306](https://doi.org/10.13026/C2W306). [License](https://physionet.org/content/sddb/view-license/1.0.0/).

Original database publication: Greenwald SD. *Development and analysis of a ventricular fibrillation detector.* MIT Department of Electrical Engineering and Computer Science, MS thesis (1986). [MIT repository](https://dspace.mit.edu/handle/1721.1/92988).

PhysioNet platform: Pollard T et al. *PhysioNet as a global platform for biomedical research.* Nature Health (2026). [DOI: 10.1038/s44360-026-00096-z](https://doi.org/10.1038/s44360-026-00096-z).

This derivative selects a small excerpt, converts calibrated source integers to JSON millivolts, provides distinct display channel names, and adds educational metadata. The source-record clinical context is retained; its original signal samples are not altered.
