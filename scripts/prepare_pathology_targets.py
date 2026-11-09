#!/usr/bin/env python3
"""Build reproducible, calibrated median-beat targets for the educational fits.

No waveform high-pass filter, independent lead shifting, amplitude normalization,
or nonlinear time warping is applied.  Filtering is confined to the detector's
derivative-energy channel.  Every lead in one beat receives the same integer
sample shift.  A per-lead constant PR reference is the only voltage correction.

Run from any directory: python scripts/prepare_pathology_targets.py
Dependencies: numpy, scipy; matplotlib only for the optional review figures.
The public 500 Hz PTB-XL source is cached alongside the output.  --download
retrieves it only when absent; all other sources already ship with the site.
"""
from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import urllib.request

import numpy as np
from scipy.signal import find_peaks

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "dist" / "data"
LEADS = ["I", "II", "III", "aVR", "aVL", "aVF", "V1", "V2", "V3", "V4", "V5", "V6"]
INDEPENDENT = ["I", "II", "V1", "V2", "V3", "V4", "V5", "V6"]
INDEPENDENT_INDEX = [LEADS.index(lead) for lead in INDEPENDENT]
NATIVE_FS = 500
NATIVE_T = np.arange(-250, 651, 2, dtype=int)
DISPLAY_T = np.arange(-250, 651, 1, dtype=int)
SOURCE_BASE = "https://physionet.org/files/ptb-xl/1.0.3/records500/03000/03155_hr"

# These are visually reviewed approximate landmarks, not source annotations or
# clinical measurements. They constrain the teaching fit, not the waveform.
CASES = {
    "ptbxl-03155": {
        "kind": "rbbb", "title": "Complete RBBB · PTB-XL 03155",
        "file": "clinical-ecgs.json", "baseline": [-80, -60],
        "analysis": [-240, 620], "representativeLead": "V1",
        "fiducials": {"pOnset": -230, "pOffset": -90, "qrsOnset": -40,
                      "qrsOffset": 100, "tOnset": 200, "tOffset": 560},
        "fiducialUncertainty": {"pOnset": 20, "pOffset": 15, "qrsOnset": 10,
                                "qrsOffset": 10, "tOnset": 50, "tOffset": 130},
        "physiology": "Source-labeled complete right bundle branch block with sinus rhythm. The source ECG does not measure the location or cause of the conduction block.",
    },
    "acs-00004": {
        "kind": "stemi-anterior", "title": "Anterior STEMI pattern · ACS 00004",
        "file": "clinical-stemi.json", "baseline": [-95, -65],
        "analysis": [-230, 520], "representativeLead": "V2",
        "fiducials": {"pOnset": -220, "pOffset": -95, "qrsOnset": -40,
                      "qrsOffset": 50, "tOnset": 100, "tOffset": 450},
        "fiducialUncertainty": {"pOnset": 25, "pOffset": 15, "qrsOnset": 10,
                                "qrsOffset": 10, "tOnset": 50, "tOffset": 40},
        "physiology": "Source STEMI/acute myocardial infarction/occlusion myocardial infarction labels and proximal LAD occlusion. Anterior territory is a teaching interpretation; the source does not separately adjudicate a wall territory or an activation map.",
    },
    "acs-18206": {
        "kind": "stemi-inferior", "title": "Inferior STEMI pattern · ACS 18206",
        "file": "clinical-stemi.json", "baseline": [-95, -65],
        "analysis": [-230, 520], "representativeLead": "III",
        "fiducials": {"pOnset": -220, "pOffset": -95, "qrsOnset": -40,
                      "qrsOffset": 56, "tOnset": 110, "tOffset": 400},
        "fiducialUncertainty": {"pOnset": 25, "pOffset": 15, "qrsOnset": 10,
                                "qrsOffset": 10, "tOnset": 50, "tOffset": 40},
        "physiology": "Source STEMI/acute myocardial infarction/occlusion myocardial infarction labels and proximal RCA occlusion. Inferior territory is a teaching interpretation; the source does not separately adjudicate a wall territory or an activation map.",
    },
}

