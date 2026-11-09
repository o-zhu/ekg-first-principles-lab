import {waveState} from './wave-model.js';

// The rectangles and badge centers use renderTissue's 1000 × 610 coordinates.
// The host renders accessible HTML info buttons at anchorX/anchorY. Ordinary
// plot clicks remain available for seeking; these regions supply help only.
const regions=[
  {id:'wave-basis',title:'Model and electrodes',x:42,y:15,w:640,h:61,anchorX:668,anchorY:43},
  {id:'wave-current',title:'Current through and around cells',x:48,y:115,w:922,h:148,anchorX:954,anchorY:151},
  {id:'wave-spatial',title:'Voltage along the cells',x:70,y:268,w:882,h:59,anchorX:940,anchorY:280},
  {id:'wave-action-potentials',title:'Two action potentials, one clock',x:42,y:334,w:439,h:232,anchorX:460,anchorY:357},
  {id:'wave-recovery',title:'How recovery order is determined',x:499,y:334,w:459,h:232,anchorX:938,anchorY:357},
];
const fmt=v=>Number.isInteger(v)?String(v):v.toFixed(1);
const signed=v=>(v>=0?'+':'−')+Math.abs(v).toFixed(1);

export function tissueHelpRegions(s={}){
  const m=waveState(s.progress??.08,s.shortening??60,!!s.uniform,s.wavePreset??'human',81,{geometry:s.waveGeometry??'distant',earlyRepolarization:!!s.waveNotch});
  const current=100*m.currentRelative;
  const currentLabel=current===0?'0':current<.001?'<0.001':current<.1?current.toFixed(3):current.toFixed(1);
  const a=m.endpoints.first,b=m.endpoints.last;
  const basis=m.preset==='human'?'The human preset uses published LV-wedge endpoint means (Boukens et al., 2015); AP shapes and intermediate cells are simulated. Both sites share an 80 ms viewing offset.':'This exploratory strand varies action-potential duration and electrode geometry while retaining a common time axis.';
  const loop=s.currentDisplay==='strength'?'In Scaled strength mode, glyphs scale with the fixed current reference.':'In Direction mode, weak currents remain visible; arrow size and particle speed do not encode current strength or ion speed.';
  const bodies={
    'wave-basis':`${basis} Virtual electrodes are ±${m.electrodeRadius} strand half-lengths from the center. Sensitivity at the ends is ${m.sensitivity.edgeToCenter.toFixed(2)}× its central value. Electrode-distance experiments keep the same source gain; the ECG plot rescales its axis.`,
    'wave-current':`Conventional current completes a loop through cells and extracellular space. The + and − markers identify extracellular source and sink regions. These paths are schematic, not solved electric-field lines. ${loop} Current now: ${currentLabel}% of the fixed reference.`,
    'wave-spatial':`Horizontal position here is location along the strand. The current membrane-voltage range is ${signed(m.vmRange.min)} to ${signed(m.vmRange.max)} mV; its vertical scale adapts to make small differences visible. A is ${signed(m.cells[0].vm)} mV and B is ${signed(m.cells.at(-1).vm)} mV. A uniform voltage gives zero spatial current.`,
    'wave-action-potentials':'The gold and green traces show membrane voltage at sites A and B on the same time axis. The dashed level and colored recovery dots mark 80% repolarization (−68 mV in this illustrative voltage scale). Their shapes are simulated; the human preset constrains timing rather than supplying raw AP recordings.',
    'wave-recovery':`The dot marks activation (AT), the diamond marks 80% recovery (RT), and the bar between them is APD₈₀. Recovery time = activation time + duration.\nA: ${fmt(a.originalAT)} + ${fmt(a.apd)} = ${fmt(a.originalRT)} ms.\nB: ${fmt(b.originalAT)} + ${fmt(b.apd)} = ${fmt(b.originalRT)} ms.${m.preset==='human'?' The plotted times include the same +80 ms viewing offset for both sites.':''}`,
  };
  return regions.map(r=>({...r,body:bodies[r.id]}));
}

export function tissueHelpAt(x,y,s={}){
  return tissueHelpRegions(s).find(r=>x>=r.x&&x<=r.x+r.w&&y>=r.y&&y<=r.y+r.h)||null;
}
