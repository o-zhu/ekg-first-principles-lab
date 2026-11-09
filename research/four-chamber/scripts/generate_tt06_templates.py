#!/usr/bin/env python3
"""Condition published TT06 human ventricular cell variants at 1 Hz.

The generated CellML source is downloaded from the Physiome Model Repository
into an external cache and checksum verified. Its listed license is unspecified,
so this project distributes our solver wrapper and numerical output, not that
source code. No ionic conductance is fitted to an ECG by this script.
"""
from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import math
import os
from pathlib import Path
import time
import urllib.request

import numpy as np
from scipy.integrate import solve_ivp

ROOT = Path(__file__).resolve().parents[1]
SOURCES = {
    "endo": "bbef9e6aa2ba21bed0dbb6c40f263010c6afca5f3eaafd4bb6f6a0f49494c55c",
    "epi": "3d4cf86b4d1b7fd2410802ff63fc33a7fd63c4fb1cf594184675b562beb20781",
}
EXPOSURE = "https://models.cellml.org/e/80d"
CHANGESET = "de5a4e600b57c8b9b0bd477695648c82351bc6dd"


def get_model(variant: str, cache: Path):
    url = f"{EXPOSURE}/ten_tusscher_model_2006_{variant}.cellml/@@cellml_codegen/Python/raw"
    path = cache / f"tt06_{variant}_generated.py"
    cache.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        with urllib.request.urlopen(url, timeout=60) as response:
            path.write_bytes(response.read())
    digest = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest != SOURCES[variant]:
        raise ValueError(f"Source checksum mismatch for {variant}: {digest}")
    spec = importlib.util.spec_from_file_location(f"tt06_{variant}", path)
    model = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(model)
    # Exact scalar equivalents avoid NumPy scalar ufunc overhead in the ODE.
    model.exp = math.exp
    model.log = math.log
    model.power = pow
    model.floor = math.floor
    model.less = lambda a, b: a < b
    model.greater_equal = lambda a, b: a >= b
    model.less_equal = lambda a, b: a <= b
    model.custom_piecewise = lambda cases: next(
        cases[i + 1] for i in range(0, len(cases), 2) if cases[i]
    )
    return model, url, digest


def crossing(t: np.ndarray, v: np.ndarray, level: float, rising: bool) -> float:
    ids = np.flatnonzero(
        (v[:-1] < level) & (v[1:] >= level)
        if rising else (v[:-1] > level) & (v[1:] <= level)
    )
    if not len(ids):
        raise ValueError(f"Missing {'rise' if rising else 'fall'} crossing at {level}")
    i = int(ids[0] if rising else ids[-1])
    return float(t[i] + (level - v[i]) * (t[i + 1] - t[i]) / (v[i + 1] - v[i]))


