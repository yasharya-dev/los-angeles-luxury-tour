// Her phone bar on a plan page (brief of 2026-11-05, 10A 04): the from-price
// and a way to the booking form, at the foot of the screen while the price
// card's request button is off the screen and her closing panel has not been
// reached. Each state is read from where the page is now, not from how it got
// there, so a jump (a link, a reload, find-in-page) cannot leave it wrong.
// Without script it never shows; the page's own buttons are there either way.

/** A root reaching this far above the screen counts anything above it. */
const AND_ABOVE = '100000px 0px 0px 0px';

/** Room kept clear of the bar above it: a focus ring's width and offset. */
const RING = 8;

export interface PlanBar {
  /** Measures again, as after a resize or a turn of the phone. */
  update(): void;
  disconnect(): void;
}

/**
 * Shows `bar` (its `is-shown` class) while `request` is off the screen and
 * `closing` is neither on it nor above it. While it shows, `root` keeps the
 * bar's height clear at the foot of the screen for focus, find-in-page and
 * fragment scrolling, so nothing focused or found ends up under it
 * (WCAG 2.4.11). Takes the bar out of `hidden`, which keeps it off the page
 * until this runs.
 */
export function watchPlanBar(
  bar: HTMLElement,
  request: Element,
  closing: Element,
  root: HTMLElement = document.documentElement,
  Observer: typeof IntersectionObserver = IntersectionObserver,
): PlanBar {
  let requestOnScreen = false;
  let closingReached = false;

  const update = () => {
    const shown = !requestOnScreen && !closingReached;
    bar.classList.toggle('is-shown', shown);
    // Measured, not a constant: the bar is taller in English, and when its
    // label folds on a narrow phone. Zero where the stylesheet keeps the bar
    // off, as on a wide screen or a phone on its side.
    const height = bar.offsetHeight;
    root.style.scrollPaddingBottom = shown && height ? `${height + RING}px` : '';
  };

  const onScreen = new Observer((entries) => {
    for (const entry of entries) requestOnScreen = entry.isIntersecting;
    update();
  });
  const reached = new Observer(
    (entries) => {
      for (const entry of entries) closingReached = entry.isIntersecting;
      update();
    },
    { rootMargin: AND_ABOVE },
  );
  onScreen.observe(request);
  reached.observe(closing);
  bar.hidden = false;

  return {
    update,
    disconnect() {
      onScreen.disconnect();
      reached.disconnect();
      root.style.scrollPaddingBottom = '';
    },
  };
}
