/**
 * Small, symbol-free Noomo glass lens. The source rounded-box displacement map
 * refracts the actual backdrop; no annular mask, glyph, thick ring or follower.
 * Position is assigned directly from each mouse PointerEvent, without a RAF or
 * interpolation. A matching translucent native disc remains the fallback.
 *
 * Source: NoomoCursor.createGlassFilter (captured TestCursor), reduced to 32px.
 * SVG backdrop filters are not supported consistently by Safari/Firefox, so
 * those engines keep the browser-managed disc. Native editing/touch is retained.
 */
export const FOUNDRY_CURSOR_DIAMETERS = Object.freeze({ idle: 32, hover: 42, pressed: 28 });
let nextLens = 0;
const smoothstep = (a, b, value) => {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Port of the original Noomo rounded-box signed-distance optical map.
 * Generated once per size; only the bounded cursor backdrop is filtered. */
function createGlassLens(container) {
  const ns = 'http://www.w3.org/2000/svg', id = `foundry-cursor-glass-${++nextLens}`;
  const definitions = document.createElementNS(ns, 'svg');
  definitions.setAttribute('class', 'fc-glass-definitions');
  definitions.setAttribute('aria-hidden', 'true');
  definitions.setAttribute('width', '0');
  definitions.setAttribute('height', '0');
  const defs = document.createElementNS(ns, 'defs');
  definitions.append(defs);
  for (const size of Object.values(FOUNDRY_CURSOR_DIAMETERS)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    if (!context) return null;
    const shifts = new Float64Array(size * size * 2);
    let maximum = 0;
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const u = x / size - .5, v = y / size - .5;
      const a = Math.abs(u) - .3 + .6, b = Math.abs(v) - .2 + .6;
      const distance = Math.min(Math.max(a, b), 0)
        + Math.hypot(Math.max(a, 0), Math.max(b, 0)) - .6;
      const amount = smoothstep(0, 1, smoothstep(.6, 0, distance - .1));
      const dx = (u * amount + .5) * size - x;
      const dy = (v * amount + .5) * size - y;
      const index = (y * size + x) * 2;
      shifts[index] = dx; shifts[index + 1] = dy;
      maximum = Math.max(maximum, Math.abs(dx), Math.abs(dy));
    }
    maximum = Math.max(maximum * .5, .00001);
    const data = context.createImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      data.data[i * 4] = (shifts[i * 2] / maximum + .5) * 255;
      data.data[i * 4 + 1] = (shifts[i * 2 + 1] / maximum + .5) * 255;
      data.data[i * 4 + 2] = 0;
      data.data[i * 4 + 3] = 255;
    }
    context.putImageData(data, 0, 0);
    const filter = document.createElementNS(ns, 'filter');
    for (const [key, value] of Object.entries({ id: `${id}-${size}`, x: 0, y: 0,
      width: size, height: size, filterUnits: 'userSpaceOnUse',
      'color-interpolation-filters': 'sRGB' })) filter.setAttribute(key, value);
    const image = document.createElementNS(ns, 'feImage');
    image.setAttribute('href', canvas.toDataURL());
    image.setAttribute('width', size); image.setAttribute('height', size);
    image.setAttribute('result', 'displacement');
    const displacement = document.createElementNS(ns, 'feDisplacementMap');
    for (const [key, value] of Object.entries({ in: 'SourceGraphic', in2: 'displacement',
      scale: maximum, xChannelSelector: 'R', yChannelSelector: 'G' }))
      displacement.setAttribute(key, value);
    filter.append(image, displacement); defs.append(filter);
  }
  const element = document.createElement('div');
  element.className = 'fc-glass';
  element.setAttribute('aria-hidden', 'true');
  element.hidden = true;
  container.append(definitions, element);
  return { element, id, dispose() { element.remove(); definitions.remove(); } };
}

