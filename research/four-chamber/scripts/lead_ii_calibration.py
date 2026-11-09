#!/usr/bin/env python3
"""Small, side-effect-free utilities for the explicitly calibrated ECG scenario.

These utilities operate upstream of the ECG: activation, AP duration, published
membrane templates, and source integration. They do not filter or synthesize an
ECG waveform. The histogram integrator is a search surrogate; final model data
are evaluated against the full source field and an independent numerical audit.
"""
from pathlib import Path
import json
import numpy as np
from scipy.signal import fftconvolve


def ventricular_durations(rho, z, chamber, ventricular_count, parameters):
    """Native-node APD90 field, centered on the ventricular median."""
    contrast = (parameters['transmuralContrastMs'] * (0.5 - np.asarray(rho))
                + parameters['apicobasalContrastMs'] * (np.asarray(z) - 0.5)
                + parameters['rvOffsetMs'] * (np.asarray(chamber) == 2))
    contrast -= np.median(contrast[:ventricular_count])
    return parameters['medianMs'] + contrast


def ionic_template(source_path):
    """Published ionic AP, retaining its native voltage scale and rapid rise.

    Only tiny preactivation/resting drift is clamped and the final baseline
    tapered at 800–900 ms of cell age. No active AP smoothing is applied.
    """
    source = json.loads(Path(source_path).read_text())
    q = np.clip(np.asarray(source['normalized'], float), 0, 1)
    age = np.arange(len(q)) * source['dtMs'] - source['activationMs']
    q[age < -3] = 0
    q *= np.clip((900 - age) / 100, 0, 1)
    return {
        'normalized': q.tolist(), 'dtMs': source['dtMs'],
        'activationMs': source['activationMs'], 'apd90Ms': source['apd90Ms'],
        'warpAnchorMs': 4.0, 'restMv': source['restMv'],
        'peakMv': source['peakMv'],
        'provenance': source['title'] + '; native voltage scale and upstroke; '
          'post-4-ms time axis scaled to the separately assigned local APD90. '
          'Not a measured AP recording. Tiny baseline drift clamped/tapered.',
        'source': source['source'],
        'conditioning': {k: v for k, v in source['conditioning'].items()
                         if k != 'history'},
        'nativeUpstroke10to90Ms': source['upstroke10to90Ms'],
    }


def normalized_at_age(age, durations, template):
    """Evaluate prescribed local membrane AP with its upstroke left unwarped."""
    age = np.asarray(age)
    anchor = template['warpAnchorMs']
    warped = np.where(age <= anchor, age, anchor + (age - anchor) *
                      (template['apd90Ms'] - anchor) / (np.asarray(durations) - anchor))
    return np.interp((warped + template['activationMs']) / template['dtMs'],
                     np.arange(len(template['normalized'])),
                     template['normalized'], left=0, right=0)


def histogram_source_ecg(activation, durations, weights, template,
                         output_times=None, activation_bin_ms=0.25,
                         duration_bin_ms=1.0):
    """Bilinear AT/APD histogram and AP convolution for one lead.

    Every source site's signed physical forward weight is deposited into four
    neighboring AT/APD bins. This is neither spatial source subsampling nor an
    output-waveform filter. The controlled approximation is explicitly tested
    against direct all-site Vm-weight products before a candidate is accepted.
    """
    if output_times is None:
        output_times = np.arange(1001.)
    output_times = np.asarray(output_times, float)
    dt = float(activation_bin_ms)
    db = float(duration_bin_ms)
    ntime = int(np.ceil(output_times.max() / dt)) + 1
    ad = np.asarray(durations) / db
    d0 = np.floor(ad).astype(int)
    df = ad - d0
    low, high = int(d0.min()), int(d0.max()) + 1
    count = high - low + 1
    at = np.asarray(activation) / dt
    i0 = np.floor(at).astype(int)
    fraction = at - i0
    if i0.min() < 0 or i0.max() + 1 >= ntime:
        raise ValueError('Activation outside histogram time domain')
    bins = np.zeros((count, ntime))
    for di, dw in [(0, 1-df), (1, df)]:
        for ti, tw in [(0, 1-fraction), (1, fraction)]:
            index = (d0 + di - low) * ntime + i0 + ti
            bins += np.bincount(index, weights=np.asarray(weights)*dw*tw,
                                minlength=count*ntime).reshape(count, ntime)
    pre = 10.0
    ages = np.arange(-pre, 1000 + dt/2, dt)
    kernels = np.asarray([normalized_at_age(ages, k*db, template)
                          for k in range(low, high+1)])
    voltage = fftconvolve(bins, kernels, axes=1).sum(axis=0)
    offset = round(pre / dt)
    voltage = voltage[offset:offset+ntime]
    voltage *= template['peakMv'] - template['restMv']
    # Each connected tissue's constant-rest source integral is zero. This
    # assumption is separately checked on the assembled physical operator.
    return np.interp(output_times, np.arange(ntime)*dt, voltage)


def comparison_metrics(candidate, reference, windows=None):
    """Fixed-clock, raw-mV errors; never amplitude-normalize a comparison."""
    if windows is None:
        windows = {'wholeBeat': (0, 700), 'P': (10, 180),
                   'QRS': (185, 310), 'ST_T': (310, 700)}
    candidate, reference = np.asarray(candidate), np.asarray(reference)
    out = {}
    for name, (start, end) in windows.items():
        e = candidate[start:end] - reference[start:end]
        out[name] = {'startMs': start, 'endExclusiveMs': end,
                     'rmseMv': float(np.sqrt(np.mean(e*e))),
                     'maxAbsoluteErrorMv': float(np.max(np.abs(e)))}
    return out