REFERENCES = [
    {"id": "ptb-xl", "title": "PTB-XL v1.0.3, original 500 Hz recordings",
     "url": "https://physionet.org/content/ptb-xl/1.0.3/"},
    {"id": "ptb-xl-plus", "title": "PTB-XL+ v1.0.1, independent automated feature measurements",
     "url": "https://physionet.org/content/ptb-xl-plus/1.0.1/"},
    {"id": "acs-data", "title": "ACS ECG dataset, Figshare version 1",
     "url": "https://doi.org/10.6084/m9.figshare.29925314"},
    {"id": "acs-paper", "title": "A large-scale 12-lead electrocardiogram dataset for acute coronary syndrome prediction containing 19,955 ECGs",
     "url": "https://www.nature.com/articles/s41597-026-07278-0"},
    {"id": "time-coherent-median", "title": "Importance of the Heart Vector Origin Point Definition for an ECG analysis: The ARIC study",
     "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC6400224/"},
    {"id": "aha-technology", "title": "AHA/ACCF/HRS ECG standardization Part I: ECG technology",
     "url": "https://doi.org/10.1016/j.jacc.2007.01.024"},
    {"id": "aha-st", "title": "AHA/ACCF/HRS ECG standardization Part IV: ST, T and U waves and QT interval",
     "url": "https://doi.org/10.1016/j.jacc.2008.12.014"},
    {"id": "filter-distortion", "title": "High-Bandpass Filters in Electrocardiography: Source of Error in Interpretation of the ST Segment",
     "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC3388307/"},
    {"id": "rbbb-human-mapping", "title": "Noninvasive electrocardiographic imaging for cardiac electrophysiology and arrhythmia",
     "url": "https://www.nature.com/articles/nm1011"},
    {"id": "rbbb-direct-mapping", "title": "Spread of the epicardial excitation in right bundle branch block pattern",
     "url": "https://pubmed.ncbi.nlm.nih.gov/731842/"},
    {"id": "stemi-ionic-mechanisms", "title": "Ionic mechanisms of ST segment elevation in electrocardiogram during acute myocardial infarction",
     "url": "https://pmc.ncbi.nlm.nih.gov/articles/PMC10717899/"},
    {"id": "median-variability", "title": "Variability in ECG computer interpretation: individual complexes versus a representative complex",
     "url": "https://pubmed.ncbi.nlm.nih.gov/1402511/"},
]


def rounded(value, decimals=6):
    if isinstance(value, np.ndarray):
        return np.round(value, decimals).tolist()
    return round(float(value), decimals)


def lead_values(array):
    return {lead: rounded(array[i]) for i, lead in enumerate(LEADS)}


def wave_dict(array, interpolate=False):
    if interpolate:
        array = np.array([np.interp(DISPLAY_T, NATIVE_T, row) for row in array])
    return lead_values(array)


def dump_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, allow_nan=False,
                               separators=(",", ":")) + "\n")


def mask(window, time=NATIVE_T):
    return (time >= window[0]) & (time <= window[1])


def external_automated_features(out, allow_download=False):
    path = out / "source" / "ptbxl-plus-03155-automated-features.json"
    if not path.exists() and allow_download:
        artifact = {
            "source": "PTB-XL+ 1.0.1, automatic feature extraction",
            "sourceUrl": "https://physionet.org/content/ptb-xl-plus/1.0.1/",
            "license": "CC BY 4.0",
            "attribution": "Strodthoff et al. (2023), PTB-XL+ version 1.0.1, doi:10.13026/g6h6-7g88; Scientific Data, doi:10.1038/s41597-023-02153-8",
            "recordId": 3155,
            "caveat": "Automatic measurements, not cardiologist ground-truth delineations. Provided only for external cross-check of visually reviewed model timing hints.",
            "features": {},
        }
        for method in ["12sl", "unig", "ecgdeli"]:
            url = f"https://physionet.org/files/ptb-xl-plus/1.0.1/features/{method}_features.csv"
            with urllib.request.urlopen(url, timeout=60) as response:
                reader = csv.DictReader(io.TextIOWrapper(response, encoding="utf-8"))
                row = next((r for r in reader if r.get("ecg_id", "").strip() == "3155"), None)
                assert row is not None, f"ECG 3155 absent from {method} features"
            artifact["features"][method] = {"url": url, "values": row}
        dump_json(path, artifact)
    if not path.exists():
        return None
    raw = json.loads(path.read_text())
    measurements = {}
    for method, data in raw["features"].items():
        values = data["values"]
        measurements[method] = {"sourceUrl": data["url"], **{
            name: float(values[key]) for name, key in [
                ("qrsDurationMs", "QRS_Dur_Global"), ("prIntervalMs", "PR_Int_Global"),
                ("qtIntervalMs", "QT_Int_Global"), ("rrMs", "RR_Mean_Global"),
            ]}}
    return {
        "source": raw["source"], "sourceUrl": raw["sourceUrl"],
        "license": raw["license"], "attribution": raw["attribution"],
        "fullRowsUrl": "./data/pathology-fits/source/ptbxl-plus-03155-automated-features.json",
        "measurements": measurements,
        "interpretation": "Independent automated methods broadly corroborate a wide QRS but disagree on P/T endpoints. QT is 476/486/626 ms for 12SL/Uni-G/ECGDeli. They are not expert ground truth. The broad late recovery display endpoint in fiducialsMs is not a validated QT endpoint; its uncertainty is deliberately widened. Original waveforms and fixed analysis windows are unchanged.",
    }