export function createFoundryCursor({
  container = document.body,
  enabled = true,
  excludeSelector = '#inspector,#studio-bar,#editor,input,textarea,select,[contenteditable="true"],[data-foundry-cursor-ignore]',
  onPointer = () => {},
} = {}) {
  const abort = new AbortController(), options = { passive: true, signal: abort.signal };
  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = new URL('./foundry-cursor.css', import.meta.url).href;
  const root = document.createElement('div');
  root.className = 'foundry-cursor';
  root.hidden = true;
  root.setAttribute('aria-hidden', 'true');
  root.innerHTML = '<span class="fc-caption"><span class="fc-title"></span><span class="fc-kind"></span></span>';
  container.append(root);
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const state = { enabled, dark: false, fire: false, hover: false, hoveredProject: -1, project: null, text: '' };
  const target = { x: 0, y: 0 };
  let disposed = false, inside = false, ignored = false, domHover = false;
  let pointerType = '', visible = false, pressed = false, captionVisible = false;
  let previousTitle = '', previousKind = '', previousPosition = '';
  let refractionRequested = true, lens = null, refractionFailed = false;
  let stylesheetReady = false, lensActive = false, previousLensPosition = '', previousLensDiameter = 0;
  const ua = globalThis.navigator?.userAgent || '';
  const refractionSupported = !(/Firefox|FxiOS/.test(ua) || (/Safari/.test(ua) && !/Chrome|Chromium|Edg\//.test(ua)))
    && Boolean(globalThis.CSS?.supports?.('backdrop-filter', 'url("#foundry-cursor-probe")'));
  const title = root.querySelector('.fc-title'), kind = root.querySelector('.fc-kind');
  const setClass = (element, name, on) => {
    if (element.classList.contains(name) !== on) element.classList.toggle(name, on);
  };
  function diameter() {
    return pressed ? FOUNDRY_CURSOR_DIAMETERS.pressed
      : domHover || state.hover || state.hoveredProject >= 0 ? FOUNDRY_CURSOR_DIAMETERS.hover
      : FOUNDRY_CURSOR_DIAMETERS.idle;
  }
  function ensureLens() {
    if (!refractionRequested || !refractionSupported || lens || refractionFailed) return;
    try { lens = createGlassLens(container); } catch { lens = null; }
    refractionFailed = !lens;
  }
  function placeCaption() {
    if (!captionVisible) return;
    const transform = `translate3d(${target.x}px,${target.y}px,0)`;
    if (transform !== previousPosition) root.style.transform = previousPosition = transform;
    setClass(root, 'caption-left', target.x > innerWidth * .66);
  }
  function placeGlass() {
    if (visible) ensureLens();
    lensActive = Boolean(refractionRequested && visible && lens && stylesheetReady);
    if (lens) {
      lens.element.hidden = !lensActive;
      if (lensActive) {
        const size = diameter();
        if (size !== previousLensDiameter) {
          lens.element.style.width = lens.element.style.height = `${size}px`;
          // Source effects, with blur reduced in proportion to the smaller lens.
          lens.element.style.backdropFilter = lens.element.style.webkitBackdropFilter =
            `url(#${lens.id}-${size}) blur(.65px) contrast(1.2) brightness(1.05) saturate(1.1)`;
          previousLensDiameter = size;
        }
        const position = `translate3d(${target.x - size / 2}px,${target.y - size / 2}px,0)`;
        if (position !== previousLensPosition)
          lens.element.style.transform = previousLensPosition = position;
        setClass(lens.element, 'is-dark', Boolean(state.dark));
      }
    }
    // Hide the native image only once the actual visible glass is ready.
    setClass(document.documentElement, 'has-foundry-glass', lensActive);
  }
  function paint() {
    if (disposed) return;
    visible = state.enabled && pointerType === 'mouse' && inside && !ignored && !document.hidden;
    const hover = Boolean(domHover || state.hover || state.hoveredProject >= 0);
    setClass(document.documentElement, 'has-foundry-cursor', visible);
    setClass(document.documentElement, 'foundry-cursor-hover', visible && hover);
    setClass(document.documentElement, 'foundry-cursor-pressed', visible && pressed);
    setClass(root, 'is-dark', Boolean(state.dark));
    const nextTitle = state.hoveredProject >= 0 && !domHover ? state.project?.name || '' : state.text || '';
    const nextKind = nextTitle && state.hoveredProject >= 0 && !domHover ? state.project?.kind || '' : '';
    if (nextTitle !== previousTitle) title.textContent = previousTitle = nextTitle;
    if (nextKind !== previousKind) kind.textContent = previousKind = nextKind;
    captionVisible = visible && Boolean(nextTitle);
    if (root.hidden === captionVisible) root.hidden = !captionVisible;
    placeCaption(); placeGlass();
  }
  function reset() { inside = false; pointerType = ''; pressed = false; paint(); }
  function move(event) {
    pointerType = event.sourceCapabilities?.firesTouchEvents ? 'touch' : event.pointerType || '';
    inside = pointerType === 'mouse';
    target.x = event.clientX; target.y = event.clientY;
    const element = event.target instanceof Element ? event.target : null;
    ignored = Boolean(element?.closest(excludeSelector));
    domHover = Boolean(element?.closest('a,button,[role="button"],[data-foundry-hover]'));
    paint();
    if (visible) onPointer({ x: target.x, y: target.y, ndcX: target.x / innerWidth * 2 - 1,
      ndcY: 1 - target.y / innerHeight * 2, ignored });
  }
  stylesheet.addEventListener('load', () => { stylesheetReady = true; paint(); }, options);
  stylesheet.addEventListener('error', () => { stylesheetReady = false; paint(); }, options);
  document.head.append(stylesheet);
  window.addEventListener('pointermove', move, options);
  window.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.sourceCapabilities?.firesTouchEvents) reset();
    else { pressed = true; move(event); }
  }, options);
  window.addEventListener('pointerup', () => { pressed = false; paint(); }, options);
  window.addEventListener('pointercancel', reset, options);
  window.addEventListener('blur', reset, options);
  document.addEventListener('pointerleave', reset, options);
  document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); }, options);
  fine.addEventListener('change', reset, { signal: abort.signal });
  paint();
  return {
    root,
    update(patch = {}) { Object.assign(state, patch); paint(); },
    enableRefraction(value = true) {
      if (disposed) return false;
      refractionRequested = Boolean(value);
      ensureLens(); paint();
      return Boolean(refractionRequested && lens);
    },
    getState: () => ({ ...state, visible, captionVisible, pointerType, finePointer: fine.matches,
      rendering: lensActive ? 'noomo-glass' : 'native-svg',
      refraction: lensActive, refractionRequested, refractionSupported, refractionFailed, stylesheetReady,
      diameter: diameter(), x: target.x, y: target.y, soundEnabled: false }),
    dispose() {
      if (disposed) return;
      disposed = true; abort.abort();
      for (const name of ['has-foundry-cursor','has-foundry-glass','foundry-cursor-hover','foundry-cursor-pressed'])
        document.documentElement.classList.remove(name);
      root.remove(); lens?.dispose(); stylesheet.remove();
    },
  };
}
