import {
  ELECTROLYTES,
  getElectrolyteModel,
  apVoltage,
  ecgVoltage,
  phaseAt,
} from './electrolyte-model.js';

// Keep the explorer independent of the main lesson's animation clock and data.
const DURATION = 800;
const PLOT = {width: 720, height: 246, left: 54, right: 701, top: 25, bottom: 211};
const COLORS = {potassium: '#a3633e', calcium: '#376f89', magnesium: '#77608c'};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const formatCompact = value => typeof value === 'number'
  ? new Intl.NumberFormat('en-US', {maximumFractionDigits: 7}).format(value)
  : String(value ?? '');
const formatPotential = value => typeof value === 'number' && Number.isFinite(value)
  ? `${value < 0 ? '−' : '+'}${Math.abs(value).toFixed(1)} mV`
  : String(value ?? '');
const formatConcentration = (electrolyte, value) => Number(value).toFixed(electrolyte.decimals);
const xPosition = time => PLOT.left + time / DURATION * (PLOT.right - PLOT.left);
const yPosition = (value, min, max) => PLOT.bottom - (value - min) / (max - min) * (PLOT.bottom - PLOT.top);
let instance = null;

export const electrolytesLaunch = `<button type="button" class="channel-lens-launch electrolytes-launch" id="electrolytes-open" aria-haspopup="dialog"><svg viewBox="0 0 30 30" aria-hidden="true"><path d="M10 4h10M12 4v8L5 24a2 2 0 0 0 2 3h16a2 2 0 0 0 2-3l-7-12V4M9 18h12"/><path d="M12 22h4m-2-2v4M19 23h3"/></svg><span><strong>Explore electrolyte abnormalities</strong><small>Concentrations → membrane voltage</small></span><span aria-hidden="true">↗</span></button>`;

function chartMarkup(id, label, unit, min, max, ticks) {
  const horizontal = ticks.map(value => {
    const y = yPosition(value, min, max);
    const text = String(value).replace('-', '−');
    return `<path d="M${PLOT.left} ${y}H${PLOT.right}" class="el-grid-line${value === 0 ? ' el-zero-line' : ''}"/><text x="${PLOT.left - 12}" y="${y + 3.5}" text-anchor="end">${text}</text>`;
  }).join('');
  const vertical = [0, 200, 400, 600, 800].map(time => {
    const x = xPosition(time);
    return `<path d="M${x} ${PLOT.top}V${PLOT.bottom}" class="el-grid-line"/><text x="${x}" y="230" text-anchor="middle">${time}</text>`;
  }).join('');
  return `<svg class="electrolytes-plot" id="electrolytes-${id}" viewBox="0 0 ${PLOT.width} ${PLOT.height}" role="img" aria-labelledby="electrolytes-${id}-description"><title id="electrolytes-${id}-description">${escapeHTML(label)}</title><defs><clipPath id="electrolytes-${id}-clip"><rect x="${PLOT.left}" y="${PLOT.top - 4}" width="${PLOT.right - PLOT.left}" height="${PLOT.bottom - PLOT.top + 8}"/></clipPath></defs><g class="el-axis">${horizontal}${vertical}<text x="${PLOT.left}" y="13">${escapeHTML(unit)}</text></g><g clip-path="url(#electrolytes-${id}-clip)"><path id="electrolytes-${id}-baseline" class="el-baseline-path"/><path id="electrolytes-${id}-changed" class="el-changed-path"/><line id="electrolytes-${id}-cursor" y1="${PLOT.top}" y2="${PLOT.bottom}" class="el-time-cursor"/><circle id="electrolytes-${id}-dot" r="4.3" class="el-time-dot"/></g></svg>`;
}

function sourceLink(source) {
  let url;
  try {
    url = new URL(source.url, document.baseURI);
    if (!['https:', 'http:'].includes(url.protocol)) return '';
  } catch {
    return '';
  }
  return `<li><a href="${escapeHTML(url.href)}" target="_blank" rel="noopener noreferrer">${escapeHTML(source.title)} <span aria-hidden="true">↗</span></a>${source.type ? `<span class="el-source-type">${escapeHTML(source.type)}</span>` : ''}</li>`;
}