def source_record(record_id, config, out, allow_download=False):
    bundle = json.loads((DATA / config["file"]).read_text())
    record = next(r for r in bundle["records"] if r["id"] == record_id)
    source = {key: record[key] for key in [
        "source", "sourceUrl", "sourcePaperUrl", "recordUrl", "recordLocator",
        "downloadUrl", "metadataUrl", "license", "licenseUrl", "attribution",
        "sourceLabel", "sourceLabels", "scpCodes", "validatedByHuman",
        "sourceClinicalFlags", "sourceTerritoryLabel", "territoryInterpretation",
        "sourceTimeToAngiographyMinutes",
        "recordSha256", "checksumVerified", "archiveCRC32Verified", "integrityNote",
    ] if key in record}
    source["bundledRecordId"] = record_id
    source["bundledDataUrl"] = "./data/" + config["file"]
    source["calibration"] = "mV = digital ADC value / 1000; zero ADC baseline. No amplitude normalization."
    source["sourceLabelIsMeasuredActivation"] = False
    if record_id == "ptbxl-03155":
        # Retain the original paired WFDB filenames so the header's relative
        # DAT reference remains usable by standard WFDB readers.
        files = {ext: out / "source" / f"03155_hr.{ext}" for ext in ["hea", "dat"]}
        for ext, path in files.items():
            if not path.exists():
                if not allow_download:
                    raise FileNotFoundError(f"{path}: run with --download to retrieve the open PhysioNet source")
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(urllib.request.urlopen(SOURCE_BASE + "." + ext, timeout=60).read())
        header = files["hea"].read_text().strip().splitlines()
        assert header[0].split()[1:] == ["12", "500", "5000"]
        digital = np.frombuffer(files["dat"].read_bytes(), dtype="<i2").reshape(5000, 12)
        expected_initial, expected_checksum = [], []
        for line in header[1:13]:
            fields = line.split()
            assert fields[1] == "16" and re.fullmatch(r"1000(?:\.0)?\(0\)/mV", fields[2])
            expected_initial.append(int(fields[5]))
            expected_checksum.append(int(fields[6]) & 65535)
        assert np.array_equal(digital[0], expected_initial), "PTB-XL WFDB initial-value mismatch"
        assert np.array_equal(digital.astype(np.int64).sum(axis=0) & 65535, expected_checksum), "PTB-XL WFDB checksum mismatch"
        signals = digital.T.astype(float) / 1000
        manifest_url = "https://physionet.org/files/ptb-xl/1.0.3/SHA256SUMS.txt"
        manifest_path = out / "source" / "PTBXL-SHA256SUMS-selected.txt"
        manifest_names = {f"records500/03000/03155_hr.{ext}": files[ext] for ext in files}
        if not manifest_path.exists() and allow_download:
            selected = []
            with urllib.request.urlopen(manifest_url, timeout=60) as response:
                for raw_line in response:
                    line = raw_line.decode().strip()
                    fields = line.split(maxsplit=1)
                    if len(fields) == 2 and fields[1].lstrip("./") in manifest_names:
                        selected.append(line)
                    if len(selected) == len(manifest_names):
                        break
            assert len(selected) == 2, "Original PhysioNet checksum entries not found"
            manifest_path.write_text("\n".join(selected) + "\n")
        manifest_verified = False
        if manifest_path.exists():
            found = set()
            for line in manifest_path.read_text().splitlines():
                expected_sha, name = line.split(maxsplit=1)
                name = name.lstrip("./")
                assert name in manifest_names
                assert hashlib.sha256(manifest_names[name].read_bytes()).hexdigest() == expected_sha, "PhysioNet published SHA-256 mismatch"
                found.add(name)
            assert found == set(manifest_names)
            manifest_verified = True
        source.update({
            "recordUrl": "https://physionet.org/content/ptb-xl/1.0.3/records500/03000/03155_hr.hea",
            "downloadUrl": SOURCE_BASE + ".dat",
            "headerDownloadUrl": SOURCE_BASE + ".hea",
            "bundledRecordNativeFs": record["fs"], "targetSourceNativeFs": 500,
            "recordSha256": hashlib.sha256(files["dat"].read_bytes()).hexdigest(),
            "headerSha256": hashlib.sha256(files["hea"].read_bytes()).hexdigest(),
            "recordSha256ManifestVerified": manifest_verified,
            "sha256ManifestUrl": manifest_url,
            "selectedManifestUrl": "./data/pathology-fits/source/PTBXL-SHA256SUMS-selected.txt" if manifest_verified else None,
            "checksumVerified": True,
            "integrityNote": "All 12 WFDB initial values and modulo-65536 channel checksums verified against the original 500 Hz file. The app and fitting study use this native 500 Hz edition; the previously bundled 100 Hz edition remains in the separate clinical-ecgs.json download.",
            "attribution": "Wagner, Strodthoff, Bousseljot, Samek and Schaeffter (2022), PTB-XL version 1.0.3, PhysioNet, doi:10.13026/kfzx-aw45; original publication Wagner et al. (2020), Scientific Data 7,154, doi:10.1038/s41597-020-0495-6. Derived median beats and analysis prepared for Cardio; original calibrated samples retained.",
            "rawDatUrl": "./data/pathology-fits/source/03155_hr.dat",
            "rawHeaderUrl": "./data/pathology-fits/source/03155_hr.hea",
        })
        external = external_automated_features(out, allow_download)
        if external:
            source["externalAutomatedFeatureCrossCheckUrl"] = external["fullRowsUrl"]
    else:
        assert record["fs"] == NATIVE_FS
        signals = np.array([record["signals"][lead] for lead in LEADS], dtype=float)
        digital = np.rint(signals.T * 1000).astype("<i2")
        recovered_hash = hashlib.sha256(digital.tobytes()).hexdigest()
        assert recovered_hash == record["recordSha256"], "Bundled mV values do not round-trip to source DAT checksum"
        source["reconstructedOriginalDatSha256Verified"] = True
        # The source header's bogus checksum fields remain disclosed. This hash
        # check is against the preserved source DAT hash, not those header fields.
    assert signals.shape == (12, 5000) and np.isfinite(signals).all()
    source["rawCalibratedJsonUrl"] = f"./data/pathology-fits/source/{record_id}-500hz.json"
    dump_json(out / "source" / f"{record_id}-500hz.json", {
        "id": record_id + "-500hz-original", "originalRecordId": record_id,
        "fs": 500, "seconds": 10, "sampleCount": 5000, "units": "mV",
        "leadOrder": LEADS, "source": source, "signals": wave_dict(signals),
        "processing": "Calibrated source waveform. No added filter, baseline subtraction, resampling, normalization or cropping.",
    })
    return signals, source


