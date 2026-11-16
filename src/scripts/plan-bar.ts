// Her phone bar on a plan page (brief of 2026-11-05, 10A 04): the from-price
// and a way to the booking form, at the foot of the screen once the price
// card's request button has gone above the screen, and until her closing
// panel comes up. So it never covers her first screen, her price card, her
// panel or the footer: her "without covering the EN switch or content".
//
// Each state is read from where the page is now, not from how it got there,
// so a jump (a link, a reload, find-in-page) cannot leave it wrong. It comes
// up only once the guest has been still for a moment in that stretch, so
// scrolling through does not make it flash, and it goes at once. On a short
// page, like the Dodgers transfer, that stretch is short and the bar is rare:
// the page's own buttons are nearly always in view, which is the bar's job
// anyway. Without script it never shows.

/** A root reaching this far below the screen counts anything below it. */
const AND_BELOW = '0px 0px 100000px 0px';
/** A root reaching this far above the screen counts anything above it. */
const AND_ABOVE = '100000px 0px 0px 0px';

/** Room kept clear above the bar: a focus ring's width and offset. */
const RING = 8;

/** How long the page is still, in the bar's stretch, before it comes up. */
export const SETTLE = 180;

/** How long after it starts to come up the bar lets taps through: its
    250ms slide, and a margin. */
export const ARRIVE = 300;

export interface PlanBar {
  /** Measures again; the bar's own size changes call it too. */
  update(): void;
  /** Stops for good: no observer, timer or room is left behind. */
  disconnect(): void;
}

/** What the bar runs on, swappable in a test. */
export interface PlanBarDeps {
  root?: HTMLElement;
  Intersection?: typeof IntersectionObserver;
  Resize?: typeof ResizeObserver;
  setTimer?: (run: () => void, ms: number) => unknown;
  clearTimer?: (timer: unknown) => void;
  /** Calls `run` whenever the guest scrolls or touches the page; returns how
      to stop. */
  onActivity?: (run: () => void) => () => void;
}

/**
 * Shows `bar` (its `is-shown` class) while `request` is above the screen and
 * `closing` is below it, once the guest has been still there for SETTLE.
 * Wherever the bar can show (a phone held upright, where it has a height)
 * and fits, `root` keeps its height clear at the foot of the screen for
 * focus, find-in-page and fragment scrolling, so nothing focused or found
 * lands under it, even when that scroll is what brings it up (WCAG 2.4.11).
 * A bar that does not fit, as at 200% text, never shows. While it slides in
 * (`is-arriving`), taps pass through it to what the guest meant to tap.
 * Takes the bar out of `hidden`.
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
  const onActivity =
    deps.onActivity ??
    ((run: () => void) => {
      addEventListener('scroll', run, { passive: true });
      addEventListener('pointerdown', run, { passive: true });
      return () => {
        removeEventListener('scroll', run);
        removeEventListener('pointerdown', run);
      };
    });

  // Unknown until each observer has reported: wanted() is false until both
  // have, so nothing shows on a guess.
  let requestOnOrBelow: boolean | undefined;
  let closingOnOrAbove: boolean | undefined;
  let waiting: unknown;
  let arriving: unknown;
  let stopped = false;

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

  const cancel = (timer: unknown) => {
    if (timer !== undefined) clearTimer(timer);
    return undefined;
  };

  const hide = () => {
    waiting = cancel(waiting);
    arriving = cancel(arriving);
    bar.classList.toggle('is-arriving', false);
    bar.classList.toggle('is-shown', false);
  };

  const show = () => {
    bar.classList.toggle('is-shown', true);
    bar.classList.toggle('is-arriving', true);
    arriving = setTimer(() => {
      arriving = undefined;
      bar.classList.toggle('is-arriving', false);
    }, ARRIVE);
  };

  const update = () => {
    if (stopped) return;
    const fits = room();
    if (!wanted() || !fits) return hide();
    // One wait at a time, and none once it is up.
    if (bar.classList.contains('is-shown') || waiting !== undefined) return;
    waiting = setTimer(() => {
      waiting = undefined;
      // Measured again: the row may have stopped fitting during the wait.
      if (!stopped && wanted() && room()) show();
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
  // The fonts arriving, text zoom, a label folding, a turn of the phone. Its
  // parts too: one can widen the row without changing the bar's own height.
  const size = Resize ? new Resize(() => update()) : undefined;
  // Still scrolling or touching in the stretch: the wait starts again.
  const stopActivity = onActivity(() => {
    if (waiting === undefined) return;
    waiting = cancel(waiting);
    update();
  });

  onOrBelow.observe(request);
  onOrAbove.observe(closing);
  if (size) for (const el of [bar, ...Array.from(bar.children)]) size.observe(el);
  bar.hidden = false;

  return {
    update,
    disconnect() {
      stopped = true;
      onOrBelow.disconnect();
      onOrAbove.disconnect();
      size?.disconnect();
      stopActivity();
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
