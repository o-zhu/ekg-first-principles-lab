# Human ventricular optical action-potential data

## Source and reuse

Smirnov D, Pikunov A, Syunyaev R, et al. (2020), *Genetic algorithm-based personalized models of human cardiac action potential*, PLoS ONE 15(5):e0231695. https://doi.org/10.1371/journal.pone.0231695

Public research dataset: https://doi.org/10.5061/dryad.stqjq2c09 ; mirrored by the authors/Dryad at https://zenodo.org/records/3986725 . License: **CC0 1.0**, verified in repository API metadata. The paper's original data DOI contained a typo corrected in https://doi.org/10.1371/journal.pone.0244687 .

Two original files were downloaded and their MD5 digests matched the repository:

- `Patient1_CL1000.mat`: 67,069,659 bytes; `c135455177687d7f57909cfe6003dd92`.
- `Patient2_CL1000.mat`: 62,148,182 bytes; `ee4a046007478f76c89bfcdb127e974e`.

The `cmosData` variables are 100 × 100 × 4096, with native 1,000 Hz sampling. The recording also includes the fluorescence background image and four auxiliary channels at 20 times the optical sampling rate. A periodic trigger is visible in auxiliary channel 1. The channels lack documented ECG identity, electrode geometry, or amplitude calibration, so **none is presented as an ECG**.

## What was measured

Both donors provide endocardial recordings from an isolated human LV wedge, epicardially paced at 1,000 ms cycle length after 100 s stabilization. The paper describes approximately 5 × 5 cm optical field of view, di-4-ANBDQBS dye, 37 °C oxygenated Tyrode perfusion, and 10–15 µM blebbistatin to suppress contraction. These are spatial optical recordings of real tissue, not independent single-cell impalements and not intact whole-heart recordings. Exact anatomical orientation of these camera views is not supplied and must not be invented.

The full study used 14 donor hearts for molecular work, but its optical data comprise two LV preparations and seven RV preparations. Donors 1 and 2 are the LV data. Other optical donors are 8–14; several were excluded from model fitting by the authors for signal quality or preparation abnormalities. Do not describe all 14 hearts as 14 complete optical mapping datasets.

## Export format

Each donor has:

- `donorN-voltage.u8`: 500 × 100 × 100 unsigned bytes, **time major**. Index `t*10000 + y*100 + x`. Each frame is 2 ms. Decode normalized optical signal with `byte/255*1.5 - 0.25`. The extended range preserves modest noise/undershoot; use 0–1 for color scaling.
- `donorN-single-beat.u8`: same shape and encoding, one individual beat instead of the default four-beat ensemble.
- `donorN-mask.u8`: 100 × 100 unsigned bytes, row major; 1 accepted and 0 excluded.
- `donorN-background.png`: contrast-scaled research fluorescence background, same row/column orientation.
- `donorN-timings.f32`: six maps of 100 × 100 little-endian Float32 values. Map order: **AT, RT80, APD80, RT90, APD90, amplitude/residual-noise ratio**. Values at excluded pixels are NaN. All timing values are ms relative to the window start.
- `donorN-metadata.json`: precise processing, source indices, acquisition, limitations, and statistics.
- `donorN-ap-template-1ms.json`: 1,000 native-resolution float values for the accepted pixel with highest signal-to-noise ratio. This is a measured AP shape suitable for use as an explicitly disclosed input to a separate model. Assigning it to a whole heart or warping AP duration is simulation, not a measured whole-heart map.

For donor 1 the default ensemble averages original windows starting at zero-based frame indices 29, 1029, 2029, and 3029. The trigger occurs at approximately t=100 ms in each window. There is no local temporal alignment, preserving the measured activation differences across pixels. The optional single beat uses source indices `[1029,2029)`.

## Processing and quality

The original paper used a narrow 60 Hz band-stop filter and ensemble averaging. This export applies a zero-phase 60 Hz notch (Q=30), then globally aligns and averages four paced beats. An 11 ms cubic Savitzky–Golay filter suppresses residual temporal noise. **There is no spatial smoothing.** Linear baseline drift is removed using pre-activation and late diastolic medians. Each pixel is normalized separately; amplitude is **not membrane mV**.

The transparent quality mask requires sufficient background brightness, amplitude ≥6 original counts, amplitude/residual-noise ratio ≥5, AT within the search window, and APD80 between 140 and 650 ms. Only the largest connected accepted tissue region is kept. Donor 1 retains **2,493 camera pixels**; donor 2 retains **455 pixels**. The remaining camera pixels are background or fail quality criteria. These counts are not cell counts. The threshold is an educational visualization quality criterion, not an independently validated diagnostic classifier.

AT is estimated from the maximum upstroke derivative. RT80 and RT90 use the descending 20% and 10% crossings after the AP peak; APD = RT − AT. These are distinct from recovery markers derived from extracellular electrograms. Sampling at 1 ms does not imply that derived markers have 1 ms accuracy. Lower-SNR boundary pixels can have unstable upstroke estimates; use robust color limits or show signal quality when interpreting maps.

For donor 1, median AT is 156 ms; median RT80 is 522.88 ms; median APD80 is 362.51 ms. The highest-SNR pixel (x=46, y=46) has AT 157 ms, APD80 418.58 ms, and APD90 435.11 ms. These are this export's derived results for this preparation, not published population reference values. Do not use them to diagnose any patient.

## Reproducibility

The original preprocessing workflow used `process_human_optical.py` with the two `.mat` files alongside it and required NumPy, SciPy, Pillow, and Matplotlib. **That script was not recovered in the public source export.** Finished processed files, raw-input hashes, and the descriptions above are retained, but an exact from-raw rerun is not currently possible with the retained source alone. The original workflow wrote `human-optical-processed` files and QA PNGs without modifying the raw data. See [the current reproduction boundary](../../../../docs/REPRODUCIBILITY.md).
