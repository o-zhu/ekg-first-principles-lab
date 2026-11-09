// The approved Cardiac Voltage package is kept intact in its own document.
// Isolate its styles, keyboard controls, chapter history, and animation clock.
const CHAPTERS = new Set(['#membrane', '#the-wave', '#the-lead', '#whole-heart', '#human-recordings']);
const CHAPTER_ORDER = ['#membrane', '#the-wave', '#the-lead', '#whole-heart'];

export function voltageLessonTemplate() {
  return `<section class="voltage-lesson" id="voltage-lesson" aria-label="Module 1: Electrical foundations" aria-busy="true">
    <div class="voltage-loading" role="status">Opening electrical foundations…</div>
    <iframe id="voltage-frame" class="voltage-frame" title="Electrical foundations: membrane, wave, lead, and whole heart" allow="fullscreen" loading="eager"></iframe>
  </section>`;
}

export class VoltageLesson {
  constructor(container, saved) {
    this.container = container;
    this.saved = saved;
    this.frame = container.querySelector('iframe');
    this.sidebar = document.querySelector('.sidebar');
    this.header = container.previousElementSibling;
    this.resize = () => {
      const frameTop = this.frame.getBoundingClientRect().top + window.scrollY;
      const viewportHeight = window.visualViewport?.height || window.innerHeight;
      this.frame.style.height = `${Math.max(240, Math.floor(viewportHeight - frameTop))}px`;
    };
    this.loaded = () => {
      container.setAttribute('aria-busy', 'false');
      container.querySelector('.voltage-loading')?.remove();
      if (this.restoreScroll) {
        this.frame.contentWindow?.scrollTo({top: saved.scroll || 0, behavior: 'instant'});
        this.restoreScroll = false;
      }
    };
    this.restoreScroll = true;
    this.frame.addEventListener('load', this.loaded);
    this.resize();
    this.observer = new ResizeObserver(this.resize);
    this.observer.observe(this.sidebar);
    if (this.header) this.observer.observe(this.header);
    window.addEventListener('resize', this.resize);
    window.visualViewport?.addEventListener('resize', this.resize);
    const chapter = CHAPTERS.has(saved.chapter) ? saved.chapter : '#membrane';
    this.frame.src = `./cardiac-voltage/index.html${chapter}`;
  }

  togglePlaying() {
    this.frame.contentDocument?.getElementById('play')?.click();
  }

  destroy() {
    const child = this.frame.contentWindow;
    try {
      // Next/keyboard navigation changes the selected chapter without
      // necessarily changing its URL fragment; the visible selection wins.
      const selected = child?.document.querySelector('#experience')?.dataset.chapter;
      if (selected !== undefined && CHAPTER_ORDER[Number(selected)]) {
        this.saved.chapter = CHAPTER_ORDER[Number(selected)];
        if (selected === '3' && child.document.querySelector('[data-heart-mode="measured"]')?.classList.contains('active')) {
          this.saved.chapter = '#human-recordings';
        }
      } else if (child && CHAPTERS.has(child.location.hash)) {
        this.saved.chapter = child.location.hash;
      }
      this.saved.scroll = child?.scrollY || 0;
    } catch {
      // A pending load may have no readable document yet.
    }
    this.observer.disconnect();
    window.removeEventListener('resize', this.resize);
    window.visualViewport?.removeEventListener('resize', this.resize);
    this.frame.removeEventListener('load', this.loaded);
    // Removing the browsing context stops its animation and releases WebGL/data.
    this.frame.remove();
  }
}
