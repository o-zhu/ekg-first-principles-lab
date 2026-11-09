import assert from 'node:assert/strict';
import {
  ELECTROLYTES, getElectrolyteModel, nernstPotential, restingPotential,
  apVoltage, ecgVoltage, phaseAt
} from '../dist/cardiac-voltage/electrolyte-model.js';

const close = (actual, expected, tolerance, label) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${label}: ${actual} vs ${expected}`);

// Physics checks independent of the drawn waveforms.
close(nernstPotential(4, 140), -95.02, 0.02, 'K equilibrium at 37 C');
close(nernstPotential(8, 140) - nernstPotential(4, 140), 18.525, 0.02, 'Doubling extracellular K');
close(nernstPotential(8, 4, 2), nernstPotential(8, 4, 1) / 2, 1e-10, 'Divalent ion factor');
close(nernstPotential(140, 4), -nernstPotential(4, 140), 1e-10, 'Gradient reversal');
assert.ok(nernstPotential(4, 140) < restingPotential(4), 'Equilibrium and resting approximation are distinct');
assert.ok(restingPotential(2.5) < restingPotential(4) && restingPotential(4) < restingPotential(8));
assert.throws(() => nernstPotential(0, 140), RangeError);
assert.throws(() => getElectrolyteModel('sodium', 140), RangeError);

let scenarios = 0, samples = 0;
for (const e of ELECTROLYTES) {
  const count = Math.round((e.max - e.min) / e.step);
  for (const vulnerable of e.id === 'magnesium' ? [false, true] : [false]) {
    for (let index = 0; index <= count; index++) {
      const value = e.min + index * e.step;
      const m = getElectrolyteModel(e.id, value, {vulnerable});
      assert.ok(m.sources.length >= 3 && m.sources.every(s => s.url.startsWith('https://')));
      assert.ok(m.steps.length === 3 && m.modelNotes.length >= 4);
      if (e.id === 'magnesium') assert.equal(m.gradient, null, 'No invented serum-Mg Nernst curve');
      for (let t = 0; t <= 800; t++) {
        const ap = apVoltage(m, t), ecg = ecgVoltage(m, t);
        assert.ok(Number.isFinite(ap) && ap >= -110 && ap <= 50, `${e.id} AP at ${value}, ${t}`);
        assert.ok(Number.isFinite(ecg) && ecg >= -0.6 && ecg <= 1.8, `${e.id} ECG at ${value}, ${t}`);
        assert.ok(typeof phaseAt(m, t) === 'string');
        samples++;
      }
      close(apVoltage(m, 0), m.current.rest, 1e-10, 'AP begins at rest');
      close(apVoltage(m, 800), m.current.rest, 1e-10, 'AP returns to rest');
      scenarios++;
    }
    const baseline = getElectrolyteModel(e.id, e.baseline, {vulnerable});
    for (let t = 0; t <= 800; t++) {
      close(apVoltage(baseline, t), apVoltage(baseline, t, true), 1e-10, 'Baseline AP identity');
      close(ecgVoltage(baseline, t), ecgVoltage(baseline, t, true), 1e-10, 'Baseline ECG identity');
    }
  }
}

// Mechanism guardrails: durations, intrinsic shape vs activation timing, and
// the optional EAD must not silently become a predicted arrhythmia.
const kLow = getElectrolyteModel('potassium', 2.5), kHigh = getElectrolyteModel('potassium', 8.5);
assert.ok(kHigh.current.rest > kHigh.reference.rest && kHigh.current.rise > kHigh.reference.rise);
assert.ok(kLow.current.duration > kLow.reference.duration && kLow.current.uAmplitude > 0);
const caLow = getElectrolyteModel('calcium', 0.8), caHigh = getElectrolyteModel('calcium', 1.6);
assert.ok(caLow.current.duration > caLow.reference.duration);
assert.ok(caHigh.current.duration < caHigh.reference.duration);
assert.equal(caLow.current.rest, caHigh.current.rest);
const mgLow = getElectrolyteModel('magnesium', 0.45), mgEad = getElectrolyteModel('magnesium', 0.45, {vulnerable: true});
const mgHigh = getElectrolyteModel('magnesium', 2.5);
const mgSmall = getElectrolyteModel('magnesium', 0.6, {vulnerable: true});
assert.equal(mgSmall.showsEad, false, 'A slowed decline alone is not an EAD');
assert.equal(mgEad.showsEad, true, 'A visible upward deflection is labelled an EAD');
assert.ok(!phaseAt(mgSmall, 540).includes('early afterdepolarization'));
assert.ok(mgHigh.current.delay > 0 && mgHigh.current.duration === mgHigh.reference.duration);
let recoveryRises = 0;
for (let t = 0; t <= 800; t++) {
  close(apVoltage(mgLow, t), apVoltage(mgLow, t, true), 1e-10, 'No universal isolated-low-Mg AP shift');
  close(ecgVoltage(mgEad, t), ecgVoltage(mgEad, t, true), 1e-10, 'No automatic ECG ectopic beat from EAD sketch');
  if (t > mgEad.current.onset + mgEad.current.duration * 0.64 && apVoltage(mgEad, t + 1) > apVoltage(mgEad, t)) recoveryRises++;
}
assert.ok(recoveryRises > 5, 'Optional EAD contains an actual upward deflection during recovery');
console.log(JSON.stringify({pass: true, scenarios, waveformSamples: samples, equilibriumPhysics: 'pass', baselineIdentity: 'pass', physiologyGuardrails: 'pass'}));
