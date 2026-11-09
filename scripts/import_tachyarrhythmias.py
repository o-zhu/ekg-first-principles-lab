#!/usr/bin/env python3
"""Import five real PhysioNet rhythm excerpts, preserving native samples.

Requires numpy. Run with --download to retrieve the original public WFDB files;
otherwise use the retained source cache. Every source SHA-256, full-record WFDB
checksum, initial ADC value, sample count and inverse calibration is verified.
No filtering, resampling, interpolation or fabricated leads are applied.

The VFDB .atr files contain rhythm labels only. The fixed VT maxima below were
identified in ECG channel 2 and visually reviewed in both original channels.
They are visualization anchors, not source-validated QRS-onset measurements.
No QRS anchors or numerical ventricular rate are assigned to fibrillation.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SYMBOLS = {1: "N", 2: "L", 3: "R", 4: "a", 5: "V", 6: "F", 7: "J",
           8: "A", 9: "S", 10: "E", 11: "j", 12: "/", 13: "Q", 14: "~",
           16: "|", 18: "s", 19: "T", 20: "*", 21: "D", 22: '"', 23: "=",
           24: "p", 25: "B", 26: "^", 27: "t", 28: "+", 29: "u", 30: "?",
           31: "!", 32: "[", 33: "]", 34: "e", 35: "n", 36: "@", 37: "x",
           38: "f", 39: "(", 40: ")", 41: "r"}
BEAT_SYMBOLS = set("NLRaVFJASEj/Qenf")
VT_ANCHOR_SAMPLES = [63,124,184,243,303,367,427,487,548,610,674,734,795,857,
                     917,979,1040,1101,1159,1219,1282,1342,1403,1465,1528,
                     1590,1651,1713,1775,1835,1898,1958,2018,2080,2140,
                     2200,2260,2322,2384,2445]

DATABASES = {
    "mitdb": {
        "name": "MIT-BIH Arrhythmia Database",
        "doi": "10.13026/C2F305",
        "attribution": "Contains information from Moody and Mark, MIT-BIH Arrhythmia Database v1.0.0, PhysioNet, under ODC-By 1.0. DOI: 10.13026/C2F305. Original publication: Moody GB, Mark RG. The impact of the MIT-BIH Arrhythmia Database. IEEE Engineering in Medicine and Biology Magazine 20(3):45–50 (2001), DOI: 10.1109/51.932724.",
    },
    "vfdb": {
        "name": "MIT-BIH Malignant Ventricular Ectopy Database",
        "doi": "10.13026/C22P44",
        "attribution": "Contains information from Albrecht, Moody and Mark, MIT-BIH Malignant Ventricular Ectopy Database v1.0.0, PhysioNet, under ODC-By 1.0. DOI: 10.13026/C22P44. Original publication: Greenwald SD. Development and analysis of a ventricular fibrillation detector. MIT M.S. thesis (1986), https://dspace.mit.edu/handle/1721.1/92988.",
    },
}

CASES = [
    dict(db="mitdb", record="202", start=1264, kind="af-rvr", code="(AFIB",
         title="Atrial fibrillation · rapid ventricular response", lead="MLII", offset=.035, qrs=.09,
         description="A source-annotated atrial-fibrillation episode with a mean ventricular rate of approximately 124 bpm in this excerpt. The R–R intervals vary from 400 to 864 ms. RVR describes the measured fast ventricular response; it is not an additional diagnostic code supplied by the database.",
         electrical="Disorganized atrial activation supplies irregular impulses to the AV junction. The original ventricular beat markers drive the irregular, fast ventricular sequence; no discrete P-wave clock is assigned.",
         mechanical="The atria do not perform a coordinated atrial squeeze. Ventricular contractions follow the recorded irregular beat timing. Reduced filling time at a fast rate is a teaching mechanism, not a measured cardiac-output estimate for this patient.",
         observe="Compare the unequal R–R intervals and absent consistent P waves with the healthy example. The mean rate is calculated from the original beat markers, not by counting presumed atrial waves.",
         caveat="The full source record contains late-cycle PVCs and transitions between atrial fibrillation, flutter and other rhythms. This selected AF excerpt contains only source N beat labels; those labels identify conducted QRS complexes and do not mean the underlying rhythm is sinus."),
    dict(db="vfdb", record="421", start=1360, kind="vt", code="(VT",
         title="Ventricular tachycardia", lead="ECG2", offset=.055, qrs=.18,
         description="A real two-channel recording within a source-labeled sustained ventricular-tachycardia episode. Repetitive broad complexes occur at approximately 246 per minute. The source supplies VT without a separately adjudicated monomorphic/polymorphic subtype or a confirmed circuit location.",
         electrical="Ventricular activation is driven by a rapid ventricular rhythm, rather than by the usual sinus-to-AV-to-His sequence. The reference model illustrates an abnormal ventricular activation sequence; its origin and circuit are not mapped from this recording.",
         mechanical="Rapid ventricular activation leaves little time between contractions. The reference ventricle shortens repeatedly at the observed cycle timing. Contraction amplitude, atrioventricular relationship and pumping effectiveness are illustrative rather than measured.",
         observe="Inspect the repetitive broad complexes and compare their speed with SVT and AF with RVR. Channel 2 shows a clear repeated morphology; source baseline drift is retained in both channels.",
         caveat="The source labels the enclosing 150.232-second interval as VT. Morphology and amplitude vary within the recording. The website does not add a monomorphic diagnosis, infer a scar location, or relabel this VT as torsades."),
    dict(db="mitdb", record="222", start=1690, kind="flutter", code="(AFL",
         title="Atrial flutter · variable ventricular response", lead="MLII", offset=.035, qrs=.09,
         description="A source-annotated atrial-flutter excerpt with visible repetitive atrial activity and a variable ventricular response, averaging approximately 102 bpm. The recording does not supply validated flutter-wave onsets or an electrophysiologically proven circuit.",
         electrical="Organized repetitive atrial activation continues while the AV junction transmits a variable subset of impulses. A typical right-atrial flutter loop is used as an anatomical teaching example; it is not an adjudicated mechanism for this patient.",
         mechanical="Rapid atrial activity does not imply an effective atrial squeeze on every flutter wave. Ventricular contractions follow the original QRS markers and their variable spacing. Atrial timing and the depicted loop are illustrative.",
         observe="Look between QRS complexes for repetitive atrial deflections, then compare the changing R–R intervals. The source label is flutter; a specific 2:1, 3:1 or 4:1 ratio is not assigned from the animation.",
         caveat="The original record contains paroxysmal flutter/fibrillation, nodal escape beats after some conversions, and periods of high-frequency artifact. This ten-second excerpt lies wholly inside the final source AFL interval; native noise remains visible."),
    dict(db="mitdb", record="209", start=560, kind="svt", code="(SVTA",
         title="Supraventricular tachycardia", lead="MLII", offset=.035, qrs=.09,
         description="A source-labeled supraventricular tachyarrhythmia with a relatively regular ventricular rate of approximately 160 bpm. The original beat annotations label the QRS events as supraventricular/atrial premature beats. A specific AVNRT, AVRT or atrial-tachycardia mechanism is not supplied.",
         electrical="A rapid supraventricular rhythm activates the ventricles through the AV junction and conducting system. The animation shows that broad sequence without claiming a particular re-entry circuit or an accessory pathway.",
         mechanical="A short cycle length reduces the interval available for ventricular filling. The original QRS markers synchronize the ventricular reference motion. Atrial phase, contraction strength and actual hemodynamic effects are not measured by this recording.",
         observe="Compare its relatively regular narrow-complex pattern with irregular AF and the broad-complex VT example. Rhythm origin cannot be assigned to an exact anatomical circuit from this two-channel example alone.",
         caveat="The database rhythm term is SVTA, meaning supraventricular tachyarrhythmia. It does not identify AVNRT, AVRT, an accessory pathway, or a specific atrial focus."),
    dict(db="vfdb", record="422", start=1550, kind="vf", code="(VFIB",
         title="Ventricular fibrillation", lead="ECG1", offset=0, qrs=None,
         description="A real source-labeled ventricular-fibrillation excerpt with disorganized ventricular electrical activity and no stable series of discrete QRS complexes. No organized ventricular rate or invented beat markers are assigned.",
         electrical="Different ventricular regions activate without a coordinated sequence. The reference animation illustrates asynchronous ventricular activity; the surface recording does not reveal patient-specific wavefronts or re-entry paths.",
         mechanical="There is no coordinated ventricular ejection sequence. The reference heart shows disorganized local motion rather than normal rhythmic chamber shortening. Local motion amplitude and atrial behavior remain illustrative.",
         observe="Look for the loss of repeating QRS complexes. Compare this disorganized signal with the repetitive complexes in VT. Do not interpret every waveform peak as a ventricular beat.",
         caveat="The source annotation is VFIB. It is not a torsades annotation. No rhythm rate, QRS duration, P-wave series or beat-by-beat ventricular sequence is inferred for this excerpt."),
]


def read_header(path: Path):
    lines = path.read_text().splitlines()
    record, channels, frequency, count, *_ = lines[0].split()
    channels, fs, count = int(channels), int(frequency), int(count)
    definitions = []
    for line in lines[1:channels + 1]:
        a = line.split()
        gain, _, units = a[2].partition("/")
        definitions.append(dict(sourceLabel=a[-1], format=a[1], adcGain=float(gain),
                                adcBaseline=int(a[4]), initialValue=int(a[5]),
                                checksum=int(a[6]), units=units or "mV"))
    return fs, count, definitions, lines


def read_annotations(path: Path, fs: int):
    data, annotations = path.read_bytes(), []
    index = sample = channel = number = 0
    while index < len(data) - 1:
        lo, hi = data[index:index + 2]
        index += 2
        kind, delta = hi >> 2, lo + ((hi & 3) << 8)
        if kind == delta == 0:
            break
        if kind == 59:
            b = data[index:index + 4]
            index += 4
            skip = (b[0] << 16) + (b[1] << 24) + b[2] + (b[3] << 8)
            sample += skip if skip < 2 ** 31 else skip - 2 ** 32
        elif kind == 63:
            annotations[-1]["aux"] = data[index:index + delta].decode("latin1").strip("\0")
            index += delta + delta % 2
        elif kind == 60:
            number = delta if delta < 128 else delta - 256
            annotations[-1]["num"] = number
        elif kind == 61:
            annotations[-1]["subtype"] = delta if delta < 128 else delta - 256
        elif kind == 62:
            channel = delta
            annotations[-1]["channel"] = channel
        else:
            sample += delta
            annotations.append(dict(sample=sample, time=sample / fs,
                                    symbol=SYMBOLS.get(kind, str(kind)),
                                    channel=channel, num=number))
    return annotations


def decode_212(path: Path, count: int, definitions: list):
    assert all(x["format"] == "212" for x in definitions)
    raw = np.frombuffer(path.read_bytes(), dtype=np.uint8).reshape(-1, 3).astype(np.int32)
    digital = np.column_stack((raw[:, 0] + ((raw[:, 1] & 15) << 8),
                               raw[:, 2] + ((raw[:, 1] & 240) << 4)))
    digital[digital >= 2048] -= 4096
    assert digital.shape == (count, 2)
    checksums = ((digital.sum(axis=0) + 32768) % 65536 - 32768).tolist()
    assert checksums == [x["checksum"] for x in definitions]
    assert digital[0].tolist() == [x["initialValue"] for x in definitions]
    return digital, checksums


def rate_summary(anchors: list[float], source: str):
    if len(anchors) < 2:
        return dict(bpm=None, display="No organized ventricular rate", beatCount=0,
                    method="No discrete QRS sequence is assigned to ventricular fibrillation.",
                    annotationSource=source, status="not-applicable")
    rr = np.diff(anchors)
    bpm = float(60 / rr.mean())
    return dict(bpm=round(bpm, 3), display=f"≈{bpm:.0f} bpm", beatCount=len(anchors),
                rrMeanMs=round(float(rr.mean() * 1000), 3),
                rrMinMs=round(float(rr.min() * 1000), 3),
                rrMaxMs=round(float(rr.max() * 1000), 3),
                method="60 × (number of within-excerpt anchors − 1) / (last anchor − first anchor).",
                annotationSource=source,
                status="estimated-waveform-maxima" if "estimated" in source else "source-beat-markers")


def build_case(case: dict, source_dir: Path):
    db, rec = case["db"], case["record"]
    base = source_dir / db
    files = {ext: base / f"{rec}.{ext}" for ext in ["hea", "dat", "atr"]}
    official = {line.split()[1]: line.split()[0] for line in (base / "SHA256SUMS.txt").read_text().splitlines()}
    hashes = {ext: hashlib.sha256(path.read_bytes()).hexdigest() for ext, path in files.items()}
    for ext, digest in hashes.items():
        assert digest == official[f"{rec}.{ext}"], (rec, ext)
    fs, count, definitions, header_lines = read_header(files["hea"])
    digital, sums = decode_212(files["dat"], count, definitions)
    annotations = read_annotations(files["atr"], fs)
    start, end = case["start"] * fs, (case["start"] + 10) * fs
    rhythm_changes = [a for a in annotations if a.get("aux", "").startswith("(")]
    episode_index = max(i for i, a in enumerate(rhythm_changes) if a["sample"] <= start)
    episode = rhythm_changes[episode_index]
    episode_end = rhythm_changes[episode_index + 1]["sample"] if episode_index + 1 < len(rhythm_changes) else count
    assert episode["aux"] == case["code"] and episode_end >= end
    source_beats = [a for a in annotations if start <= a["sample"] < end and a["symbol"] in BEAT_SYMBOLS]
    excerpt_annotations = [dict(a, sourceSample=a["sample"], sample=a["sample"] - start,
                                time=(a["sample"] - start) / fs)
                           for a in annotations if start <= a["sample"] < end]
    anchors = [(a["sample"] - start) / fs for a in source_beats]
    if case["kind"] == "vt":
        anchors = [sample / fs for sample in VT_ANCHOR_SAMPLES]
    anchor_source = (f"{rec}.atr original source beat sample positions" if db == "mitdb"
                     else "visually reviewed estimated ECG2 maxima" if case["kind"] == "vt"
                     else "none; source has rhythm labels only")
    anchor_note = ("Original source beat annotations locate QRS events, not their exact onset or duration."
                   if db == "mitdb" else
                   "The source .atr contains rhythm labels only. Forty ECG2 maxima were estimated and visually reviewed in both channels for animation; these are not source-validated beat or QRS-onset annotations."
                   if case["kind"] == "vt" else
                   "The source .atr contains rhythm labels only. No QRS events or organized ventricular rate are inferred for fibrillation.")
    rhythm = dict(code=episode["aux"], sourceStartSample=episode["sample"],
                  sourceStartSeconds=episode["sample"] / fs,
                  sourceEndSample=episode_end, sourceEndSeconds=episode_end / fs,
                  coversEntireExcerpt=True)
    labels = [d["sourceLabel"] for d in definitions]
    leads = labels if len(set(labels)) == len(labels) else [f"ECG{i + 1}" for i in range(len(labels))]
    signals, calibration = {}, {}
    for index, (lead, definition) in enumerate(zip(leads, definitions)):
        samples = digital[start:end, index]
        voltage = (samples - definition["adcBaseline"]) / definition["adcGain"]
        values = np.round(voltage, 3).tolist()
        restored = np.rint(np.asarray(values) * definition["adcGain"] + definition["adcBaseline"]).astype(np.int32)
        assert np.array_equal(restored, samples)
        assert np.isfinite(voltage).all()
        signals[lead] = values
        calibration[lead] = dict(definition, sourceChannelIndex=index)
    src = f"https://physionet.org/content/{db}/1.0.0/"
    record_id = f"{db}-{rec}-{case['kind']}"
    rate = rate_summary(anchors, anchor_source)
    geometry_note = ("MLII is a modified ambulatory lead II; its exact electrode geometry is unavailable, so no standard lead-II axis is inferred. V1 retains its source label. Only the two original channels are provided."
                     if db == "mitdb" else
                     "Both original header channels are labeled ECG without electrode locations. ECG1 and ECG2 mean source channels 1 and 2, not standard ECG leads. Their 3D lead axes are unavailable; no standard leads are reconstructed.")
    notes = [case["caveat"], f"Ten seconds of original {fs} Hz source samples. Gain/baseline conversion to mV is the only signal transformation; no filtering, resampling, interpolation, normalization or missing-lead synthesis was applied.", geometry_note]
    timing_notes = [anchor_note,
                    "Atrial timing is not measured in these source files. The anatomical rhythm mechanism, regional activation, recovery, contraction strength and all cardiac motion are illustrative."]
    if anchors:
        timing_notes.append(f"The reference animation estimates QRS onset {case['offset'] * 1000:.0f} ms before each event anchor and uses a {case['qrs'] * 1000:.0f} ms QRS duration. Those are teaching values, not measured patient intervals.")
    if case["kind"] == "af-rvr":
        timing_notes.append("The AF diagnosis comes from the original AFIB interval. RVR is the website's description of the measured mean ventricular rate above 100 bpm; it is not an original additional annotation.")
    profile = dict(title=case["title"], summary=case["description"],
                   electrical=case["electrical"], mechanical=case["mechanical"],
                   observe=case["observe"], recommendedLead=case["lead"])
    teaching = dict(conditionId=case["kind"], rhythmKind=case["kind"], profile=profile,
                    ventricularAnchors=anchors, anchorOffset=case["offset"],
                    qrsDuration=case["qrs"], atrialOnsets=None, atrialTimingAvailable=False,
                    rhythmSegments=[dict(start=0, end=10, kind=case["kind"], sourceCode=case["code"])],
                    anchorLead=case["lead"], anchorUnits="seconds from excerpt start",
                    qrsAnchorSource=anchor_source, anchorStatus=anchor_note, notes=timing_notes,
                    mechanismModelNote="Recorded ECG signals are unchanged. The anatomy and all tissue activation, recovery and mechanics are schematic educational illustrations, not patient-specific reconstruction.")
    if db == "mitdb":
        teaching["ventricularSourceAnnotations"] = [a for a in excerpt_annotations if a["symbol"] in BEAT_SYMBOLS]
        context = [a for a in annotations if a["symbol"] in BEAT_SYMBOLS and start - fs <= a["sample"] < end + fs]
        teaching["contextVentricularAnchors"] = [(a["sample"] - start) / fs for a in context]
    record = dict(id=record_id, ecgId=rec, conditionId=case["kind"],
                  title=case["title"], description=case["description"],
                  tags=[case["code"].lstrip("("), "Real recording", "Tachyarrhythmia"],
                  synthetic=False, signalKind="recorded",
                  source=f"PhysioNet · {DATABASES[db]['name']} v1.0.0",
                  sourceLabel=f"{'MIT-BIH' if db == 'mitdb' else 'MIT-BIH VFDB'} {rec}",
                  sourceUrl=src, recordUrl=src + rec + ".hea",
                  annotationUrl=src + rec + ".atr", metadataUrl=src + rec + ".hea",
                  downloadUrl=f"https://physionet.org/files/{db}/1.0.0/{rec}.dat",
                  directoryUrl=("https://physionet.org/physiobank/database/html/mitdbdir/records.htm#" + rec if db == "mitdb" else src),
                  license="ODC-By 1.0", licenseUrl=f"https://physionet.org/content/{db}/view-license/1.0.0/",
                  attribution=DATABASES[db]["attribution"],
                  fs=fs, seconds=10, sampleCount=fs * 10, units="mV",
                  leadOrder=leads, recommendedLead=case["lead"], leadConfigurationNote=geometry_note,
                  sourceLeadLabels={lead: definitions[i]["sourceLabel"] for i, lead in enumerate(leads)},
                  sourceLabels=[dict(code=case["code"], description={"(AFIB":"Atrial fibrillation", "(AFL":"Atrial flutter", "(SVTA":"Supraventricular tachyarrhythmia", "(VT":"Ventricular tachycardia", "(VFIB":"Ventricular fibrillation"}[case["code"]], sourceUrl=src + rec + ".atr")],
                  sourceRhythm=rhythm, labelExplanation="Rhythm diagnosis is preserved from the source reference annotation. Added rate summaries and waveform appearance are identified separately; the website does not independently adjudicate a more specific arrhythmia mechanism.",
                  sourceValidationNote=("The MIT-BIH reference annotations were reviewed by two cardiologists, with disagreements resolved by consensus." if db == "mitdb" else "The source supplies reference rhythm-change annotations without beat labels. No independent rhythm adjudication was performed for this website."),
                  sourceSignalQuality=dict(processing="Native baseline drift and noise retained; no processing of displayed samples."),
                  coexistingFindings=[case["caveat"]], notes=notes,
                  calibration=calibration, recordSha256=hashes["dat"], checksumVerified=True,
                  sourceExcerpt=dict(startSample=start, endSampleExclusive=end,
                                     startSeconds=case["start"], endSeconds=case["start"] + 10,
                                     originalSampleCount=count, originalDurationSeconds=count / fs),
                  sourceAnnotations=excerpt_annotations, rateSummary=rate, teaching=teaching,
                  timingProvenance=dict(qrsAnchorSource=anchor_source,
                                        qrsOnsetSource="illustrative-offset" if anchors else "not-applicable-no-qrs",
                                        atrialTimingSource="unmeasured-illustrative-mechanism",
                                        mechanicsSource="illustrative", signalSource="recorded"),
                  signals=signals)
    provenance = dict(id=record_id, database=db, sourceRecord=rec,
                      sourceUrls={ext: f"https://physionet.org/files/{db}/1.0.0/{rec}.{ext}" for ext in files},
                      sourceSha256=hashes, officialSha256Verified=True,
                      fullRecordChecksums=sums, expectedChecksums=[x["checksum"] for x in definitions],
                      initialValuesVerified=True, sampleCountVerified=True,
                      inverseCalibrationExact=True, headerLines=header_lines,
                      excerpt=record["sourceExcerpt"], enclosingSourceRhythm=rhythm,
                      sourceBeatSymbolCounts={s: sum(a["symbol"] == s for a in source_beats) for s in sorted({a["symbol"] for a in source_beats})},
                      exportedChannelSamples=fs * 10 * len(leads), rateSummary=rate,
                      calibration=calibration, anchorStatus=anchor_note,
                      vtEstimatedAnchorSamples=VT_ANCHOR_SAMPLES if case["kind"] == "vt" else None)
    return record, provenance


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / "research-data/tachyarrhythmias")
    parser.add_argument("--output-dir", type=Path, default=ROOT / "dist/data")
    parser.add_argument("--download", action="store_true")
    args = parser.parse_args()
    if args.download:
        for db in DATABASES:
            names = {"SHA256SUMS.txt"} | {case["record"] + ext for case in CASES if case["db"] == db for ext in [".hea", ".dat", ".atr"]}
            directory = args.source_dir / db
            directory.mkdir(parents=True, exist_ok=True)
            for name in sorted(names):
                path = directory / name
                if not path.exists():
                    with urllib.request.urlopen(f"https://physionet.org/files/{db}/1.0.0/{name}", timeout=300) as response:
                        path.write_bytes(response.read())
    args.output_dir.mkdir(parents=True, exist_ok=True)
    records, provenance = [], []
    for case in CASES:
        record, details = build_case(case, args.source_dir)
        records.append(record)
        provenance.append(details)
    dataset = dict(title="Recorded tachyarrhythmia examples", count=len(records),
                   description="Five native two-channel excerpts from source-annotated AF, flutter, SVTA, VT and VF episodes. RVR and mean rates are calculated teaching descriptions. No Torsades label is inferred from VT or VF.",
                   source="PhysioNet · MIT-BIH Arrhythmia and Malignant Ventricular Ectopy databases",
                   license="ODC-By 1.0")
    (args.output_dir / "clinical-tachyarrhythmias.json").write_text(json.dumps(dict(dataset=dataset, records=records), ensure_ascii=False, separators=(",", ":")) + "\n")
    (args.output_dir / "clinical-tachyarrhythmias-provenance.json").write_text(json.dumps(dict(schemaVersion=1, records=provenance), ensure_ascii=False, indent=2) + "\n")
    print(json.dumps(dict(records=len(records), channelSamples=sum(p["exportedChannelSamples"] for p in provenance),
                          sourceSha256="passed", sourceChecksums="passed", inverseCalibration="exact")))


if __name__ == "__main__":
    main()
