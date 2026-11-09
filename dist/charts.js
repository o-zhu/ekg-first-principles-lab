import { sampleECG, getFiducials } from './ecg.js';

const DEFAULTS = {
  lead: 'II', bpm: 72, regions: null, axis: 60, paperSpeed: 25, gain: 10,
  mode: 'live', annotations: false, interval: null, mmPx: 5, compact: false,
  record: null, calipers: false, onMeasure: null, windowSeconds: null,
  // Fixed traces never move. A separate, optional coral playhead marks the
  // current cardiac time without erasing or redrawing a moving signal window.
  windowStart: 0, playhead: false, scan: false, playheadPeriod: null,
  playheadTime: null, repeatPlayhead: false, baselineFraction: .63,
  onSeek: null, onGainChange: null, minGain: 5, maxGain: 40, referenceRecord: null, edgeToEdge: false, voltageTicks: false,
};
const INK = '#315f49';
const mod = (n, d) => ((n % d) + d) % d;
const clamp = (n, low, high) => Math.min(high, Math.max(low, n));

/** The same scale conversion is used by drawing and pointer measurements. */
export function chartScale(width, height, options = {}) {
  const o = { ...DEFAULTS, ...options };
  const left = o.edgeToEdge ? 0 : o.compact ? (o.voltageTicks ? 26 : 10) : 32;
  const right = o.edgeToEdge ? 0 : o.compact ? 8 : 16;
  const top = o.compact ? 10 : 22;
  const bottom = o.compact ? 14 : 25;
  const usableWidth = Math.max(1, width - left - right);
  const duration = Number(o.windowSeconds) > 0
    ? Number(o.windowSeconds) : usableWidth / (o.paperSpeed * o.mmPx);
  return {
    width, height, left, right, top, bottom, usableWidth, duration,
    pxPerSecond: usableWidth / duration,
    pxPerMV: o.gain * o.mmPx,
    horizontalMM: usableWidth / duration / o.paperSpeed,
    verticalMM: o.mmPx,
    baseline: top + (height - top - bottom) * (Number.isFinite(o.baselineFraction)
      ? clamp(o.baselineFraction, 0, 1) : .63),
  };
}

