/** Accessible, shared progressive disclosure. Scientific content stays in the DOM. */
const panels = new Set();
let nextId = 0;

function place(item) {
  if (!item.open || !item.button.isConnected) return;
  const {panel, button} = item;
  const margin = 12, gap = 8;
  const width = Math.max(220, Math.min(440, window.innerWidth - margin * 2));
  panel.style.width = `${width}px`;
  panel.style.maxHeight = `${Math.max(120, window.innerHeight - margin * 2)}px`;
  const anchor = button.getBoundingClientRect();
  const box = panel.getBoundingClientRect();
  const left = Math.max(margin, Math.min(anchor.left, window.innerWidth - box.width - margin));
  const below = anchor.bottom + gap;
  const top = below + box.height <= window.innerHeight - margin ? below
    : anchor.top - gap - box.height >= margin ? anchor.top - gap - box.height
    : Math.max(margin, Math.min(below, window.innerHeight - box.height - margin));
  panel.style.left = `${left}px`;
  panel.style.top = `${top}px`;
}

function close(item, restoreFocus = false) {
  clearTimeout(item.timer);
  if (!item.open) return;
  item.open = false;
  item.pinned = false;
  if (item.native && item.panel.matches(':popover-open')) item.panel.hidePopover();
  item.panel.hidden = true;
  item.button.setAttribute('aria-expanded', 'false');
  item.wrapper.classList.remove('is-open');
  if (restoreFocus && item.button.isConnected) {
    item.suppressFocus = true;
    item.button.focus({preventScroll: true});
    queueMicrotask(() => { item.suppressFocus = false; });
  }
}

export function closeInfoPanels({restoreFocus = false} = {}) {
  for (const item of panels) close(item, restoreFocus && item.panel.contains(document.activeElement));
}

function open(item, pinned = false) {
  if (!item.button.isConnected) return;
  if (!pinned && [...panels].some(other => other !== item && other.open &&
    (other.pinned || other.panel.contains(document.activeElement) || other.button === document.activeElement))) return;
  clearTimeout(item.timer);
  for (const other of panels) if (other !== item) close(other);
  item.pinned ||= pinned;
  if (!item.open) {
    item.panel.hidden = false;
    item.open = true;
    if (item.native) item.panel.showPopover();
    item.button.setAttribute('aria-expanded', 'true');
    item.wrapper.classList.add('is-open');
  }
  place(item);
}

function scheduleClose(item) {
  clearTimeout(item.timer);
  item.timer = setTimeout(() => {
    if (!item.pinned && !item.wrapper.matches(':hover') && !item.panel.matches(':hover')
      && !item.wrapper.contains(document.activeElement) && !item.panel.contains(document.activeElement)) close(item);
  }, 180);
}

/** Enhance only marked prose. Keep controls, chart scales and key facts visible. */
export function enhanceInfoPanels(root = document) {
  for (const item of panels) if (!item.button.isConnected) {
    close(item);
    if (!item.native) item.panel.remove();
    panels.delete(item);
  }
  const candidates = [...root.querySelectorAll('[data-info-panel]:not([data-info-ready])')];
  if (root.matches?.('[data-info-panel]:not([data-info-ready])')) candidates.unshift(root);
  for (const panel of candidates) {
    if (panel.closest('[data-info-ready]')) continue;
    const title = panel.dataset.infoPanel || 'More information';
    const wrapper = document.createElement('div');
    wrapper.className = 'ui-info';
    if (panel.dataset.infoLabel) wrapper.classList.add('ui-info-labeled');
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'ui-info-trigger';
    button.setAttribute('aria-label', title);
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-haspopup', 'dialog');
    const icon = document.createElement('span');
    icon.className = 'ui-info-icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = 'i';
    button.append(icon);
    if (panel.dataset.infoLabel) {
      const label = document.createElement('span');
      label.textContent = panel.dataset.infoLabel;
      button.append(label);
    }
    panel.before(wrapper);
    wrapper.append(button, panel);
    panel.id ||= `ui-info-${++nextId}`;
    panel.classList.add('ui-info-panel');
    panel.dataset.infoReady = '';
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', title);
    panel.tabIndex = -1;
    panel.hidden = true;
    button.setAttribute('aria-controls', panel.id);
    const heading = document.createElement('div');
    heading.className = 'ui-info-heading';
    const name = document.createElement('strong');
    name.textContent = title;
    const dismiss = document.createElement('button');
    dismiss.type = 'button';
    dismiss.className = 'ui-info-close';
    dismiss.setAttribute('aria-label', `Close ${title}`);
    dismiss.textContent = '×';
    heading.append(name, dismiss);
    panel.prepend(heading);
    const native = typeof panel.showPopover === 'function';
    if (native) panel.setAttribute('popover', 'manual');
    const item = {panel, button, wrapper, native, open: false, pinned: false, suppressFocus: false, timer: null};
    panels.add(item);
    button.addEventListener('pointerenter', event => { if (event.pointerType !== 'touch') open(item); });
    button.addEventListener('focus', () => { if (!item.suppressFocus) open(item); });
    wrapper.addEventListener('pointerleave', () => scheduleClose(item));
    panel.addEventListener('pointerenter', () => clearTimeout(item.timer));
    panel.addEventListener('pointerleave', () => scheduleClose(item));
    wrapper.addEventListener('focusout', () => scheduleClose(item));
    panel.addEventListener('focusout', () => scheduleClose(item));
    button.addEventListener('click', event => {
      if (item.open && item.pinned) close(item);
      else {
        open(item, true);
        if (event.detail === 0) dismiss.focus({preventScroll: true});
      }
    });
    dismiss.addEventListener('click', () => close(item, true));
  }
}

document.addEventListener('pointerdown', event => {
  for (const item of panels) if (item.open && !item.wrapper.contains(event.target) && !item.panel.contains(event.target)) close(item);
});
document.addEventListener('keydown', event => {
  if (event.key !== 'Escape') return;
  const current = [...panels].find(item => item.open);
  if (current) { event.preventDefault(); event.stopPropagation(); close(current, current.panel.contains(document.activeElement)); }
}, true);
window.addEventListener('resize', () => { for (const item of panels) place(item); });
window.addEventListener('scroll', () => { for (const item of panels) place(item); }, {capture: true, passive: true});
