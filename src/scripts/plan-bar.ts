// Her phone bar on a plan page (brief of 2026-11-05, 10A 04): the from-price
// and a way to the booking form, at the foot of the screen once the price
// card's request button has gone above the screen, and until her closing
// panel comes up. So it never covers her first screen, her price card, her
// panel or the footer: her "without covering the EN switch or content".
//
// Each state is read from where the page is now, not from how it got there,
// so a jump (a link, a reload, find-in-page) cannot leave it wrong. It comes
// up only once the page has been still for a moment in that stretch, so
// scrolling through does not make it flash, and it goes at once. Without
// script it never shows; the page's own buttons are there either way.

/** A root reaching this far below the screen counts anything below it. */
const AND_BELOW = '0px 0px 100000px 0px';
/** A root reaching this far above the screen counts anything above it. */
const AND_ABOVE = '100000px 0px 0px 0px';

/** Room kept clear above the bar: a focus ring's width and offset. */
const RING = 8;

/** How long the page is still, in the bar's stretch, before it comes up. */
export const SETTLE = 180;

export interface PlanBar {
  /** Measures again; the bar's own size changes call it too. */
  update(): void;
  disconnect(): void;
}

/** What the bar runs on, swappable in a test. */
export interface PlanBarDeps {
  root?: HTMLElement;
  Intersection?: typeof IntersectionObserver;
  Resize?: typeof ResizeObserver;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  /** Calls `run` on every scroll of the page; returns how to stop. */
  onScroll?: (run: () => void) => () => void;
}

/**
 * Shows `bar` (its `is-shown` class) while `request` is above the screen and
 * `closing` is below it, once the page has been still there for SETTLE.
 * Wherever the bar can show (a phone held upright, where it has a height)
 * and fits, `root` keeps its height clear at the foot of the screen for
 * focus, find-in-page and fragment scrolling, so nothing focused or found
 * lands under it, even when that scroll is what brings it up (WCAG 2.4.11).
 * A bar that does not fit, as at 200% text, never shows. Takes the bar out
 * of `hidden`.
 */
export function watchPlanBar(
  bar: HTMLElement,
  request: Element,
  closing: Element,
  deps: PlanBarDeps = {},
): PlanBar {
  const root = deps.root ?? document.documentElement;
  const Intersection = deps.Intersection ?? IntersectionObserver;
  const Resize = deps.Resize ?? (typeof ResizeObserver === 'undefined' ? undefined : ResizeObserver);
  const setTimer = deps.setTimer ?? ((run: () => void, ms: number) => setTimeout(run, ms));
  const clearTimer = deps.clearTimer ?? ((timer: unknown) => clearTimeout(timer as ReturnType<typeof setTimeout>));
  const onScroll =
    deps.onScroll ??
    ((run: () => void) => {
      addEventListener('scroll', run, { passive: true });
      return () => removeEventListener('scroll', run);
    });

  // Unknown until each observer has reported, so nothing shows on a guess.
  let requestOnOrBelow: boolean | undefined;
  let closingOnOrAbove: boolean | undefined;
  let timer: unknown;

  const wanted = () => requestOnOrBelow === false && closingOnOrAbove === false;

  /** Keeps the bar's room on the root, and says whether the bar fits. */
  const room = () => {
    // Measured, not a constant: the bar is taller in English, when its label
    // folds, and before or after the web fonts arrive. Zero where the
    // stylesheet keeps it off, as on a wide screen or a phone on its side.
    const height = bar.offsetHeight;
    const fits = bar.scrollWidth <= bar.clientWidth + 1;
    root.style.scrollPaddingBottom = height && fits ? `${height + RING}px` : '';
    return fits;
  };

  const hide = () => {
    if (timer !== undefined) {
      clearTimer(timer);
      timer = undefined;
    }
    bar.classList.toggle('is-shown', false);
  };

  const update = () => {
    const fits = room();
    if (requestOnOrBelow === undefined || closingOnOrAbove === undefined) return;
    if (!wanted() || !fits) return hide();
    if (bar.classList.contains('is-shown') || timer !== undefined) return;
    timer = setTimer(() => {
      timer = undefined;
      if (wanted() && room()) bar.classList.toggle('is-shown', true);
    }, SETTLE);
  };

  const onOrBelow = new Intersection(
    (entries) => {
      for (const entry of entries) requestOnOrBelow = entry.isIntersecting;
      update();
    },
    { rootMargin: AND_BELOW },
  );
  const onOrAbove = new Intersection(
    (entries) => {
      for (const entry of entries) closingOnOrAbove = entry.isIntersecting;
      update();
    },
    { rootMargin: AND_ABOVE },
  );
  // The fonts arriving, text zoom, a label folding, a turn of the phone.
  const size = Resize ? new Resize(() => update()) : undefined;
  // Still scrolling in the stretch: the wait starts again.
  const stopScroll = onScroll(() => {
    if (timer === undefined) return;
    clearTimer(timer);
    timer = undefined;
    update();
  });

  onOrBelow.observe(request);
  onOrAbove.observe(closing);
  size?.observe(bar);
  bar.hidden = false;

  return {
    update,
    disconnect() {
      onOrBelow.disconnect();
      onOrAbove.disconnect();
      size?.disconnect();
      stopScroll();
      hide();
      root.style.scrollPaddingBottom = '';
    },
  };
}

/** Finds the bar and what it watches on a plan page, and starts it. */
export function startPlanBar(doc: Document = document, deps: PlanBarDeps = {}): PlanBar | undefined {
  const bar = doc.querySelector<HTMLElement>('[data-plan-bar]');
  const request = doc.querySelector('[data-plan-request]');
  const closing = doc.querySelector('[data-plan-closing]');
  const supported = deps.Intersection ?? (typeof IntersectionObserver === 'undefined' ? undefined : IntersectionObserver);
  if (!bar || !request || !closing || !supported) return undefined;
  return watchPlanBar(bar, request, closing, { ...deps, Intersection: supported, root: deps.root ?? doc.documentElement });
}