def simulate(variant: str, cache: Path, beats: int, output: Path) -> dict:
    model, url, digest = get_model(variant, cache)
    initial, constants = model.initConsts()
    constants = np.array(constants, dtype=float)
    y = np.array(initial, dtype=float)
    last = None
    history = []
    t_grid = np.arange(0.0, 1000.0 + 0.125, 0.25)
    started = time.monotonic()
    for beat in range(1, beats + 1):
        states_start = y.copy()
        samples = np.empty((len(y), len(t_grid)))
        segments = [(0.0, 10.0, 0.0), (10.0, 11.0, -52.0), (11.0, 1000.0, 0.0)]
        for a, b, stimulus in segments:
            c = constants.copy()
            # Keep a fixed stimulus within each integration segment. Its physical
            # duration, amplitude, and potassium balance remain as published.
            c[5], c[7], c[8] = -1.0, 1002.0, stimulus
            sol = solve_ivp(
                lambda t, state: model.computeRates(t, state, c),
                (a, b), y, method="BDF", rtol=2e-8, atol=2e-10,
                max_step=5.0, dense_output=True,
            )
            if not sol.success:
                raise RuntimeError(sol.message)
            mask = (t_grid >= a) & ((t_grid < b) if b < 1000 else (t_grid <= b))
            samples[:, mask] = sol.sol(t_grid[mask])
            y = sol.y[:, -1]
        delta = None if last is None else float(np.max(np.abs(samples[0] - last)))
        state_relative = float(np.max(np.abs(y - states_start) / np.maximum(np.abs(y), 1e-6)))
        history.append({"beat": beat, "previousBeatMaxVoltageDifferenceMv": delta,
                        "cycleBoundaryMaxRelativeStateChange": state_relative})
        if beat % 10 == 0 or beat == beats:
            print(variant, beat, "beats; max voltage change", delta,
                  "mV; boundary state relative change", state_relative, flush=True)
        previous = last
        last = samples[0].copy()
    voltage = samples[0]
    rest = float(samples[0, 0])
    peak = float(voltage.max())
    q = (voltage - rest) / (peak - rest)
    # Derivative timing from the ODE and dense interpolation of its final beat;
    # 0.25-ms output samples themselves do not define the intrinsic dV/dt max.
    probe_t = np.arange(10.0, 16.0 + 0.005, 0.01)
    # Reintegrate only the final beat from its saved start to sample the rise.
    yp = states_start.copy()
    rise_parts = []
    for a, b, stimulus in [(0., 10., 0.), (10., 11., -52.), (11., 16., 0.)]:
        c = constants.copy(); c[5], c[7], c[8] = -1., 1002., stimulus
        sol = solve_ivp(lambda t, state: model.computeRates(t, state, c),
                        (a, b), yp, method="BDF", rtol=2e-8, atol=2e-10,
                        max_step=.02 if a >= 10 else 5., dense_output=True)
        if not sol.success:
            raise RuntimeError(sol.message)
        mask = (probe_t >= a) & (probe_t <= b)
        tt = probe_t[mask]; yy = sol.sol(tt)
        rates = np.array([model.computeRates(float(t), yy[:,i], c)[0] for i,t in enumerate(tt)])
        rise_parts.append((tt, yy[0], rates))
        yp = sol.y[:,-1]
    rt = np.concatenate([x[0] for x in rise_parts])
    rv = np.concatenate([x[1] for x in rise_parts])
    rd = np.concatenate([x[2] for x in rise_parts])
    activation = float(rt[np.argmax(rd)])
    rise10 = crossing(rt, rv, rest + .1*(peak-rest), True)
    rise90 = crossing(rt, rv, rest + .9*(peak-rest), True)
    recovery = {str(p): crossing(t_grid, q, 1-p/100, False) - activation for p in (30,50,70,90)}
    result = {
        "schemaVersion": 1,
        "title": f"ten Tusscher–Panfilov 2006 human ventricular {variant} model; beat {beats} at 1 Hz",
        "variant": variant,
        "source": {"paperDoi":"10.1152/ajpheart.00109.2006", "pubmed":"16565318",
                   "exposure":EXPOSURE,"changeset":CHANGESET,"generatedPythonUrl":url,
                   "generatedPythonSha256":digest,"sourceLicense":"Unspecified in PMR exposure; source not redistributed."},
        "protocol": {"temperatureK":float(constants[1]),"cycleLengthMs":1000.,
                     "stimulusStartMs":10.,"stimulusDurationMs":1.,"stimulusAmplitudePAperPF":-52.,
                     "conditioningBeats":beats,"ionicParameterChanges":[],
                     "solver":"SciPy solve_ivp BDF, segmented at stimulus boundaries",
                     "rtol":2e-8,"atol":2e-10,"maxStepMs":5.0,
                     "upstrokeDiagnosticDtMs":.01},
        "dtMs":.25,"activationMs":activation,"apd90Ms":recovery['90'],
        "restMv":rest,"peakMv":peak,"apdMs":recovery,
        "upstroke10to90Ms":rise90-rise10,"maxUpstrokeMvPerMs":float(rd.max()),
        "normalized":np.round(q,9).tolist(),"voltageMv":np.round(voltage,8).tolist(),
        "conditioning": {"lastBeatMaxVoltageDifferenceMv":history[-1]['previousBeatMaxVoltageDifferenceMv'],
                         "lastCycleBoundaryMaxRelativeStateChange":history[-1]['cycleBoundaryMaxRelativeStateChange'],
                         "history":history,"claim":"Finite conditioning run; no assertion of exact ionic steady state."},
        "initialStates":initial,"finalBeatInitialStates":states_start.tolist(),"finalStates":y.tolist(),
        "constants":constants.tolist(),
        "limitations":["Published ionic model output, not a recording from this heart or the ECG reference person.",
                       "No optical donor data or reference ECG is used to fit these ionic equations.",
                       "Duration scaling or upstroke replacement by a downstream tissue model must be disclosed separately."],
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(result, separators=(",",":")))
    print(variant, "complete", {"seconds":round(time.monotonic()-started,2),"APD90ms":recovery['90'],
                                "rise10to90Ms":rise90-rise10,"maxdVdt":float(rd.max())},flush=True)
    return result


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--variant", choices=list(SOURCES), default="endo")
    parser.add_argument("--beats", type=int, default=100)
    parser.add_argument("--cache-dir", type=Path, default=Path(os.environ.get("TMPDIR", "/tmp"))/"cardiac-tt06-source")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    simulate(args.variant,args.cache_dir,args.beats,args.output or ROOT/"data-source"/"four-chamber"/f"tt06-{args.variant}-template.json")
