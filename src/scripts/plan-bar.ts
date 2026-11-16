// Her phone bar on a plan page (brief of 2026-11-05, 10A 04): the from-price
// and a way to the booking form, kept at the foot of the screen while neither
// of the page's own request buttons is in view. It goes once the closing
// panel's button has been passed, so it never sits over a button, the end of
// the page or the footer. Without script it never shows, and the two buttons
// are on the page either way.

/**
 * Shows `bar` (by its `is-shown` class) exactly while none of `buttons` is in
 * view and the last of them is not above the screen. Takes the bar out of
 * `hidden`, which keeps it off the page until this runs. Returns the observer.
 */
export function watchPlanBar(
  bar: HTMLElement,
  buttons: readonly HTMLElement[],
  Observer: typeof IntersectionObserver = IntersectionObserver,
): IntersectionObserver {
  const last = buttons[buttons.length - 1];
  const inView = new Set<Element>();
  let past = false;
  const observer = new Observer((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) inView.add(entry.target);
      else inView.delete(entry.target);
      if (entry.target === last) past = !entry.isIntersecting && entry.boundingClientRect.top < 0;
    }
    bar.classList.toggle('is-shown', inView.size === 0 && !past);
  });
  for (const button of buttons) observer.observe(button);
  bar.hidden = false;
  return observer;
}
