// Educational comparisons, not a patient-response or diagnostic model.
// Nernst and the stated fixed-permeability resting approximation are calculated.
// AP/ECG geometry is chosen to explain mechanisms; it is not fitted to serum data.
const R = 8.314462618, T = 310.15, F = 96485.33212;
const RT_OVER_F_MV = 1000 * R * T / F;
const clamp = (v, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
const smooth = v => { const u = clamp(v); return u * u * (3 - 2 * u); };
const blend = (a, b, u) => a + (b - a) * smooth(u);
const gaussian = (t, center, width) => Math.exp(-0.5 * ((t - center) / width) ** 2);
const mv = v => `${v < 0 ? '−' : '+'}${Math.abs(v).toFixed(1)} mV`;

export const ELECTROLYTES = [
  {
    id: 'potassium', name: 'Potassium', symbol: 'K⁺',
    concentrationLabel: 'Extracellular K⁺', unit: 'mmol/L',
    min: 2, max: 9, step: 0.1, decimals: 1, baseline: 4,
    referenceLabel: 'Example lab interval: 3.6–5.2 mmol/L · ranges vary by laboratory',
    reference: [3.6, 5.2],
    presets: [{label: 'Low', value: 2.5}, {label: 'Baseline', value: 4}, {label: 'High', value: 6.5}, {label: 'Very high', value: 8.5}]
  },
  {
    id: 'calcium', name: 'Calcium', symbol: 'Ca²⁺',
    concentrationLabel: 'Ionized extracellular Ca²⁺', unit: 'mmol/L',
    min: 0.7, max: 1.8, step: 0.05, decimals: 2, baseline: 1.2,
    referenceLabel: 'Example adult lab interval: ≈1.14–1.35 mmol/L · ionized, not total calcium',
    reference: [1.14, 1.35],
    presets: [{label: 'Low', value: 0.8}, {label: 'Baseline', value: 1.2}, {label: 'High', value: 1.6}]
  },
  {
    id: 'magnesium', name: 'Magnesium', symbol: 'Mg²⁺',
    concentrationLabel: 'Serum total Mg²⁺', unit: 'mmol/L',
    min: 0.3, max: 3, step: 0.05, decimals: 2, baseline: 0.85,
    referenceLabel: 'Example adult lab interval: ≈0.70–0.95 mmol/L · serum total magnesium',
    reference: [0.7, 0.95],
    presets: [{label: 'Low', value: 0.45}, {label: 'Baseline', value: 0.85}, {label: 'High', value: 2.5}]
  }
];

const SOURCES = {
  potassium: [
    {title: 'Miura et al. · K⁺ activity, equilibrium and membrane potentials (1977)', url: 'https://pubmed.ncbi.nlm.nih.gov/853287/', type: 'Microelectrode recordings · canine Purkinje fibers'},
    {title: 'King et al. · The biphasic potassium–conduction relationship (2021)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7940307/', type: 'Optical mapping · guinea-pig hearts'},
    {title: 'Pezhouman et al. · Mechanisms of hypokalemic arrhythmia (2015)', url: 'https://pubmed.ncbi.nlm.nih.gov/26269574/', type: 'Animal experiments, patch clamp and computational modeling'},
    {title: 'Montague et al. · Why serum potassium does not predict a fixed ECG (2008)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC2390954/', type: 'Human observational cohort'},
    {title: 'Mayo Clinic Laboratories · Potassium reference interval', url: 'https://www.mayocliniclabs.com/test-catalog/overview/602352', type: 'Laboratory reference'}
  ],
  calcium: [
    {title: 'Grandi et al. · Extracellular calcium and action-potential duration (2009)', url: 'https://pubmed.ncbi.nlm.nih.gov/19121322/', type: 'Human ventricular computational model'},
    {title: 'Kazama · High calcium, cellular voltage and ECG changes (2017)', url: 'https://pubmed.ncbi.nlm.nih.gov/27773880/', type: 'Paired action-potential and ECG recordings · frog heart'},
    {title: 'Mayo Clinic Laboratories · Ionized calcium reference interval', url: 'https://www.mayocliniclabs.com/test-catalog/overview/8378', type: 'Laboratory reference · adult values converted to mmol/L'}
  ],
  magnesium: [
    {title: 'Yang et al. · ECG findings in isolated hypomagnesemia (2021)', url: 'https://pmc.ncbi.nlm.nih.gov/articles/PMC7873644/', type: 'Human within-patient observational study'},
    {title: 'Rasmussen & Thomsen · Magnesium and human cardiac conduction (1989)', url: 'https://pubmed.ncbi.nlm.nih.gov/2653679/', type: 'Human electrophysiology study'},
    {title: 'Davidenko et al. · Magnesium and afterdepolarizations in prolonged action potentials (1989)', url: 'https://pubmed.ncbi.nlm.nih.gov/2917391/', type: 'Microelectrode experiments · quinidine-exposed canine Purkinje fibers'},
    {title: 'Mayo Clinic Laboratories · Magnesium reference interval', url: 'https://www.mayocliniclabs.com/test-catalog/Overview/8448', type: 'Laboratory reference · adult values converted to mmol/L'}
  ]
};

export function nernstPotential(outside, inside, valence = 1) {
  if (!(outside > 0 && inside > 0) || !Number.isFinite(outside + inside + valence) || valence === 0) {
    throw new RangeError('Nernst concentrations must be positive and valence finite and nonzero.');
  }
  return RT_OVER_F_MV / valence * Math.log(outside / inside);
}

export function restingPotential(potassium) {
  // Two-cation GHK approximation. Na_o=140, Na_i=10, K_i=140 mmol/L;
  // P_Na/P_K=0.01. Chloride, electrogenic pumps and changing permeability omitted.
  if (!(potassium > 0) || !Number.isFinite(potassium)) throw new RangeError('Positive K⁺ required.');
  return RT_OVER_F_MV * Math.log((potassium + 0.01 * 140) / (140 + 0.01 * 10));
}

function shapeParameters(id, value, vulnerable = false) {
  const p = {
    rest: restingPotential(4), onset: 200, rise: 3, peak: 31, plateau: 12,
    duration: vulnerable ? 420 : 300, ead: 0, qrsScale: 1,
    pAmplitude: 0.14, pWidth: 18, tAmplitude: 0.31, tWidth: 40, uAmplitude: 0, delay: 0
  };
  if (id === 'potassium') {
    const low = clamp((4 - value) / 2), high = clamp((value - 4) / 5);
    // These smooth shape weights are graphic choices, not clinical thresholds.
    const depression = smooth((value - 5.5) / 3.5);
    p.rest = restingPotential(value);
    p.rise += 22 * depression;
    p.peak -= 21 * depression;
    p.plateau -= 4 * depression;
    p.duration += 130 * low - 78 * high + 28 * depression;
    p.qrsScale += 1.35 * depression;
    p.delay = 30 * depression;
    p.onset += p.delay;
    p.pAmplitude *= 1 - 0.85 * depression;
    p.tAmplitude += 0.5 * high - 0.25 * low;
    p.tWidth *= 1 - 0.55 * high;
    p.uAmplitude = 0.22 * low;
  } else if (id === 'calcium') {
    const low = clamp((1.2 - value) / 0.5), high = clamp((value - 1.2) / 0.6);
    p.duration += 145 * low - 100 * high;
    p.plateau += 2 * high - 3 * low;
  } else if (id === 'magnesium') {
    const low = clamp((0.85 - value) / 0.55), high = clamp((value - 0.85) / 2.15);
    // No universal isolated-low-Mg voltage curve is asserted. The EAD is opt-in.
    p.ead = vulnerable ? 38 * low : 0;
    // Conduction timing, predominantly AV delay, is the high-Mg illustration.
    p.delay = 85 * high;
    p.onset += p.delay;
    p.qrsScale += 0.27 * high;
    p.pWidth += 7 * high;
  }
  return p;
}

const COMMON_NOTES = [
  'Change one electrolyte at a time. Temperature, heart rate, other electrolytes, pH and medicines are held fixed or omitted. Blood concentrations do not uniquely determine cellular or ECG effects.',
  'Nernst uses E = RT/(zF) × ln(outside/inside) at 37 °C, treating concentration as activity. It is an ion equilibrium voltage, not a measured resting voltage or action-potential peak.',
  'Smooth AP and ECG shapes are hand-specified teaching illustrations. Their times, amplitudes and concentration-response relationships are not clinical predictions or fits to patients.',
  'The ECG is drawn independently of the single-cell trace. A real lead sums spatially distributed tissue currents. ECG amplitude is in arbitrary units, with the same scale for both curves.'
];

export function getElectrolyteModel(id, input, {vulnerable = false} = {}) {
  const meta = ELECTROLYTES.find(e => e.id === id);
  if (!meta) throw new RangeError('Unknown electrolyte.');
  const value = clamp(Number.isFinite(Number(input)) ? Number(input) : meta.baseline, meta.min, meta.max);
  const isBaseline = Math.abs(value - meta.baseline) < 1e-8;
  const low = value < meta.reference[0], high = value > meta.reference[1];
  const context = id === 'magnesium' && Boolean(vulnerable);
  const current = shapeParameters(id, value, context), reference = shapeParameters(id, meta.baseline, context);
  const names = {
    potassium: ['Hypokalemia', 'Hyperkalemia'],
    calcium: ['Hypocalcemia', 'Hypercalcemia'],
    magnesium: ['Hypomagnesemia', 'Hypermagnesemia']
  };
  const result = {
    id, value, baseline: meta.baseline, vulnerable: context, current, reference,
    condition: isBaseline ? 'Baseline comparison' : low ? names[id][0] : high ? names[id][1] : 'Within example reference interval',
    headline: '', summary: '', steps: [], metrics: [], gradient: null,
    ecgSummary: '', variability: 'These are representative patterns, not diagnostic thresholds or an obligatory sequence.',
    apNote: 'One ventricular working myocyte. Concentration changes are mapped to illustrative AP shapes.',
    ecgNote: 'A separate teaching sketch of a surface lead, not an ECG computed from the displayed cell.',
    contextNote: '', sources: SOURCES[id], modelNotes: [...COMMON_NOTES]
  };
  // An EAD requires an actual upward voltage deflection during recovery.
  // Smaller graphic perturbations only slow recovery and must be labelled so.
  result.showsEad = false;
  if (current.ead > 0) {
    for (let t = Math.ceil(current.onset + current.duration * 0.64); t < current.onset + current.duration; t++) {
      if (apVoltage(result, t + 1) > apVoltage(result, t) + 0.001) { result.showsEad = true; break; }
    }
  }

  if (id === 'potassium') {
    result.gradient = {
      outside: value, inside: 140, insideLabel: 'Intracellular K⁺ fixed at 140 mmol/L', ion: 'K⁺',
      equilibriumLabel: 'Calculated K⁺ equilibrium potential · Eₖ',
      baselinePotential: nernstPotential(4, 140), currentPotential: nernstPotential(value, 140),
      detail: 'Eₖ = 61.5 × log₁₀([K⁺]outside / [K⁺]inside) mV at 37 °C. More K⁺ outside makes Eₖ less negative.'
    };
    result.headline = low ? 'A more negative Eₖ can still mean unstable recovery.' : high ? 'Depolarized at rest. Fewer channels ready to fire.' : 'Potassium sets much of the resting voltage.';
    result.summary = low
      ? 'Low K⁺ changes both the concentration gradient and the currents that restore the membrane after a beat.'
      : high ? 'Raising extracellular K⁺ shifts the resting voltage upward. As sustained depolarization grows, fast Na⁺ channels become less available.'
        : 'Move K⁺ above or below baseline to separate its effect on resting voltage from its effects on excitation and recovery.';
    result.steps = low ? [
      {title: 'A steeper K⁺ gradient', body: 'Eₖ becomes more negative. The fixed-permeability resting model moves downward with it.'},
      {title: 'Outward currents also change', body: 'Low extracellular K⁺ can reduce repolarizing K⁺ currents and Na⁺/K⁺-pump activity; the gradient alone does not describe the cell.'},
      {title: 'Recovery becomes less stable', body: 'Repolarization can lengthen, while Na⁺/Ca²⁺ loading and afterdepolarizations increase arrhythmia susceptibility.'}
    ] : [
      {title: 'The K⁺ gradient shrinks', body: 'More K⁺ outside makes its equilibrium voltage less negative, moving the resting membrane toward depolarization.'},
      {title: 'Excitability changes in two directions', body: 'A modest shift can initially facilitate excitation. Greater sustained depolarization reduces fast Na⁺-channel availability.'},
      {title: 'Upstroke and recovery change', body: 'Reduced available Na⁺ current slows the upstroke. Altered K⁺ currents can accelerate early recovery; marked disturbance can depress conduction.'}
    ];
    result.ecgSummary = low
      ? 'Possible flatter T waves, more visible U waves and delayed recovery. T–U merging may look like a long QT even when the measured interval is really QU.'
      : high ? 'Possible taller, narrower T waves; with marked disturbance, smaller P waves and a broader QRS. Drag toward “Very high” to inspect this representative contrast.'
        : 'Baseline P–QRS–T morphology is shown for comparison. Small changes within a reference interval need not cause visible ECG abnormalities.';
    result.variability = 'Hyperkalemia can be dangerous without classic ECG changes. Waveforms and their order vary with the rate of change, other ions, pH, medicines and underlying disease.';
    result.metrics = [
      {label: 'Model resting voltage', value: mv(current.rest), baseline: mv(reference.rest), detail: 'Calculated fixed-permeability approximation; not a measured patient value.'},
      {label: 'Fast Na⁺ upstroke', value: current.rise > 10 ? 'Slower / smaller' : 'Largely preserved', baseline: 'Rapid upstroke', detail: 'The shape illustrates voltage-dependent availability, not a measured channel percentage.'},
      {label: 'Ventricular recovery', value: low ? 'Can be prolonged' : high ? 'Earlier in this example' : 'Near baseline', baseline: 'Reference recovery', detail: 'Outward currents, pump activity and tissue heterogeneity also matter.'}
    ];
    result.apNote = 'Rest shifts with the stated two-ion Goldman approximation. The slower upstroke and changing recovery are qualitative additions, not outputs of a full channel simulation.';
    result.modelNotes.push('Resting approximation: V = RT/F × ln(([K⁺]o + 0.01[Na⁺]o)/([K⁺]i + 0.01[Na⁺]i)); [K⁺]i = 140, [Na⁺]o = 140 and [Na⁺]i = 10 mmol/L. Permeabilities are fixed. Chloride and electrogenic pumps are omitted.');
    result.modelNotes.push('The resting approximation becomes particularly incomplete at very low K⁺, when K⁺ permeability and pump activity change. Hyperpolarization is not a statement that the cell is electrically safe.');
    result.modelNotes.push('Animal experiments support a biphasic potassium–conduction response, but their concentrations do not establish human ECG stages. This sketch shows a conducted beat; severe conduction failure and arrest are not simulated.');
  } else if (id === 'calcium') {
    result.gradient = {
      outside: value, inside: 0.0001, insideLabel: 'Resting free intracellular Ca²⁺ fixed at 0.0001 mmol/L (100 nM)', ion: 'Ca²⁺',
      equilibriumLabel: 'Calculated resting Ca²⁺ equilibrium potential · E_Ca',
      baselinePotential: nernstPotential(1.2, 0.0001, 2), currentPotential: nernstPotential(value, 0.0001, 2),
      detail: 'E_Ca = 30.8 × log₁₀([Ca²⁺]outside / [Ca²⁺]inside) mV. This is not the cell’s resting voltage; intracellular Ca²⁺ changes during a beat.'
    };
    result.headline = low ? 'Less calcium. A longer plateau.' : high ? 'More calcium can shorten the plateau.' : 'Calcium helps shape the plateau, not just its voltage.';
    result.summary = low
      ? 'A smaller Ca²⁺ gradient does not automatically shorten the action potential. Calcium also controls how its own channels turn off.'
      : high ? 'Calcium-dependent channel inactivation helps terminate inward current earlier, shortening recovery in this example.'
        : 'Compare low and high ionized Ca²⁺ while resting K⁺ and the ventricular Na⁺ upstroke remain fixed.';
    result.steps = [
      {title: 'Start with free calcium', body: 'The control is ionized extracellular Ca²⁺. Total serum calcium includes protein-bound calcium and is a different measurement.'},
      {title: 'Channel kinetics matter', body: 'Lower Ca²⁺ can weaken calcium-dependent inactivation of L-type channels. Higher Ca²⁺ can strengthen it; an equilibrium voltage alone cannot set AP duration.'},
      {title: 'Follow the plateau', body: low ? 'The illustrative plateau persists longer, delaying ventricular recovery.' : high ? 'The illustrative plateau ends earlier, bringing ventricular recovery forward.' : 'The baseline balances inward Ca²⁺ current with outward repolarizing currents.'}
    ];
    result.ecgSummary = low ? 'A longer ST segment and QT are representative of hypocalcemia.' : high ? 'A shorter ST segment and QT are representative of hypercalcemia.' : 'The reference QT reflects the time from ventricular depolarization through recovery.';
    result.metrics = [
      {label: 'Resting voltage', value: 'Held near baseline', baseline: mv(reference.rest), detail: 'K⁺ and the resting conductances are fixed in this comparison.'},
      {label: 'Ventricular plateau', value: low ? 'Longer' : high ? 'Shorter' : 'Near baseline', baseline: 'Reference plateau', detail: 'A qualitative illustration of calcium-dependent current kinetics.'},
      {label: 'ST / QT pattern', value: low ? 'Can lengthen' : high ? 'Can shorten' : 'Near baseline', baseline: 'Reference recovery', detail: 'No patient QT or QTc is calculated from this concentration.'}
    ];
    result.apNote = 'The plateau changes while resting voltage and the Na⁺-dependent upstroke are held fixed. The direction is evidence-based; the size of the change is illustrative.';
    result.modelNotes.push('Free intracellular Ca²⁺ is held at 100 nM only for the resting Nernst comparison. A real calcium transient changes E_Ca during a beat; the AP is not calculated from this fixed E_Ca.');
    result.modelNotes.push('The adult example interval converts Mayo values for ages 24–97 years, 4.57–5.43 mg/dL, using 1 mmol/L Ca = 4.0078 mg/dL. Ionized calcium also depends on pH.');
  } else {
    result.headline = low ? 'Magnesium changes stability more than resting voltage.' : high ? 'Magnesium excess can slow the path to the ventricle.' : 'An indirect influence on excitability and recovery.';
    result.summary = low ? 'Low magnesium can alter repolarization and often accompanies other electrolyte disturbances. There is no single obligatory ECG shape.'
      : high ? 'Human electrophysiology studies support slower atrial and AV conduction. Here the ventricular beat arrives later, while its cell-voltage shape is mostly preserved.'
        : 'Magnesium supports transport and channel regulation. It is not treated as the dominant ion setting resting membrane voltage.';
    result.steps = [
      {title: 'Support transport and signaling', body: 'Mg²⁺ participates in ATP-dependent transport and modulates ion-channel behavior. Serum total Mg²⁺ is not the same as intracellular free Mg²⁺.'},
      {title: low ? 'Consider the surrounding conditions' : high ? 'Follow the conduction delay' : 'Keep context visible', body: low ? 'Deficiency can coexist with low K⁺ or Ca²⁺. Medicines and pre-existing prolonged recovery influence arrhythmia susceptibility.' : high ? 'Raised Mg²⁺ can prolong atrial and AV nodal conduction; more marked excess can depress excitability further.' : 'The same serum value can have different effects in different electrical and biochemical settings.'},
      {title: context && low ? 'Inspect a depolarizing tendency' : 'Separate risk from a fixed waveform', body: context && low ? 'A stronger perturbation can produce an upward bump: an early afterdepolarization in an already-vulnerable cell. It does not guarantee a triggered beat or torsades.' : 'Isolated low Mg²⁺ can have subtle ECG effects. Overlapping cell traces are intentional; use the optional vulnerable example to explore unstable recovery.'}
    ];
    result.contextNote = 'No Mg²⁺ Nernst or serum-to-resting-voltage curve is shown. This section focuses on transport, repolarization context and conduction.';
    result.ecgSummary = high ? 'The illustrative P-to-QRS delay grows, with modest QRS broadening. These are representative conduction effects, not concentration-specific interval predictions.' : low ? 'Isolated deficiency may produce subtle repolarization changes. This example does not force QT prolongation or generate torsades from a serum value.' : 'The baseline ECG remains a reference for changes in AV timing and the surrounding repolarization context.';
    result.metrics = [
      {label: 'Resting voltage', value: 'Held near baseline', baseline: mv(reference.rest), detail: 'No direct Mg²⁺ equilibrium-voltage model is assumed.'},
      {label: 'AV conduction', value: high ? 'Can be slower' : 'No fixed change shown', baseline: 'Reference timing', detail: 'High Mg²⁺ is illustrated primarily as increased delay before ventricular activation.'},
      {label: 'Recovery context', value: context ? 'Vulnerable example' : 'Isolated comparison', baseline: context ? 'Already prolonged' : 'Reference recovery', detail: context ? 'Both traces share a prolonged baseline; low Mg adds a conditional cellular bump.' : 'An overlapping AP is intentional, not evidence of absent arrhythmia risk.'}
    ];
    result.apNote = context
      ? result.showsEad
        ? 'Both traces start from an already-prolonged AP. The added depolarizing tendency produces a schematic early afterdepolarization here; no probability is implied.'
        : current.ead > 0
          ? 'Both traces start from an already-prolonged AP. At this setting the added depolarizing tendency slows recovery without a true upward afterdepolarization.'
          : 'Both traces share an already-prolonged AP. Lower Mg²⁺ to explore a conditional depolarizing tendency; no probability or automatic arrhythmia is implied.'
      : 'Low Mg²⁺ does not force a specific ventricular AP change here. At high Mg²⁺, the trace shifts later with the illustrated AV delay; its shape is preserved.';
    result.ecgNote = context ? 'The cellular perturbation is not converted into an extra ECG beat. This independent ECG sketch retains the shared prolonged-repolarization context.' : result.ecgNote;
    result.modelNotes.push('The optional early-afterdepolarization example is a mechanistic drawing, not a finding measured at the selected Mg²⁺ value. It adds neither automatic torsades nor an automatic extra QRS.');
    result.modelNotes.push('In the isolated-hypomagnesemia study, mean QTc differed only modestly and several other ECG measures did not differ significantly. The absence of a large modeled waveform change does not establish low clinical risk.');
    result.modelNotes.push('The adult example interval converts Mayo values of 1.7–2.3 mg/dL using 1 mmol/L Mg = 2.4305 mg/dL. Serum total magnesium is not used as a free-ion concentration in Nernst.');
  }
  return result;
}

export function apVoltage(model, t, reference = false) {
  const p = reference ? model.reference : model.current;
  const u = t - p.onset;
  const notchEnd = p.rise + 12, plateauEnd = p.duration * 0.64;
  let v;
  if (u < 0 || u >= p.duration) v = p.rest;
  else if (u < p.rise) v = blend(p.rest, p.peak, u / p.rise);
  else if (u < notchEnd) v = blend(p.peak, p.plateau, (u - p.rise) / 12);
  else if (u < plateauEnd) v = p.plateau - (p.plateau + 3) * (u - notchEnd) / (plateauEnd - notchEnd);
  else v = blend(-3, p.rest, (u - plateauEnd) / (p.duration - plateauEnd));
  if (p.ead && u > plateauEnd && u < p.duration) {
    const taper = Math.sin(Math.PI * (u - plateauEnd) / (p.duration - plateauEnd)) ** 2;
    v += p.ead * gaussian(u, p.duration * 0.80, 16) * taper;
  }
  return v;
}

export function ecgVoltage(model, t, reference = false) {
  const p = reference ? model.reference : model.current;
  const r = 228 + p.delay, w = p.qrsScale;
  // A surface sketch, deliberately independent of the single-cell AP signal.
  const pWave = p.pAmplitude * gaussian(t, 75, p.pWidth);
  const qrs = -0.15 * gaussian(t, r - 20 * w, 5 * w)
    + 1.12 * gaussian(t, r, 6 * w) - 0.32 * gaussian(t, r + 20 * w, 8 * w);
  const tPeak = p.onset + p.duration * 0.82;
  const tWave = p.tAmplitude * gaussian(t, tPeak, p.tWidth);
  const uWave = p.uAmplitude * gaussian(t, tPeak + 112, 25);
  return pWave + qrs + tWave + uWave;
}

export function phaseAt(model, t) {
  const p = model.current, u = t - p.onset;
  if (u < 0) return model.id === 'magnesium' && p.delay > 0 && t >= model.reference.onset ? 'Ventricle awaits the delayed impulse' : 'Rest · inside minus outside';
  if (u < p.rise) return 'Phase 0 · fast Na⁺-dependent upstroke';
  if (u < p.rise + 12) return 'Phase 1 · early repolarization';
  if (u < p.duration * 0.64) return 'Phase 2 · the ventricular plateau';
  if (u < p.duration) return p.ead && u > p.duration * 0.71 && u < p.duration * 0.89
    ? model.showsEad ? 'Vulnerable recovery · illustrative early afterdepolarization' : 'Vulnerable recovery · depolarizing tendency'
    : 'Phase 3 · repolarization';
  return 'Phase 4 · back at rest';
}