def find_anchors(signals):
    # Detector smoothing never touches the waveform supplied to the fit.
    derivative = np.diff(signals[INDEPENDENT_INDEX], axis=1,
                         prepend=signals[INDEPENDENT_INDEX, :1])
    energy = np.sqrt(np.mean(derivative ** 2, axis=0))
    detector = np.convolve(energy, np.ones(20) / 20, mode="same")
    candidates, _ = find_peaks(detector, distance=225,
                              prominence=float(np.percentile(detector, 99) * .25))
    # One clear source lead-I R maximum is used for all 12 leads. In RBBB,
    # V1's terminal R-prime is deliberately not used as a separate anchor.
    anchors = []
    for candidate in candidates:
        lo, hi = max(0, candidate - 40), min(signals.shape[1], candidate + 41)
        anchors.append(lo + int(np.argmax(signals[0, lo:hi])))
    return np.unique(anchors)


def correlation(a, b):
    aa, bb = np.asarray(a).ravel(), np.asarray(b).ravel()
    if np.std(aa) < 1e-12 or np.std(bb) < 1e-12:
        return 0.
    return float(np.corrcoef(aa, bb)[0, 1])


def build_case(record_id, config, signals, source, out):
    anchors = find_anchors(signals)
    rr_ms = np.diff(anchors) * 2
    complete = anchors[(anchors >= 125) & (anchors + 325 < signals.shape[1])]
    raw = np.array([signals[:, anchor - 125:anchor + 326] for anchor in complete])
    baseline_window = config["baseline"]
    baselines = np.median(raw[:, :, mask(baseline_window)], axis=2)
    centered = raw - baselines[:, :, None]
    preliminary = np.median(centered, axis=0)
    qrs_mask = mask([-50, 150])
    ref = preliminary[INDEPENDENT_INDEX][:, qrs_mask]
    scale = np.maximum(np.ptp(ref, axis=1), .1)
    complete_quality = []
    accepted = []
    for index, beat in enumerate(centered):
        qrs = beat[INDEPENDENT_INDEX][:, qrs_mask]
        corr = correlation(qrs, ref)
        per_lead_nrmse = np.sqrt(np.mean((qrs - ref) ** 2, axis=1)) / scale
        reasons = []
        if corr < .95:
            reasons.append("multilead QRS correlation below 0.95")
        if float(per_lead_nrmse.max()) > .25:
            reasons.append("at least one independent lead QRS RMS deviation exceeds 25% of that lead's template QRS range")
        keep = not reasons
        if keep:
            accepted.append(index)
        complete_quality.append({
            "qrsCorrelationToPreliminaryMedian": rounded(corr),
            "qrsMeanNormalizedRmse": rounded(per_lead_nrmse.mean()),
            "qrsWorstLeadNormalizedRmse": rounded(per_lead_nrmse.max()),
            "qrsWorstLead": INDEPENDENT[int(np.argmax(per_lead_nrmse))],
            "accepted": keep, "exclusionReasons": reasons,
        })
    assert len(accepted) >= 6, "Not enough complete, coherent beats to support separate train and held-out medians"
    accepted = np.array(accepted, dtype=int)
    kept = centered[accepted]
    train_indices, test_indices = accepted[::2], accepted[1::2]
    train, test = centered[train_indices], centered[test_indices]
    summary = {
        "samplesMv": np.median(kept, axis=0),
        "iqrLowMv": np.percentile(kept, 25, axis=0),
        "iqrHighMv": np.percentile(kept, 75, axis=0),
        "trainMv": np.median(train, axis=0),
        "testMv": np.median(test, axis=0),
    }
    med = summary["samplesMv"]
    analysis_mask = mask(config["analysis"])
    # Baseline sensitivity is a systematic-choice check, not a confidence
    # interval or an estimate of recovered absolute extracellular DC voltage.
    alternatives = {}
    alternative_offsets = []
    for label, window in [("earlierPR", [baseline_window[0] - 10, baseline_window[1] - 10]),
                          ("laterPR", [baseline_window[0] + 10, baseline_window[1] + 10]),
                          ("preP_TP", [-250, -230])]:
        alternative_baselines = np.median(raw[accepted][:, :, mask(window)], axis=2)
        offsets = alternative_baselines - baselines[accepted]
        alternatives[label] = {
            "windowMs": window,
            "medianReferenceOffsetFromChosenPrMv": lead_values(np.median(offsets, axis=0)),
            "p25ReferenceOffsetMv": lead_values(np.percentile(offsets, 25, axis=0)),
            "p75ReferenceOffsetMv": lead_values(np.percentile(offsets, 75, axis=0)),
        }
        if label != "preP_TP":
            alternative_offsets.append(np.median(offsets, axis=0))
    baseline_variability = np.std(baselines[accepted], axis=0, ddof=1)
    baseline_within_mad = np.median(np.median(
        np.abs(raw[accepted][:, :, mask(baseline_window)] - baselines[accepted, :, None]), axis=2), axis=0)
    beat_spread = np.sqrt(np.mean((kept[:, INDEPENDENT_INDEX][:, :, analysis_mask] -
                                 med[INDEPENDENT_INDEX][:, analysis_mask]) ** 2, axis=(1, 2)))
    fit_lead_rms = np.sqrt(np.mean((summary["trainMv"] - summary["testMv"]) ** 2,
                                  axis=1, where=np.broadcast_to(analysis_mask, med.shape)))
    approximate_j = config["fiducials"]["qrsOffset"]
    st = {}
    for label, moment in [("atJ", approximate_j), ("jPlus60", approximate_j + 60)]:
        window = [moment - 5, moment + 5]
        beat_values = np.mean(kept[:, :, mask(window)], axis=2)
        st[label] = {
            "centerMs": moment, "averagingWindowMs": window,
            "medianMv": lead_values(np.median(beat_values, axis=0)),
            "p25Mv": lead_values(np.percentile(beat_values, 25, axis=0)),
            "p75Mv": lead_values(np.percentile(beat_values, 75, axis=0)),
        }
    # Pointwise medians need not commute with limb-lead subtraction. Report the
    # small residual rather than quietly modifying real median lead waveforms.
    limb_predictions = {"III": med[1] - med[0], "aVR": -(med[0] + med[1]) / 2,
                        "aVL": med[0] - med[1] / 2, "aVF": med[1] - med[0] / 2}
    limb_residual = {lead: rounded(np.sqrt(np.mean((med[LEADS.index(lead)] - pred) ** 2)))
                     for lead, pred in limb_predictions.items()}
    beat_rows = []
    for original_index, anchor in enumerate(anchors):
        row = {"detectedBeatIndex": original_index, "sourceAnchorSample": int(anchor),
               "sourceAnchorSeconds": rounded(anchor / NATIVE_FS),
               "qrsAnchorLead": "I", "qrsAnchorIsSourceAnnotation": False}
        if anchor not in complete:
            row.update({"accepted": False, "split": None,
                        "exclusionReasons": ["incomplete -250 to +650 ms source window"],
                        "baselineMv": None, "quality": None})
        else:
            index = int(np.flatnonzero(complete == anchor)[0])
            q = complete_quality[index]
            row.update({"accepted": q["accepted"],
                        "split": "train" if index in train_indices else "heldout" if index in test_indices else None,
                        "exclusionReasons": q["exclusionReasons"],
                        "baselineMv": lead_values(baselines[index]), "quality": q})
        beat_rows.append(row)
    # The displayed single source beat is closest to the all-beat template. It
    # is never substituted for held-out data in fitting evaluation.
    representative_in_kept = int(np.argmin(beat_spread))
    representative_complete_index = int(accepted[representative_in_kept])
    representative_anchor = int(complete[representative_complete_index])
    source_anchor_seconds = representative_anchor / NATIVE_FS
    next_p_earliest = float(rr_ms.min() + config["fiducials"]["pOnset"])
    native = {"sampleGridMs": NATIVE_T.tolist(), "fs": NATIVE_FS,
              **{key: wave_dict(value) for key, value in summary.items()}}
    result = {
        "id": record_id, "sourceRecordId": record_id, "kind": config["kind"],
        "title": config["title"], "representativeLead": config["representativeLead"],
        "source": source, "nativeFs": NATIVE_FS, "units": "mV", "leadOrder": LEADS,
        "independentLeadOrder": INDEPENDENT,
        "sampleGridMs": DISPLAY_T.tolist(), "anchorSample": 250,
        "anchorDefinition": "The same lead-I R-maximum sample is used to align every lead in a beat. t=0 is not QRS onset. No lead is shifted independently.",
        "anchorSourceSeconds": rounded(source_anchor_seconds),
        "anchorSourceSample": representative_anchor,
        "qrsAnchorIsSourceAnnotation": False,
        "nativeResolutionMs": 2, "displayGridSpacingMs": 1,
        "interpolation": "Linear interpolation of 500 Hz derived median waveforms for display and a common fit grid; native 2 ms waveforms are also supplied. Interpolation adds no temporal information.",
        "baselineWindowMs": baseline_window,
        "baselineNativeSampleTimesMs": NATIVE_T[mask(baseline_window)].tolist(),
        "baselineNativeSampleCount": int(mask(baseline_window).sum()),
        "baselineDefinition": "Per-beat, per-lead median over this visually reviewed PR window is subtracted as one constant. No high-pass filter or within-beat trend subtraction is added. ST deviations remain relative to this PR reference, not an inferred absolute DC zero.",
        "analysisWindowMs": config["analysis"],
        "displayWindowMs": [-250, 650],
        "neighboringBeat": {"earliestExpectedNextPOnsetMs": rounded(next_p_earliest),
                            "displayCanIncludeNextP": next_p_earliest <= 650,
                            "note": "The wider display window may include the next P wave when RR is short; fitting and reported residuals use analysisWindowMs. No beats are stretched to a common RR."},
        "medianRRMs": rounded(np.median(rr_ms)),
        "heartRateBpm": rounded(60000 / np.median(rr_ms), 3),
        "rrIntervalsMs": rr_ms.tolist(),
        "fiducialsMs": config["fiducials"],
        "fiducialUncertaintyMs": config["fiducialUncertainty"],
        "fiducialProvenance": "Approximate visual review of the simultaneous native-resolution median plots for model initialization only. Not source cardiologist delineations, measured 3D activation, or validated clinical interval measurements. Broad T/U boundaries and ST-T fusion make some landmarks ambiguous.",
        "externalAutomaticDelineation": external_automated_features(out) if record_id == "ptbxl-03155" else None,
        "approximateQrsDurationMs": approximate_j - config["fiducials"]["qrsOnset"],
        **{key: wave_dict(value, interpolate=True) for key, value in summary.items()},
        "native": native, "beats": beat_rows,
        "representativeOriginalBeat": {
            "sourceAnchorSeconds": rounded(source_anchor_seconds),
            "sourceAnchorSample": representative_anchor,
            "nativeSamplesMv": wave_dict(raw[representative_complete_index]),
            "baselineCorrectedNativeSamplesMv": wave_dict(centered[representative_complete_index]),
            "baselineMv": lead_values(baselines[representative_complete_index]),
            "selection": "Accepted beat with lowest eight-independent-lead RMS deviation from the median across the analysis window; selected for illustration, not held-out scoring.",
        },
        "quality": {
            "detectedBeatCount": int(len(anchors)), "completeBeatCount": int(len(complete)),
            "acceptedBeatCount": int(len(accepted)), "excludedBeatCount": int(len(anchors) - len(accepted)),
            "edgeExcludedBeatCount": int(len(anchors) - len(complete)),
            "morphologyExcludedBeatCount": int(len(complete) - len(accepted)),
            "trainBeatCount": int(len(train_indices)), "heldoutBeatCount": int(len(test_indices)),
            "split": "Chronological alternating accepted beats: first/third/etc for training, second/fourth/etc held out. Fitting must not use held-out waveforms. This evaluates within-record repeatability, not validation in other patients. Shared deterministic quality screening and visual landmark review precede the split.",
            "exclusionRule": "Reject incomplete windows; reject complete beats with pooled independent-lead QRS correlation <0.95 OR any independent-lead QRS RMS deviation >0.25 of that lead's template range (range floor 0.1 mV). Preliminary template is the untrimmed pointwise median. QRS comparison window -50..150 ms. No beat is rejected for ST magnitude alone.",
            "rejectionInterpretation": "A discordant QRS may be artifact or real variation; this procedure does not adjudicate the cause. All source samples remain available.",
            "perBeatRmsToMedianMv": rounded(beat_spread),
            "medianBeatToMedianRmsMv": rounded(np.median(beat_spread)),
            "trainVsHeldoutRmseMv": rounded(np.sqrt(np.mean((summary["trainMv"][INDEPENDENT_INDEX][:, analysis_mask] - summary["testMv"][INDEPENDENT_INDEX][:, analysis_mask]) ** 2))),
            "trainVsHeldoutCorrelation": rounded(correlation(summary["trainMv"][INDEPENDENT_INDEX][:, analysis_mask], summary["testMv"][INDEPENDENT_INDEX][:, analysis_mask])),
            "trainVsHeldoutPerLeadRmseMv": lead_values(fit_lead_rms),
            "baselineBetweenBeatStdMv": lead_values(baseline_variability),
            "baselineWithinBeatMedianAbsoluteDeviationMv": lead_values(baseline_within_mad),
            "baselineWindowShiftSensitivityMv": lead_values(np.max(np.abs(alternative_offsets), axis=0)),
            "baselineAlternatives": alternatives,
            "baselineUncertaintyNote": "Between-beat baseline variation contains drift and physiology. Within-window MAD includes residual noise and slope. Shifted PR and pre-P reference comparisons show sensitivity to baseline choice; they are not statistical confidence intervals. The pre-P 20 ms window can contain P onset uncertainty.",
            "medianLimbLeadAlgebraResidualRmseMv": limb_residual,
            "iqrMeaning": "25th–75th percentile of accepted aligned beats, including physiological variation and noise; not a confidence interval on the anatomical simulation or the median.",
        },
        "stMetrics": st,
        "stMetricCaveat": "Descriptive levels relative to the chosen PR reference at an approximate, visually reviewed J point and J+60 ms. They are not a new diagnosis or a substitute for original-record interpretation. Baseline sensitivity and fiducial uncertainty apply.",
        "physiologyInterpretation": config["physiology"],
        "limitations": [
            "A surface ECG constrains a forward-model explanation but does not uniquely identify internal activation, recovery, torso conductivity, injury extent or anatomy.",
            "Median averaging suppresses non-repeating details, including genuine beat-to-beat changes. Originals and individual-beat metadata are retained.",
            "P and T variability is not separately time-warped; it remains in the ensemble and its interquartile band.",
            "The source acquisition system may already have applied filters; this preparation adds none to the waveform.",
            "These are short recordings of three different cases, not a validated clinical cohort or a personalized cardiac digital twin.",
        ],
        "nativeBeatArrayUrl": f"./data/pathology-fits/{record_id}-beats.npz",
        "reviewFigureUrl": f"./data/pathology-fits/review/{record_id}.png",
    }
    np.savez_compressed(out / f"{record_id}-beats.npz", lead_order=np.array(LEADS),
                        independent_lead_order=np.array(INDEPENDENT),
                        native_time_ms=NATIVE_T, native_fs=np.array(500),
                        full_source_mv=signals, source_anchors=anchors,
                        complete_source_anchors=complete, raw_complete_beats_mv=raw,
                        baselines_mv=baselines, centered_complete_beats_mv=centered,
                        accepted_complete_indices=accepted,
                        train_complete_indices=train_indices, heldout_complete_indices=test_indices,
                        median_mv=med, train_median_mv=summary["trainMv"],
                        heldout_median_mv=summary["testMv"],
                        iqr_low_mv=summary["iqrLowMv"], iqr_high_mv=summary["iqrHighMv"])
    return result, kept, centered, complete_quality