export function initializeElectrolytes({pause} = {}) {
  if (instance) return instance;

  const byId = new Map(ELECTROLYTES.map(electrolyte => [electrolyte.id, electrolyte]));
  const values = Object.fromEntries(ELECTROLYTES.map(electrolyte => [electrolyte.id, electrolyte.baseline]));
  const potassium = byId.get('potassium');
  if (potassium) values.potassium = clamp(6.5, potassium.min, potassium.max);
  let selected = potassium ? 'potassium' : ELECTROLYTES[0].id;
  let vulnerable = false;
  let model;
  let time = 0;
  let playing = false;
  let frame = null;
  let lastFrame = 0;
  let opener = null;

  const dialog = document.createElement('dialog');
  dialog.id = 'electrolytes-dialog';
  dialog.setAttribute('aria-labelledby', 'electrolytes-title');
  dialog.innerHTML = `<header class="electrolytes-heading"><div><div class="eyebrow">OPTIONAL EXPLORER · ELECTROLYTES</div><h2 id="electrolytes-title">Electrolytes, <em>from cell to EKG.</em></h2><p>Explore a concentration change, then follow its electrical effects.</p></div><button type="button" class="close-btn" id="electrolytes-close" aria-label="Close electrolyte explorer">×</button></header>
    <div class="electrolytes-selectors" role="group" aria-label="Choose an electrolyte">${ELECTROLYTES.map(electrolyte => `<button type="button" data-electrolyte="${escapeHTML(electrolyte.id)}" aria-pressed="false"><span class="el-ion-symbol">${escapeHTML(electrolyte.symbol)}</span><span>${escapeHTML(electrolyte.name)}</span><span class="el-selector-mark" aria-hidden="true">↗</span></button>`).join('')}</div>
    <p class="electrolytes-convention">One electrolyte at a time · illustrative waveforms</p>
    <div class="electrolytes-workspace">
      <aside class="electrolytes-sidebar" aria-label="Concentration controls and electrical context">
        <section class="electrolytes-concentration-card" aria-labelledby="electrolytes-concentration-label"><div class="el-small-label">CHANGE THE CONCENTRATION</div><label id="electrolytes-concentration-label" for="electrolytes-concentration"></label><div class="el-concentration-reading"><output id="electrolytes-concentration-output" for="electrolytes-concentration"></output><span id="electrolytes-unit"></span></div><input type="range" id="electrolytes-concentration" aria-describedby="electrolytes-reference"><div class="el-range-ends" aria-hidden="true"><span id="electrolytes-min"></span><span id="electrolytes-max"></span></div><p class="el-reference" id="electrolytes-reference"></p><div class="electrolytes-presets" id="electrolytes-presets" role="group" aria-label="Example concentrations"></div><button type="button" class="electrolytes-reset" id="electrolytes-reset"><span aria-hidden="true">↺</span> Reset to baseline</button></section>
        <label class="electrolytes-vulnerable" id="electrolytes-vulnerable-label" hidden><input type="checkbox" id="electrolytes-vulnerable"><span>Show a vulnerable prolonged-repolarization example</span></label>
        <section class="electrolytes-gradient-card" id="electrolytes-gradient" aria-label="Concentration gradient and equilibrium potential"></section>
      </aside>
      <main class="electrolytes-main">
        <div class="electrolytes-state-heading"><span class="electrolytes-condition" id="electrolytes-condition"></span><h3 id="electrolytes-headline"></h3><p id="electrolytes-summary"></p></div>
        <div class="electrolytes-metrics" id="electrolytes-metrics"></div>
        <div class="electrolytes-legend" aria-label="Plot legend"><span><i class="el-baseline-swatch"></i>Baseline</span><span><i class="el-changed-swatch"></i><span id="electrolytes-legend-selected">Selected concentration</span></span></div>
        <section class="electrolytes-chart-card" aria-labelledby="electrolytes-ap-title"><div class="electrolytes-chart-heading"><div><h4 id="electrolytes-ap-title">Illustrative action potential</h4><p>One ventricular cell · inside minus outside</p></div><span class="el-time-axis-label">Time (ms)</span></div>${chartMarkup('ap', 'Baseline and changed ventricular action potentials on the same voltage and time axes.', 'mV', -110, 50, [-100, -50, 0, 50])}<p class="electrolytes-chart-note" id="electrolytes-ap-note"></p></section>
        <section class="electrolytes-chart-card electrolytes-ecg-card" aria-labelledby="electrolytes-ecg-title"><div class="electrolytes-chart-heading"><div><h4 id="electrolytes-ecg-title">Illustrative ECG <span>· not calculated from this one cell</span></h4><p>Relative amplitude · the whole-heart pattern is schematic</p></div><span class="el-time-axis-label">Time (ms)</span></div>${chartMarkup('ecg', 'Schematic baseline and changed ECG waveforms on the same relative-amplitude and time axes. This ECG is not calculated from the single-cell action potential.', 'a.u.', -0.6, 1.8, [-0.5, 0, 0.5, 1, 1.5])}<p class="electrolytes-chart-note" id="electrolytes-ecg-note"></p></section>
        <div class="electrolytes-transport"><button type="button" id="electrolytes-play" aria-label="Play electrolyte comparison"><span aria-hidden="true">▶</span></button><div class="electrolytes-time-control"><div><label for="electrolytes-time">Explore time</label><output id="electrolytes-time-output" for="electrolytes-time">0 ms</output></div><input type="range" id="electrolytes-time" min="0" max="800" step="1" value="0" aria-describedby="electrolytes-phase"></div></div>
        <div class="electrolytes-cursor-reading"><span id="electrolytes-phase"></span><span id="electrolytes-voltage-reading"></span></div>
      </main>
    </div>
    <section class="electrolytes-explanation" aria-labelledby="electrolytes-mechanism-title"><div class="el-small-label">FOLLOW THE MECHANISM</div><h3 id="electrolytes-mechanism-title">From ions to the electrical pattern.</h3><ol class="electrolytes-steps" id="electrolytes-steps"></ol><div class="electrolytes-ecg-summary"><span>ON THE EKG</span><p id="electrolytes-ecg-summary"></p></div><p class="electrolytes-variability" id="electrolytes-variability"></p></section>
    <details class="electrolytes-evidence"><summary>Evidence &amp; model assumptions</summary><div class="electrolytes-evidence-content"><section><h4>What the model represents</h4><ul id="electrolytes-model-notes"></ul></section><section><h4>Sources</h4><ol id="electrolytes-sources"></ol></section></div></details>`;
  document.body.append(dialog);

  const $ = id => dialog.querySelector(`#electrolytes-${id}`);
  const concentrationInput = $('concentration');
  const timeInput = $('time');

  function waveformPath(sample, reference, min, max) {
    let path = '';
    for (let t = 0; t <= DURATION; t += 1) {
      const value = sample(model, t, reference);
      // A broken model must never silently become a fabricated flat trace.
      if (!Number.isFinite(value)) throw new Error('Electrolyte waveform returned a non-finite value.');
      path += `${t ? 'L' : 'M'}${xPosition(t).toFixed(2)} ${yPosition(value, min, max).toFixed(2)}`;
    }
    return path;
  }

  function drawTime() {
    const x = xPosition(time);
    for (const [id, sample, min, max] of [
      ['ap', apVoltage, -110, 50],
      ['ecg', ecgVoltage, -0.6, 1.8],
    ]) {
      $(`${id}-cursor`).setAttribute('x1', x);
      $(`${id}-cursor`).setAttribute('x2', x);
      $(`${id}-dot`).setAttribute('cx', x);
      $(`${id}-dot`).setAttribute('cy', yPosition(sample(model, time, false), min, max));
    }
    timeInput.value = Math.round(time);
    $('time-output').textContent = `${Math.round(time)} ms`;
    $('phase').textContent = phaseAt(model, time);
    $('voltage-reading').textContent = `Cell voltage ${formatPotential(apVoltage(model, time, false))}`;
  }

  function renderGradient(electrolyte) {
    const gradient = model.gradient;
    if (!gradient) {
      $('gradient').innerHTML = `<div class="el-small-label">MECHANISTIC CONTEXT</div><p class="el-context-note">${escapeHTML(model.contextNote)}</p>`;
      return;
    }
    $('gradient').innerHTML = `<div class="el-small-label">THE CONCENTRATION GRADIENT</div><div class="el-gradient-compartments"><div><span>Outside</span><strong>${escapeHTML(formatCompact(gradient.outside))}</strong><small>${escapeHTML(electrolyte.unit)}</small></div><div class="el-gradient-membrane" aria-hidden="true"><span>${escapeHTML(gradient.ion)}</span><i></i></div><div><span>Inside</span><strong>${escapeHTML(formatCompact(gradient.inside))}</strong><small>${escapeHTML(electrolyte.unit)}</small></div></div>${gradient.insideLabel ? `<p class="el-gradient-assumption">${escapeHTML(gradient.insideLabel)}</p>` : ''}<div class="el-equilibrium"><span>${escapeHTML(gradient.equilibriumLabel)}</span><div><span><small>Baseline</small><b>${escapeHTML(formatPotential(gradient.baselinePotential))}</b></span><span><small>Selected</small><strong>${escapeHTML(formatPotential(gradient.currentPotential))}</strong></span></div></div><p class="el-gradient-detail">${escapeHTML(gradient.detail)}</p>`;
  }

  function render() {
    const electrolyte = byId.get(selected);
    const value = values[selected];
    model = getElectrolyteModel(selected, value, {vulnerable: selected === 'magnesium' && vulnerable});
    dialog.dataset.electrolyte = selected;
    dialog.style.setProperty('--electrolytes-accent', COLORS[selected] || '#376f69');
    dialog.querySelectorAll('[data-electrolyte]').forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.electrolyte === selected));
    });
    $('concentration-label').textContent = electrolyte.concentrationLabel;
    concentrationInput.min = electrolyte.min;
    concentrationInput.max = electrolyte.max;
    concentrationInput.step = electrolyte.step;
    concentrationInput.value = value;
    concentrationInput.setAttribute('aria-valuetext', `${formatConcentration(electrolyte, value)} ${electrolyte.unit}`);
    $('concentration-output').textContent = formatConcentration(electrolyte, value);
    $('unit').textContent = electrolyte.unit;
    $('min').textContent = formatConcentration(electrolyte, electrolyte.min);
    $('max').textContent = formatConcentration(electrolyte, electrolyte.max);
    $('reference').textContent = `${electrolyte.referenceLabel} · Baseline ${formatConcentration(electrolyte, electrolyte.baseline)} ${electrolyte.unit}`;
    $('presets').innerHTML = electrolyte.presets.map(preset => `<button type="button" data-electrolyte-preset="${preset.value}" aria-pressed="${Math.abs(preset.value - value) < electrolyte.step * 0.5}"><span>${escapeHTML(preset.label)}</span><small>${escapeHTML(formatConcentration(electrolyte, preset.value))}</small></button>`).join('');
    $('presets').querySelectorAll('[data-electrolyte-preset]').forEach(button => {
      button.addEventListener('click', () => {
        const value = Number(button.dataset.electrolytePreset);
        setValue(value);
        // The preset list was redrawn; preserve keyboard focus on the choice.
        $('presets').querySelector(`[data-electrolyte-preset="${value}"]`)?.focus({preventScroll: true});
      });
    });
    $('reset').disabled = Math.abs(value - electrolyte.baseline) < electrolyte.step * 0.5;
    $('vulnerable-label').hidden = selected !== 'magnesium';
    $('vulnerable').checked = vulnerable;
    $('condition').textContent = model.condition;
    $('headline').textContent = model.headline;
    $('summary').textContent = model.summary;
    $('metrics').innerHTML = model.metrics.map(metric => `<section><span>${escapeHTML(metric.label)}</span><strong>${escapeHTML(metric.value)}</strong>${metric.baseline ? `<small>Baseline: ${escapeHTML(metric.baseline)}</small>` : ''}${metric.detail ? `<p>${escapeHTML(metric.detail)}</p>` : ''}</section>`).join('');
    $('legend-selected').textContent = `${electrolyte.symbol} ${formatConcentration(electrolyte, value)} ${electrolyte.unit}`;
    $('ap-note').textContent = model.apNote;
    $('ecg-note').textContent = model.ecgNote;
    $('ecg-summary').textContent = model.ecgSummary;
    $('variability').textContent = model.variability;
    $('steps').innerHTML = model.steps.map((step, index) => `<li><span class="el-step-number">0${index + 1}</span><div><h4>${escapeHTML(step.title)}</h4><p>${escapeHTML(step.body)}</p></div></li>`).join('');
    $('model-notes').innerHTML = model.modelNotes.map(note => `<li>${escapeHTML(note)}</li>`).join('');
    $('sources').innerHTML = model.sources.map(sourceLink).join('');
    renderGradient(electrolyte);
    $('ap-baseline').setAttribute('d', waveformPath(apVoltage, true, -110, 50));
    $('ap-changed').setAttribute('d', waveformPath(apVoltage, false, -110, 50));
    $('ecg-baseline').setAttribute('d', waveformPath(ecgVoltage, true, -0.6, 1.8));
    $('ecg-changed').setAttribute('d', waveformPath(ecgVoltage, false, -0.6, 1.8));
    $('ap-description').textContent = `${model.condition}. Baseline and selected-concentration ventricular action potentials on fixed axes, from −110 to +50 millivolts and 0 to 800 milliseconds. ${model.apNote}`;
    $('ecg-description').textContent = `${model.condition}. Baseline and selected-concentration schematic ECGs on fixed relative-amplitude and time axes. This ECG is not calculated from the single-cell action potential. ${model.ecgSummary}`;
    drawTime();
  }

  function updatePlayButton() {
    $('play').innerHTML = `<span aria-hidden="true">${playing ? 'Ⅱ' : time >= DURATION ? '↻' : '▶'}</span>`;
    $('play').setAttribute('aria-label', playing ? 'Pause electrolyte comparison' : time >= DURATION ? 'Replay electrolyte comparison' : 'Play electrolyte comparison');
    $('play').setAttribute('aria-pressed', String(playing));
  }

  function stopPlayback() {
    playing = false;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
    updatePlayButton();
  }

  function tick(now) {
    frame = null;
    if (!playing || !dialog.open) return;
    time = Math.min(DURATION, time + Math.min(80, now - lastFrame) * 0.12);
    lastFrame = now;
    drawTime();
    if (time >= DURATION) stopPlayback();
    else frame = requestAnimationFrame(tick);
  }

  function setValue(value) {
    const electrolyte = byId.get(selected);
    values[selected] = clamp(value, electrolyte.min, electrolyte.max);
    stopPlayback();
    render();
  }

  function seek(value) {
    time = clamp(value, 0, DURATION);
    drawTime();
    startPlayback();
  }

  function startPlayback() {
    if (time >= DURATION) return stopPlayback();
    playing = true;
    lastFrame = performance.now();
    updatePlayButton();
    if (frame === null) frame = requestAnimationFrame(tick);
  }

  dialog.querySelectorAll('[data-electrolyte]').forEach(button => {
    button.addEventListener('click', () => {
      selected = button.dataset.electrolyte;
      time = 0;
      stopPlayback();
      render();
    });
  });
  concentrationInput.addEventListener('input', event => setValue(Number(event.target.value)));
  $('reset').addEventListener('click', () => setValue(byId.get(selected).baseline));
  $('vulnerable').addEventListener('change', event => {
    vulnerable = event.target.checked;
    stopPlayback();
    render();
  });
  timeInput.addEventListener('input', event => seek(Number(event.target.value)));
  $('play').addEventListener('click', () => {
    if (playing) return stopPlayback();
    if (time >= DURATION) time = 0;
    startPlayback();
  });

  // The native time slider supplies the keyboard equivalent of chart scrubbing.
  const pointerCleanup = [];
  for (const chart of [$('ap'), $('ecg')]) {
    let pointerId = null;
    const seekPointer = event => {
      const rect = chart.getBoundingClientRect();
      if (!rect.width) return;
      const x = (event.clientX - rect.left) / rect.width * PLOT.width;
      seek((x - PLOT.left) / (PLOT.right - PLOT.left) * DURATION);
    };
    const release = () => {
      if (pointerId !== null && chart.hasPointerCapture(pointerId)) chart.releasePointerCapture(pointerId);
      pointerId = null;
    };
    chart.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      pointerId = event.pointerId;
      chart.setPointerCapture(pointerId);
      timeInput.focus({preventScroll: true});
      seekPointer(event);
    });
    chart.addEventListener('pointermove', event => {
      if (event.pointerId === pointerId) seekPointer(event);
    });
    chart.addEventListener('pointerup', release);
    chart.addEventListener('pointercancel', release);
    chart.addEventListener('lostpointercapture', () => { pointerId = null; });
    pointerCleanup.push(release);
  }

  $('close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    stopPlayback();
    pointerCleanup.forEach(release => release());
    if (opener?.isConnected) opener.focus({preventScroll: true});
  });
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopPlayback();
  });

  render();
  updatePlayButton();
  instance = {
    open() {
      pause?.();
      stopPlayback();
      if (!dialog.open) {
        opener = document.activeElement;
        dialog.showModal();
        $('close').focus({preventScroll: true});
      }
    },
    close() { if (dialog.open) dialog.close(); },
    isOpen() { return dialog.open; },
  };
  return instance;
}