export class ECGChart {
  constructor(canvas, options = {}) {
    if (!canvas || typeof canvas.getContext !== 'function') throw new TypeError('ECGChart needs a canvas.');
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = { ...DEFAULTS, ...options };
    this.lastTime = 0;
    this.width = 0;
    this.height = 0;
    this.caliperTimes = null;
    this.activeCaliper = 0;
    this.dragging = false;
    this.seeking = false;
    this.destroyed = false;
    this._staticCache = null;
    this._staticCacheValid = false;
    this._originalTabindex = canvas.getAttribute('tabindex');
    this._originalTouchAction = canvas.style.touchAction;
    this._listeners = {
      pointerdown: e => this._pointerDown(e),
      pointermove: e => this._pointerMove(e),
      pointerup: e => this._pointerUp(e),
      pointercancel: e => this._pointerUp(e),
      keydown: e => this._keyDown(e),
      dblclick: () => {
        if (this._canMeasure()) { this._initCalipers(true); this.render(this.lastTime); }
      },
    };
    if (typeof this.options.onGainChange === 'function') this._listeners.wheel = e => this._wheel(e);
    for (const [name, listener] of Object.entries(this._listeners)) canvas.addEventListener(name, listener, name === 'wheel' ? { passive: false } : undefined);
    this._syncAccessibility();
    this.resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => { if (!this.destroyed) this.render(this.lastTime); }) : null;
    this.resizeObserver?.observe(canvas);
    this.render(0);
  }

  set(patch = {}) {
    const recordChanged = Object.prototype.hasOwnProperty.call(patch, 'record') && patch.record !== this.options.record;
    const enabledCalipers = patch.calipers === true && !this.options.calipers;
    if (patch.gain !== undefined && patch.gain !== this.options.gain) this._gainWheelDelta = 0;
    this.options = { ...this.options, ...patch };
    this._staticCacheValid = false;
    if (recordChanged || enabledCalipers) this.caliperTimes = null;
    this._syncAccessibility();
    this.render(this.lastTime);
    return this;
  }

  setCalipers(enabled = true) { return this.set({ calipers: enabled }); }

  _isFixed() { return this.options.mode === 'fixed' || this.options.mode === 'stationary'; }

  _canMeasure() { return this.options.calipers && this._isFixed(); }
  _canSeek() { return this._isFixed() && typeof this.options.onSeek === 'function' && !this._canMeasure(); }

  _syncAccessibility() {
    const enabled = this._canMeasure() || this._canSeek();
    this.canvas.style.touchAction = enabled ? 'none' : this._originalTouchAction;
    if (enabled) {
      this.canvas.setAttribute('tabindex', '0');
      this.canvas.setAttribute('role', 'application');
    } else {
      if (this._originalTabindex === null) this.canvas.removeAttribute('tabindex');
      else this.canvas.setAttribute('tabindex', this._originalTabindex);
      this.canvas.setAttribute('role', 'img');
      this.canvas.style.cursor = '';
    }
    this._updateAccessibleLabel();
  }

  _updateAccessibleLabel() {
    let label = `${this.options.lead} ECG trace. ${this.options.record?.synthetic ? 'Simulated teaching example' : this.options.record ? 'Real clinical recording' : 'Idealized teaching simulation'}.`;
    if (this._isFixed()) label += ' Stationary waveform.';
    if (this._isFixed() && (this.options.playhead || this.options.scan)) label += this.options.record?.group==='tachyarrhythmia'&&!this.options.record?.rateSummary?.hasDiscreteBeats?' A light red cursor marks the recording time. The heart illustrates the rhythm on a schematic clock without validated beat timing.':' A light red time cursor follows the synchronized heart animation.';
    if (this._canSeek()) label += ' Click or drag to continue playback from that instant. Left and right arrows move one sample; Shift moves 100 milliseconds. Home and End jump to the boundaries.';
    if (typeof this.options.onGainChange === 'function') label += ' Hold Shift and scroll to adjust waveform height. The waveform-height slider provides the same control.';
    if (this._canMeasure()) {
      label += ' Interactive calipers. Press 1 or 2 to select a caliper, then left or right arrow to move it. Hold Shift for larger steps.';
      if (this.caliperTimes) label += ` A ${this.caliperTimes[0].toFixed(3)} seconds; B ${this.caliperTimes[1].toFixed(3)} seconds; interval ${Math.round(Math.abs(this.caliperTimes[1] - this.caliperTimes[0]) * 1000)} milliseconds.`;
    }
    this.canvas.setAttribute('aria-label', label);
  }

  _initCalipers(force = false) {
    if (this.caliperTimes && !force) return;
    const f = getFiducials(this.options.bpm);
    const start = this.startTime || 0, end = this.endTime || f.rr * 2;
    const cycle = Math.ceil((start - f.qrsStart) / f.rr);
    const a = this.options.record ? start + 0.5 : f.qrsStart + cycle * f.rr;
    const b = this.options.record ? start + 1.0 : f.qrsEnd + cycle * f.rr;
    this.caliperTimes = [clamp(a, start, end), clamp(b, start, end)];
    this._emitMeasure();
  }

  _emitMeasure() {
    this._updateAccessibleLabel();
    if (this.caliperTimes && typeof this.options.onMeasure === 'function') {
      this.options.onMeasure(Math.abs(this.caliperTimes[1] - this.caliperTimes[0]));
    }
  }

  _eventX(event) {
    const r = this.canvas.getBoundingClientRect();
    return (event.clientX - r.left) * this.width / Math.max(r.width, 1);
  }

  _x(time) { return this.scale.left + (time - this.startTime) * this.scale.pxPerSecond; }
  _y(value) { return this.scale.baseline - value * this.scale.pxPerMV; }

  _timeAt(x) {
    const fs = this.options.record?.fs || 500;
    const maxTime = this.options.record ? Math.min(this.endTime, this.options.record.seconds - 1 / fs) : this.endTime;
    const t = this.startTime + (x - this.scale.left) / this.scale.pxPerSecond;
    return clamp(Math.round(t * fs) / fs, this.startTime, maxTime);
  }

  _pointerDown(event) {
    if (this._canSeek() && this.scale) {
      if (event.button !== undefined && event.button !== 0) return;
      this.seeking = true;
      this.canvas.focus({preventScroll:true});
      this.canvas.setPointerCapture?.(event.pointerId);
      this._seek(this._timeAt(this._eventX(event)));
      event.preventDefault();
      return;
    }
    if (!this._canMeasure() || !this.scale) return;
    this._initCalipers();
    const x = this._eventX(event);
    this.activeCaliper = Math.abs(x - this._x(this.caliperTimes[0])) <= Math.abs(x - this._x(this.caliperTimes[1])) ? 0 : 1;
    this.dragging = true;
    this.canvas.focus({ preventScroll: true });
    this.canvas.setPointerCapture?.(event.pointerId);
    this.caliperTimes[this.activeCaliper] = this._timeAt(x);
    this._emitMeasure();
    this.render(this.lastTime);
    event.preventDefault();
  }

  _pointerMove(event) {
    if (this._canSeek() && this.scale) {
      this.canvas.style.cursor = 'crosshair';
      if (this.seeking) this._seek(this._timeAt(this._eventX(event)));
      return;
    }
    if (!this._canMeasure() || !this.scale) return;
    const x = this._eventX(event);
    if (this.dragging) {
      this.caliperTimes[this.activeCaliper] = this._timeAt(x);
      this._emitMeasure();
      this.render(this.lastTime);
    }
    this.canvas.style.cursor = 'ew-resize';
  }

  _pointerUp(event) {
    if (!this.dragging && !this.seeking) return;
    this.dragging = false;
    this.seeking = false;
    if (this.canvas.hasPointerCapture?.(event.pointerId)) this.canvas.releasePointerCapture(event.pointerId);
  }

  _keyDown(event) {
    if (this._canSeek() && this.scale) {
      const fs=this.options.record?.fs||500;
      let t=this.lastTime;
      if(event.key==='Home') t=this.startTime;
      else if(event.key==='End') t=this.endTime;
      else if(event.key==='ArrowLeft'||event.key==='ArrowRight') t+=(event.key==='ArrowLeft'?-1:1)*(event.shiftKey?.1:1/fs);
      else return;
      event.preventDefault();this._seek(this._timeAt(this._x(t)));return;
    }
    if (!this._canMeasure()) return;
    this._initCalipers();
    if (event.key === '1' || event.key === '2') this.activeCaliper = Number(event.key) - 1;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const fs = this.options.record?.fs || 500;
      const step = event.shiftKey ? 0.1 : 1 / fs;
      const time = this.caliperTimes[this.activeCaliper] + (event.key === 'ArrowLeft' ? -step : step);
      this.caliperTimes[this.activeCaliper] = this._timeAt(this._x(time));
      this._emitMeasure();
    } else return;
    event.preventDefault();
    this.render(this.lastTime);
  }

  _wheel(event) {
    if (!event.shiftKey || event.ctrlKey || event.metaKey || typeof this.options.onGainChange !== 'function') return;
    const delta = (event.deltaY || event.deltaX) * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.height : 1);
    if (!Number.isFinite(delta) || !delta) return;
    event.preventDefault();
    this._gainWheelDelta = clamp((this._gainWheelDelta || 0) + delta, -180, 180);
    const factor = Math.exp(-this._gainWheelDelta * .004);
    const next = clamp(Math.round(this.options.gain * factor), this.options.minGain, this.options.maxGain);
    if (next !== this.options.gain) { this._gainWheelDelta = 0; this.options.onGainChange(next); }
    else if ((next === this.options.minGain && this._gainWheelDelta > 0) || (next === this.options.maxGain && this._gainWheelDelta < 0)) this._gainWheelDelta = 0;
  }

  _seek(time) {
    this.options.onSeek?.(time);
    this.render(time);
  }

  _size() {
    const rect = this.canvas.getBoundingClientRect();
    const width = Math.round(rect.width);
    const height = Math.round(rect.height);
    if (!width || !height) return false;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (this.canvas.width !== Math.round(width * dpr) || this.canvas.height !== Math.round(height * dpr)) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this._staticCacheValid = false;
    }
    this.width = width;
    this.height = height;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return true;
  }

  render(timeSeconds = this.lastTime) {
    if (this.destroyed || !this.ctx || !this._size()) return;
    this.lastTime = Number.isFinite(timeSeconds) ? timeSeconds : 0;
    const o = this.options;
    this.scale = chartScale(this.width, this.height, o);
    this.startTime = this._isFixed()
      ? (Number.isFinite(Number(o.windowStart)) ? Number(o.windowStart) : 0)
      : this.lastTime - this.scale.duration;
    this.endTime = this.startTime + this.scale.duration;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    if (this._isFixed() && this._staticCacheValid && this._staticCache) {
      ctx.drawImage(this._staticCache, 0, 0, this.width, this.height);
    } else {
      ctx.fillStyle = '#fffdf9';
      ctx.fillRect(0, 0, this.width, this.height);
      this._grid();
      if (o.interval && !o.record) this._interval();
      ctx.save();
      ctx.beginPath();
      ctx.rect(this.scale.left, 3, this.scale.usableWidth, this.height - this.scale.bottom - 3);
      ctx.clip();
      if (o.referenceRecord) {
        ctx.save();ctx.globalAlpha=.32;this._record(o.referenceRecord, true);ctx.restore();
      }
      if (o.record) this._record();
      else this._synthetic();
      ctx.restore();
      if (o.annotations && !o.record) this._annotations();
      this._axisLabels();
      // Only the cursor changes during stationary playback. Cache the exact
      // trace and grid once; twelve simultaneous leads remain inexpensive.
      if (this._isFixed() && typeof document !== 'undefined') {
        this._staticCache ||= document.createElement('canvas');
        this._staticCache.width = this.canvas.width;
        this._staticCache.height = this.canvas.height;
        this._staticCache.getContext('2d').drawImage(this.canvas, 0, 0);
        this._staticCacheValid = true;
      }
    }
    if (this._isFixed() && (o.playhead || o.scan)) this._playhead();
    if (this._canMeasure()) {
      this._initCalipers();
      this._calipers();
    }
  }

  _grid() {
    const ctx = this.ctx, s = this.scale;
    // In a time overview, horizontal compression is intentional; time remains exact.
    const xstep = s.horizontalMM, ystep = s.verticalMM;
    const phase = this.startTime * s.pxPerSecond;
    for (let major = 0; major < 2; major++) {
      ctx.beginPath();
      const multiplier = major ? 5 : 1;
      const dx = xstep * multiplier, dy = ystep * multiplier;
      // Skip imperceptibly dense minor lines in small ten-second overview cards.
      if (dx >= 2 || major) {
        const origin = s.left - mod(phase, dx);
        for (let x = origin; x <= this.width; x += dx) {
          ctx.moveTo(Math.round(x) + .5, 0); ctx.lineTo(Math.round(x) + .5, this.height);
        }
      }
      const y0 = s.baseline - Math.ceil(s.baseline / dy) * dy;
      for (let y = y0; y <= this.height; y += dy) {
        ctx.moveTo(0, Math.round(y) + .5); ctx.lineTo(this.width, Math.round(y) + .5);
      }
      ctx.strokeStyle = major ? 'rgba(173,100,108,.19)' : 'rgba(173,100,108,.075)';
      ctx.lineWidth = .6;
      ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(49,95,73,.14)';
    ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(s.left, s.baseline); ctx.lineTo(this.width - s.right, s.baseline); ctx.stroke();
  }

  _signalStyle() {
    const ctx = this.ctx;
    ctx.strokeStyle = INK;
    ctx.lineWidth = this.options.compact ? 1.25 : 1.8;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  }

  _synthetic() {
    const ctx = this.ctx, o = this.options;
    const fs = 500, rr = 60 / o.bpm;
    const first = Math.ceil(this.startTime * fs), last = Math.floor(this.endTime * fs);
    this._signalStyle(); ctx.beginPath();
    let began = false, lastY = this.scale.baseline;
    for (let i = first; i <= last; i++) {
      const t = i / fs;
      const value = sampleECG(mod(t, rr), o.lead, o.bpm, o.regions, o.axis);
      if (!Number.isFinite(value)) { began = false; continue; }
      const x = this._x(t), y = this._y(value);
      if (!began) { ctx.moveTo(x, y); began = true; } else ctx.lineTo(x, y);
      lastY = y;
    }
    ctx.stroke();
    if (o.mode === 'live' && began && !o.compact) {
      const x = this._x(last / fs);
      ctx.fillStyle = '#7f9e54'; ctx.beginPath(); ctx.arc(x, lastY, 3, 0, Math.PI * 2); ctx.fill();
    }
  }

  _record(record = this.options.record, ghost = false) {
    const ctx = this.ctx, o = this.options;
    const signal = record.signals?.[o.lead];
    if (!signal?.length || !record.fs) {
      ctx.fillStyle = '#7b8378'; ctx.font = '12px sans-serif';
      ctx.fillText('This recording has no samples for this lead.', this.scale.left + 12, this.height / 2);
      return;
    }
    const fs = record.fs, count = signal.length;
    const first = Math.ceil(this.startTime * fs), last = Math.floor(this.endTime * fs);
    const boundaries = [];
    this._signalStyle(); ctx.beginPath();
    if(ghost){ctx.strokeStyle='#8e9e94';ctx.lineWidth=1.1;}
    let began = false;
    for (let i = first; i <= last; i++) {
      if (this._isFixed() && (i < 0 || i >= count)) { began = false; continue; }
      const index = mod(i, count);
      const x = this._x(i / fs), y = this._y(signal[index]);
      if (index === 0 && i !== first && o.mode === 'live') {
        began = false;
        boundaries.push(x);
      }
      if (!Number.isFinite(y)) { began = false; continue; }
      if (began) ctx.lineTo(x, y); else { ctx.moveTo(x, y); began = true; }
    }
    ctx.stroke();
    if (boundaries.length) {
      ctx.save(); ctx.setLineDash([3, 4]); ctx.strokeStyle = '#bd9061'; ctx.lineWidth = 1;
      for (const x of boundaries) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, this.height); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.font = '600 12px sans-serif'; ctx.fillStyle = '#8b633e';
      const labelWidth = ctx.measureText('REPLAY').width;
      for (const x of boundaries) ctx.fillText('REPLAY', x + labelWidth + 5 <= this.width - this.scale.right ? x + 5 : x - labelWidth - 5, 15);
      ctx.restore();
    }
  }

  /** Cardiac time is independent of the fixed waveform's viewport domain. */
  _playheadTimes() {
    const o = this.options;
    const period = Number(o.playheadPeriod) > 0
      ? Number(o.playheadPeriod) : (o.record?.seconds || 60 / o.bpm);
    if (!Number.isFinite(period) || period <= 0) return [];
    const time = o.playheadTime !== null && Number.isFinite(Number(o.playheadTime))
      ? Number(o.playheadTime) : this.lastTime;
    const anchor = this.startTime + mod(time - this.startTime, period);
    if (!o.repeatPlayhead) return anchor <= this.endTime ? [anchor] : [];
    const positions = [];
    // Repeat the same-phase marker only when explicitly requested, so a
    // two-beat overview can compare equivalent electrical phases at a glance.
    for (let t = anchor; t < this.endTime - 1e-8; t += period) positions.push(t);
    return positions;
  }

  _playhead() {
    const ctx = this.ctx, s = this.scale;
    ctx.save();
    ctx.beginPath(); ctx.rect(s.left, 3, s.usableWidth, this.height - s.bottom - 3); ctx.clip();
    if (this.options.compact && this.options.repeatPlayhead) ctx.globalAlpha = .5;
    for (const time of this._playheadTimes()) {
      const x = this._x(time), top = 5, bottom = this.height - s.bottom;
      const glow = ctx.createLinearGradient(x - 13, 0, x + 5, 0);
      glow.addColorStop(0, 'rgba(220,105,116,0)');
      glow.addColorStop(.72, 'rgba(220,105,116,.13)');
      glow.addColorStop(1, 'rgba(220,105,116,0)');
      ctx.fillStyle = glow; ctx.fillRect(x - 13, top, 18, bottom - top);
      ctx.strokeStyle = 'rgba(214,104,115,.7)'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.fillStyle = '#d68d95';
      ctx.beginPath(); ctx.moveTo(x - 4, top); ctx.lineTo(x + 4, top); ctx.lineTo(x, top + 5); ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }

  _intervalDefinition() {
    const f = getFiducials(this.options.bpm);
    const key = typeof this.options.interval === 'string' ? this.options.interval.toLowerCase() : this.options.interval?.id;
    let rrAnchor = f.qrsStart, rrLabel = 'QRS cycle length';
    if (key === 'rr') {
      // Follow a positive QRS peak in the selected lead, not the default lead-II
      // anchor, which can be a negative S trough in other leads such as V1.
      let positivePeak = 0.002;
      const steps = Math.ceil((f.qrsEnd - f.qrsStart) * 1000);
      for (let i = 0; i <= steps; i++) {
        const t = Math.min(f.qrsEnd, f.qrsStart + i / 1000);
        const value = sampleECG(t, this.options.lead, this.options.bpm, this.options.regions, this.options.axis);
        if (Number.isFinite(value) && value > positivePeak) {
          positivePeak = value;
          rrAnchor = t;
          rrLabel = 'R–R interval';
        }
      }
    }
    const map = {
      p: [f.pStart, f.pEnd, 'P wave'],
      pr: [f.pStart, f.qrsStart, 'PR interval'],
      qrs: [f.qrsStart, f.qrsEnd, 'QRS duration'],
      st: [f.qrsEnd, f.tStart, 'ST segment'],
      t: [f.tStart, f.tEnd, 'T wave'],
      qt: [f.qrsStart, f.tEnd, 'QT interval'],
      rr: [rrAnchor, rrAnchor + f.rr, rrLabel],
    };
    return map[key] ? { range: map[key], f } : null;
  }

  _interval() {
    const def = this._intervalDefinition();
    if (!def) return;
    const { range: [a, b, name], f } = def;
    const ctx = this.ctx, s = this.scale;
    let selected = Math.floor((this.startTime + s.duration * .42 - a) / f.rr);
    if (selected * f.rr + a < this.startTime) selected++;
    const ta = selected * f.rr + a, tb = selected * f.rr + b;
    if (tb > this.endTime || ta < this.startTime) return;
    const xa = this._x(ta), xb = this._x(tb);
    ctx.fillStyle = 'rgba(164,192,115,.18)';
    ctx.fillRect(xa, 23, xb - xa, this.height - s.bottom - 23);
    ctx.save(); ctx.strokeStyle = '#89a364'; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
    for (const x of [xa, xb]) { ctx.beginPath(); ctx.moveTo(x, 24); ctx.lineTo(x, this.height - s.bottom); ctx.stroke(); }
    ctx.setLineDash([]); ctx.beginPath(); ctx.moveTo(xa, 24); ctx.lineTo(xb, 24); ctx.stroke();
    ctx.fillStyle = '#5d7547'; ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = `${name} · ${Math.round((b - a) * 1000)} ms`;
    const halfWidth = Math.min(this.width / 2, ctx.measureText(label).width / 2 + 8);
    ctx.fillText(label, clamp((xa + xb) / 2, halfWidth, this.width - halfWidth), 12);
    ctx.restore();
  }

  _annotations() {
    const o = this.options, f = getFiducials(o.bpm), ctx = this.ctx;
    let cycle = Math.floor((this.startTime + this.scale.duration * .42 - f.pStart) / f.rr);
    if (cycle * f.rr + f.pStart < this.startTime) cycle++;
    const base = cycle * f.rr;
    const labels = o.lead === 'II'
      ? [['P', f.pPeak, -17], ['Q', f.qPeak, 17], ['R', f.rPeak, -18], ['S', f.sPeak, 17], ['T', f.tPeak, -17]]
      : [['P', f.pPeak, -18], ['QRS', f.rPeak, -20], ['T', f.tPeak, -18]];
    ctx.save(); ctx.font = '600 13px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (const [label, offset, dy] of labels) {
      if (!Number.isFinite(offset)) continue;
      if (label === 'P' && o.regions?.atria === false) continue;
      if (label === 'T' && o.regions?.recovery === false) continue;
      const t = base + offset;
      if (t < this.startTime || t > this.endTime) continue;
      const value = sampleECG(offset, o.lead, o.bpm, o.regions, o.axis);
      const halfWidth = ctx.measureText(label).width / 2 + 5;
      const x = clamp(this._x(t), halfWidth, this.width - halfWidth);
      const y = clamp(this._y(value) + dy, o.interval ? 40 : 14, this.height - this.scale.bottom - 11);
      ctx.fillStyle = '#fffdf9'; ctx.fillRect(x - halfWidth, y - 10, halfWidth * 2, 20);
      ctx.fillStyle = INK; ctx.fillText(label, x, y);
    }
    ctx.restore();
  }

  _axisLabels() {
    const ctx = this.ctx, o = this.options, s = this.scale;
    ctx.save();
    ctx.font = '12px sans-serif'; ctx.fillStyle = '#64715f'; ctx.textBaseline = 'middle';
    if (!o.compact || o.voltageTicks) {
      ctx.textAlign = 'right'; ctx.fillText('0', s.left - 8, s.baseline);
      if (this._y(1) >= 16) ctx.fillText('1', s.left - 8, this._y(1));
      if (o.voltageTicks && this._y(-1) < this.height - s.bottom - 8) ctx.fillText('−1', s.left - 8, this._y(-1));
    }
    // Tiny clinical-grid cells still keep their exact grid and signal scale;
    // omit text rather than colliding tick labels across adjacent panels.
    if (o.compact && this.width < 95) { ctx.restore(); return; }
    let step = s.duration <= 1.2 ? .2 : s.duration <= 2.5 ? .5 : s.duration > 7 ? 2 : 1;
    const milliseconds = s.duration <= 1.2;
    const timeLabel = time => {
      // Live axes report seconds within the replay; synthetic axes show elapsed time.
      const shown = o.record && o.mode === 'live' ? mod(time, o.record.seconds) : time;
      return milliseconds ? `${Math.round(shown * 1000)} ms` : `${Math.round(shown * 10) / 10}s`;
    };
    const minimumSpacing = Math.max(o.compact ? 48 : 64,
      ctx.measureText(timeLabel(this.startTime)).width + 12,
      ctx.measureText(timeLabel(this.endTime)).width + 12);
    if (step * s.pxPerSecond < minimumSpacing) {
      const needed = minimumSpacing / s.pxPerSecond;
      const magnitude = 10 ** Math.floor(Math.log10(needed));
      step = [1, 2, 5, 10].map(n => n * magnitude).find(n => n >= needed) || magnitude * 10;
    }
    let previousRight = -Infinity;
    for (let time = Math.ceil(this.startTime / step) * step; time <= this.endTime + 1e-8; time += step) {
      const x = this._x(time);
      if (x < s.left - .1 || x > this.width - s.right + .1) continue;
      const label = timeLabel(time), width = ctx.measureText(label).width;
      const left = clamp(x - width / 2, s.left, this.width - s.right - width);
      if (left < previousRight + 8) continue;
      ctx.textAlign = 'left';
      // The existing bottom band fits 12px text without altering ECG calibration.
      ctx.fillText(label, left, this.height - s.bottom / 2);
      previousRight = left + width;
    }
    ctx.restore();
  }

  _calipers() {
    const ctx = this.ctx, s = this.scale, [a, b] = this.caliperTimes;
    const ax = this._x(a), bx = this._x(b), y = this.height - s.bottom - 16;
    ctx.save();
    ctx.fillStyle = 'rgba(187,144,83,.075)';
    ctx.fillRect(Math.min(ax, bx), 30, Math.abs(ax - bx), this.height - s.bottom - 30);
    for (const [index, x] of [ax, bx].entries()) {
      ctx.strokeStyle = this.activeCaliper === index ? '#a77337' : '#c5a374';
      ctx.lineWidth = this.activeCaliper === index ? 1.7 : 1.1;
      ctx.beginPath(); ctx.moveTo(x, 29); ctx.lineTo(x, this.height - s.bottom); ctx.stroke();
      ctx.fillStyle = this.activeCaliper === index ? '#906128' : '#c5a374';
      ctx.beginPath(); ctx.roundRect(x - 10, 10, 20, 18, 4); ctx.fill();
      ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = this.activeCaliper === index ? '#fffdf9' : '#3c2a16'; ctx.fillText(index ? 'B' : 'A', x, 19);
    }
    ctx.strokeStyle = '#b38955'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(ax, y); ctx.lineTo(bx, y); ctx.stroke();
    const text = `${Math.round(Math.abs(b - a) * 1000)} ms`;
    ctx.font = '600 12px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const tw = ctx.measureText(text).width;
    const halfWidth = Math.min(this.width / 2, tw / 2 + 8);
    const labelX = clamp((ax + bx) / 2, halfWidth, this.width - halfWidth);
    ctx.fillStyle = '#fff8eb'; ctx.fillRect(labelX - tw / 2 - 6, y - 10, tw + 12, 20);
    ctx.fillStyle = '#92652f'; ctx.fillText(text, labelX, y);
    ctx.restore();
  }

  destroy() {
    this.destroyed = true;
    this.resizeObserver?.disconnect();
    this._staticCache = null;
    this._staticCacheValid = false;
    for (const [name, listener] of Object.entries(this._listeners)) this.canvas.removeEventListener(name, listener);
    this.canvas.style.touchAction = this._originalTouchAction;
  }
}