def review_figure(case, kept, centered, complete_quality, out):
    os.environ.setdefault("MPLCONFIGDIR", "/tmp/matplotlib-ekg-pathology-targets")
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9})
    fig, axes = plt.subplots(6, 2, figsize=(14, 13), sharex=True)
    med = np.array([case["native"]["samplesMv"][lead] for lead in LEADS])
    low = np.array([case["native"]["iqrLowMv"][lead] for lead in LEADS])
    high = np.array([case["native"]["iqrHighMv"][lead] for lead in LEADS])
    for k, ax in enumerate(axes.T.flatten()):
        for beat in kept:
            ax.plot(NATIVE_T, beat[k], color="#6c8c96", alpha=.19, lw=.6)
        for j, q in enumerate(complete_quality):
            if not q["accepted"]:
                ax.plot(NATIVE_T, centered[j, k], color="#b86255", alpha=.45, lw=.7, ls="--")
        ax.fill_between(NATIVE_T, low[k], high[k], color="#35b6ac", alpha=.25)
        ax.plot(NATIVE_T, med[k], color="#12384b", lw=1.5)
        ax.axvline(0, color="#ce6e68", lw=.8, alpha=.6)
        ax.axvspan(*case["baselineWindowMs"], color="#b7cbd2", alpha=.32)
        ax.axvspan(*case["analysisWindowMs"], color="#e9f3f4", alpha=.14, zorder=-2)
        ax.axhline(0, color="#87989d", lw=.6, alpha=.5)
        ax.set_title(LEADS[k], loc="left", weight="bold", color="#12384b")
        ax.set_ylabel("mV"); ax.grid(alpha=.12); ax.set_xlim(-250, 650)
        ax.spines[["top", "right"]].set_visible(False)
    axes[-1, 0].set_xlabel("Time from common lead-I R anchor (ms)")
    axes[-1, 1].set_xlabel("Time from common lead-I R anchor (ms)")
    q = case["quality"]
    fig.suptitle(case["title"], x=.06, y=.99, ha="left", size=18, color="#12384b")
    fig.text(.06, .963,
             f"Original 500 Hz • {q['acceptedBeatCount']} accepted beats • {q['trainBeatCount']} training / {q['heldoutBeatCount']} held out • "
             f"PR reference {case['baselineWindowMs'][0]} to {case['baselineWindowMs'][1]} ms\n"
             "Navy: pointwise median · teal: between-beat IQR · gray: accepted source beats · dashed rust: excluded morphology\n"
             "One simultaneous time shift per beat; no high-pass filter, amplitude scaling or time warping. Approximate landmarks are not source annotations.",
             ha="left", va="top", color="#506670", fontsize=9)
    fig.tight_layout(rect=(.025, .025, .99, .925))
    destination = out / "review" / f"{case['id']}.png"
    destination.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(destination, dpi=135, facecolor="#fcfefe")
    plt.close(fig)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, default=DATA / "pathology-fits")
    parser.add_argument("--download", action="store_true")
    parser.add_argument("--no-plots", action="store_true")
    parser.add_argument("--cases", nargs="+", choices=list(CASES), default=list(CASES))
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    cases = []
    for record_id in args.cases:
        config = CASES[record_id]
        signals, source = source_record(record_id, config, args.out, args.download)
        case, kept, centered, complete_quality = build_case(record_id, config, signals, source, args.out)
        if not args.no_plots:
            review_figure(case, kept, centered, complete_quality, args.out)
        cases.append(case)
        q = case["quality"]
        print(f"{record_id}: {q['acceptedBeatCount']}/{q['detectedBeatCount']} accepted; "
              f"{q['edgeExcludedBeatCount']} edge, {q['morphologyExcludedBeatCount']} morphology exclusions; "
              f"train/heldout r={q['trainVsHeldoutCorrelation']:.4f}, RMS={q['trainVsHeldoutRmseMv']:.4f} mV")
    artifact = {
        "schemaVersion": 1, "artifact": "cardio-pathology-median-targets-v1",
        "generatedBy": "scripts/prepare_pathology_targets.py",
        "purpose": "Reproducible real-ECG target preparation for best-guess educational forward-model fits; not recovered patient activation maps.",
        "leadOrder": LEADS, "independentLeadOrder": INDEPENDENT,
        "method": {
            "detector": "RMS derivative energy over I, II, V1–V6; 40 ms moving average in detector only; 450 ms refractory separation; prominence 25% of detector's 99th percentile; refine to lead-I R maximum within ±80 ms.",
            "alignment": "One integer-sample R anchor shared across every lead; simultaneous 900 ms window. No nonlinear time warping, per-lead shifting, amplitude normalization or added waveform filters.",
            "reference": "One per-lead PR-window median constant subtracted per beat, with early/late-window and pre-P sensitivity reported. This is an ECG reference convention, not absolute extracellular voltage.",
            "aggregation": "Pointwise median plus 25th/75th percentiles of accepted simultaneous beats. Original calibrated source signals, native 500 Hz results and all complete-beat arrays are retained.",
            "heldout": "Chronological alternating accepted beats. Train/test medians are separate; display median uses all accepted beats. Preprocessing quality screening and visual landmark review are shared. Generalization beyond this recording is not evaluated.",
            "fitLeads": "Fit I, II, V1–V6 as the eight independent channels; derive the four other limb leads for model predictions. Real measured median limb channels are retained without enforcing algebra after the nonlinear median operation.",
        },
        "references": REFERENCES, "cases": cases,
    }
    destination = args.out / "targets-v1.json"
    dump_json(destination, artifact)
    print(f"Wrote {destination.relative_to(ROOT) if destination.is_relative_to(ROOT) else destination} ({destination.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()
