// Her phone bar on the plan page (src/scripts/plan-bar.ts), run against a
// stand-in for IntersectionObserver: the test says what is on the screen, or
// above it, as the browser would.
import { describe, expect, it } from 'vitest';
import { watchPlanBar } from '../src/scripts/plan-bar';

class FakeObserver {
  static made: FakeObserver[] = [];
  targets: Element[] = [];
  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeObserver.made.push(this);
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  /** Reports each target as intersecting its root or not. */
  report(...entries: Array<[Element, boolean]>) {
    this.callback(
      entries.map(([target, isIntersecting]) => ({ target, isIntersecting }) as unknown as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    );
  }
}

/** The bar: its `hidden`, its classes and its height are all the script reads. */
function fakeBar(height = 66) {
  const classes = new Set<string>();
  return {
    hidden: true,
    offsetHeight: height,
    classList: {
      toggle(name: string, force?: boolean) {
        const on = force ?? !classes.has(name);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      contains: (name: string) => classes.has(name),
    },
  } as unknown as HTMLElement;
}

function setUp(height?: number) {
  FakeObserver.made = [];
  const bar = fakeBar(height);
  const request = { id: 'request' } as unknown as Element;
  const closing = { id: 'closing' } as unknown as Element;
  const root = { style: { scrollPaddingBottom: '' } } as unknown as HTMLElement;
  const watch = watchPlanBar(bar, request, closing, root, FakeObserver as unknown as typeof IntersectionObserver);
  const [onScreen, reached] = FakeObserver.made;
  const shown = () => bar.classList.contains('is-shown');
  return { bar, request, closing, root, watch, onScreen, reached, shown };
}

describe('her phone bar on the plan page', () => {
  // The price card's button counts while on the screen; the closing panel
  // counts on the screen and anywhere above it, so a jump past it is seen.
  it('watches the price button on the screen and the closing panel on it or above it', () => {
    const { bar, request, closing, onScreen, reached } = setUp();
    expect(onScreen.targets).toEqual([request]);
    expect(onScreen.options.rootMargin).toBeUndefined();
    expect(reached.targets).toEqual([closing]);
    expect(reached.options.rootMargin).toMatch(/^\d{5,}px 0px 0px 0px$/);
    expect(bar.hidden).toBe(false);
  });

  // The top of the page on most phones: the photo and the title, the price
  // card still below.
  it('shows while the price button is off the screen and the panel is not reached', () => {
    const { request, closing, onScreen, reached, shown } = setUp();
    onScreen.report([request, false]);
    reached.report([closing, false]);
    expect(shown()).toBe(true);
  });

  it('steps aside while the price button is on the screen', () => {
    const { request, closing, onScreen, reached, shown } = setUp();
    reached.report([closing, false]);
    onScreen.report([request, true]);
    expect(shown()).toBe(false);
    onScreen.report([request, false]);
    expect(shown()).toBe(true);
  });

  // Her panel and everything after it: the bar never sits on her black
  // panel, the footer or the legal lines.
  it('steps aside from the closing panel on, and comes back above it', () => {
    const { request, closing, onScreen, reached, shown } = setUp();
    onScreen.report([request, false]);
    reached.report([closing, true]);
    expect(shown()).toBe(false);
    reached.report([closing, false]);
    expect(shown()).toBe(true);
  });

  // A jump from the top to the foot of the page (the end key, find-in-page,
  // a link): the price button is off the screen before and after, so it says
  // nothing; the panel, now above the screen, still counts as reached.
  it('reads a jump past both from where the page is now', () => {
    const { request, closing, onScreen, reached, shown } = setUp();
    onScreen.report([request, false]);
    reached.report([closing, false]);
    expect(shown()).toBe(true);
    reached.report([closing, true]);
    expect(shown()).toBe(false);
    // And back to the middle in one jump.
    reached.report([closing, false]);
    expect(shown()).toBe(true);
  });

  // WCAG 2.4.11: what a keyboard focuses, or find-in-page finds, is
  // scrolled clear of the bar, ring included.
  it('keeps the bar\'s height clear for focus while it shows, and only then', () => {
    const { request, closing, root, onScreen, reached, watch } = setUp(70);
    onScreen.report([request, false]);
    reached.report([closing, false]);
    expect(root.style.scrollPaddingBottom).toBe('78px');
    onScreen.report([request, true]);
    expect(root.style.scrollPaddingBottom).toBe('');
    onScreen.report([request, false]);
    watch.disconnect();
    expect(root.style.scrollPaddingBottom).toBe('');
  });

  // Where the stylesheet keeps the bar off (a wide or short screen) it has
  // no height, and the page keeps no room for it.
  it('keeps no room where the bar is off', () => {
    const { request, closing, root, onScreen, reached, shown } = setUp(0);
    onScreen.report([request, false]);
    reached.report([closing, false]);
    expect(shown()).toBe(true);
    expect(root.style.scrollPaddingBottom).toBe('');
  });
});
