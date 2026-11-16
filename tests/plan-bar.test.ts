// Her phone bar on the plan page (src/scripts/plan-bar.ts), run against
// stand-ins for IntersectionObserver, ResizeObserver and the timer: the test
// says what is on the screen, below it or above it, as the browser would.
import { describe, expect, it } from 'vitest';
import { watchPlanBar, startPlanBar, SETTLE, type PlanBarDeps } from '../src/scripts/plan-bar';

class FakeIntersection {
  static made: FakeIntersection[] = [];
  targets: Element[] = [];
  constructor(
    private readonly callback: IntersectionObserverCallback,
    readonly options: IntersectionObserverInit = {},
  ) {
    FakeIntersection.made.push(this);
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnected = false;
  disconnect() {
    this.disconnected = true;
  }
  takeRecords() {
    return [];
  }
  /** One callback, carrying each target's state in order. */
  report(...entries: Array<[Element, boolean]>) {
    this.callback(
      entries.map(([target, isIntersecting]) => ({ target, isIntersecting }) as unknown as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    );
  }
}

class FakeResize {
  static made: FakeResize[] = [];
  targets: Element[] = [];
  disconnected = false;
  constructor(private readonly callback: ResizeObserverCallback) {
    FakeResize.made.push(this);
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {
    this.disconnected = true;
  }
  fire() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

/** The bar: its `hidden`, classes and sizes are all the script reads. */
function fakeBar(size = { height: 66, scrollWidth: 350, clientWidth: 350 }) {
  const classes = new Set<string>();
  return {
    hidden: true,
    get offsetHeight() {
      return size.height;
    },
    get scrollWidth() {
      return size.scrollWidth;
    },
    get clientWidth() {
      return size.clientWidth;
    },
    size,
    classList: {
      toggle(name: string, force?: boolean) {
        const on = force ?? !classes.has(name);
        if (on) classes.add(name);
        else classes.delete(name);
        return on;
      },
      contains: (name: string) => classes.has(name),
    },
  };
}

function setUp(size?: { height: number; scrollWidth: number; clientWidth: number }) {
  FakeIntersection.made = [];
  FakeResize.made = [];
  const timers: Array<{ run: () => void; ms: number; cleared: boolean }> = [];
  const bar = fakeBar(size);
  const request = { id: 'request' } as unknown as Element;
  const closing = { id: 'closing' } as unknown as Element;
  const root = { style: { scrollPaddingBottom: '' } } as unknown as HTMLElement;
  const scrolls: Array<() => void> = [];
  const deps: PlanBarDeps = {
    root,
    Intersection: FakeIntersection as unknown as typeof IntersectionObserver,
    Resize: FakeResize as unknown as typeof ResizeObserver,
    onScroll: (run) => {
      scrolls.push(run);
      return () => scrolls.splice(scrolls.indexOf(run), 1);
    },
    setTimer: (run, ms) => {
      const timer = { run, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      (timer as { cleared: boolean }).cleared = true;
    },
  };
  const watch = watchPlanBar(bar as unknown as HTMLElement, request, closing, deps);
  const [onOrBelow, onOrAbove] = FakeIntersection.made;
  const [size$] = FakeResize.made;
  const shown = () => bar.classList.contains('is-shown');
  /** Runs every timer that is due and not cleared. */
  const settle = () => {
    for (const timer of timers.splice(0)) if (!timer.cleared) timer.run();
  };
  /** The page scrolls a little, as a guest reading on does. */
  const scroll = () => scrolls.forEach((run) => run());
  return { bar, request, closing, root, watch, onOrBelow, onOrAbove, size: size$, shown, settle, timers, scroll, scrolls };
}

describe('her phone bar on the plan page', () => {
  // The button counts on the screen or below it, her panel on the screen
  // or above it: a jump past either is still seen.
  it('watches the price button on the screen or below, and her panel on it or above', () => {
    const { bar, request, closing, onOrBelow, onOrAbove, size } = setUp();
    expect(onOrBelow.targets).toEqual([request]);
    expect(onOrBelow.options.rootMargin).toMatch(/^0px 0px \d{5,}px 0px$/);
    expect(onOrAbove.targets).toEqual([closing]);
    expect(onOrAbove.options.rootMargin).toMatch(/^\d{5,}px 0px 0px 0px$/);
    expect(size.targets).toEqual([bar]);
    expect(bar.hidden).toBe(false);
  });

  // Her first screen, her tiles and her price card are never under it.
  it('stays down while the price button is on the screen or still below it', () => {
    const { request, closing, onOrBelow, onOrAbove, shown, settle } = setUp();
    onOrBelow.report([request, true]);
    onOrAbove.report([closing, false]);
    settle();
    expect(shown()).toBe(false);
  });

  it('comes up once the price button is above the screen and her panel is below, after a moment', () => {
    const { request, closing, onOrBelow, onOrAbove, shown, settle, timers } = setUp();
    onOrBelow.report([request, false]);
    onOrAbove.report([closing, false]);
    expect(shown()).toBe(false);
    expect(timers.map((t) => t.ms)).toEqual([SETTLE]);
    settle();
    expect(shown()).toBe(true);
  });

  // Scrolling on through the stretch: the wait starts again on every
  // scroll, so it comes up only once the guest stops there.
  it('waits for the page to be still in the stretch', () => {
    const { request, closing, onOrBelow, onOrAbove, shown, settle, scroll, timers } = setUp();
    onOrBelow.report([request, false]);
    onOrAbove.report([closing, false]);
    const first = timers[0];
    scroll();
    expect((first as unknown as { cleared: boolean }).cleared).toBe(true);
    expect(timers.length).toBe(2);
    expect(shown()).toBe(false);
    settle();
    expect(shown()).toBe(true);
    // Once up, scrolling on in the stretch leaves it up.
    scroll();
    expect(shown()).toBe(true);
  });

  // Scrolling through a short stretch does not make it flash.
  it('does not come up if the stretch is passed before it settles', () => {
    const { request, closing, onOrBelow, onOrAbove, shown, settle } = setUp();
    onOrBelow.report([request, false]);
    onOrAbove.report([closing, false]);
    onOrAbove.report([closing, true]);
    settle();
    expect(shown()).toBe(false);
  });

  // Her panel and everything after it, or the price card again: it goes
  // at once, with no wait.
  it('goes at once when her panel comes up or the price button comes back', () => {
    const { request, closing, onOrBelow, onOrAbove, shown, settle } = setUp();
    onOrBelow.report([request, false]);
    onOrAbove.report([closing, false]);
    settle();
    onOrAbove.report([closing, true]);
    expect(shown()).toBe(false);
    onOrAbove.report([closing, false]);
    settle();
    expect(shown()).toBe(true);
    onOrBelow.report([request, true]);
    expect(shown()).toBe(false);
  });

  // A reload at the foot of the page: one observer has spoken, the other
  // not yet. Nothing shows on a guess.
  it('waits for both to report before anything shows', () => {
    const { request, onOrBelow, shown, settle, timers } = setUp();
    onOrBelow.report([request, false]);
    settle();
    expect(timers.length).toBe(0);
    expect(shown()).toBe(false);
  });

  // Several entries for one target in one callback: the last one is now.
  it('reads the last entry of a batch', () => {
    const { request, closing, onOrBelow, onOrAbove, shown, settle } = setUp();
    onOrAbove.report([closing, false]);
    onOrBelow.report([request, true], [request, false]);
    settle();
    expect(shown()).toBe(true);
  });

  // WCAG 2.4.11: room at the foot of the screen wherever the bar can show,
  // up or not, so a Tab or a find whose own scroll brings it up still lands
  // clear of it.
  it('keeps the bar\'s room wherever it can show, up or not', () => {
    const { request, closing, root, onOrBelow, onOrAbove, settle } = setUp({ height: 70, scrollWidth: 335, clientWidth: 335 });
    onOrBelow.report([request, true]);
    onOrAbove.report([closing, false]);
    expect(root.style.scrollPaddingBottom).toBe('78px');
    onOrBelow.report([request, false]);
    settle();
    expect(root.style.scrollPaddingBottom).toBe('78px');
  });

  // The fonts arrive, the text is zoomed, the label folds: measured again.
  it('measures again when the bar changes size', () => {
    const { request, closing, root, onOrBelow, onOrAbove, size, bar } = setUp({ height: 78, scrollWidth: 335, clientWidth: 335 });
    onOrBelow.report([request, true]);
    onOrAbove.report([closing, false]);
    expect(root.style.scrollPaddingBottom).toBe('86px');
    bar.size.height = 70;
    size.fire();
    expect(root.style.scrollPaddingBottom).toBe('78px');
  });

  it('keeps no room where the stylesheet keeps the bar off', () => {
    const { request, closing, root, onOrBelow, onOrAbove, shown, settle } = setUp({ height: 0, scrollWidth: 0, clientWidth: 0 });
    onOrBelow.report([request, false]);
    onOrAbove.report([closing, false]);
    settle();
    expect(root.style.scrollPaddingBottom).toBe('');
    // The class is harmless there; the stylesheet keeps the bar off.
    expect(shown()).toBe(true);
  });

  // At 200% text the row is wider than the screen: it does not come up.
  it('stays down, and keeps no room, when it does not fit', () => {
    const { request, closing, root, onOrBelow, onOrAbove, shown, settle } = setUp({ height: 142, scrollWidth: 488, clientWidth: 360 });
    onOrBelow.report([request, false]);
    onOrAbove.report([closing, false]);
    settle();
    expect(shown()).toBe(false);
    expect(root.style.scrollPaddingBottom).toBe('');
  });

  // Up, then the text is zoomed until the row no longer fits: it goes.
  it('goes when it stops fitting while up', () => {
    const { request, closing, root, onOrBelow, onOrAbove, size, bar, shown, settle } = setUp({ height: 70, scrollWidth: 335, clientWidth: 335 });
    onOrBelow.report([request, false]);
    onOrAbove.report([closing, false]);
    settle();
    expect(shown()).toBe(true);
    bar.size.scrollWidth = 470;
    size.fire();
    expect(shown()).toBe(false);
    expect(root.style.scrollPaddingBottom).toBe('');
  });

  it('lets go of everything when disconnected', () => {
    const { request, closing, root, watch, onOrBelow, onOrAbove, size, shown, settle, scrolls } = setUp();
    onOrBelow.report([request, false]);
    onOrAbove.report([closing, false]);
    settle();
    watch.disconnect();
    expect(onOrBelow.disconnected && onOrAbove.disconnected && size.disconnected).toBe(true);
    expect(scrolls.length).toBe(0);
    expect(shown()).toBe(false);
    expect(root.style.scrollPaddingBottom).toBe('');
  });
});

describe('the bar on the page', () => {
  /** A page with the three elements the bar needs, or without one. */
  const page = (without?: string) => {
    const els: Record<string, unknown> = {
      '[data-plan-bar]': fakeBar(),
      '[data-plan-request]': { id: 'request' },
      '[data-plan-closing]': { id: 'closing' },
    };
    if (without) delete els[without];
    const documentElement = { style: { scrollPaddingBottom: '' } };
    return { els, doc: { querySelector: (s: string) => els[s] ?? null, documentElement } as unknown as Document };
  };
  const deps = () => {
    FakeIntersection.made = [];
    FakeResize.made = [];
    return {
      Intersection: FakeIntersection as unknown as typeof IntersectionObserver,
      Resize: FakeResize as unknown as typeof ResizeObserver,
      setTimer: () => 0,
      clearTimer: () => {},
      onScroll: () => () => {},
    };
  };

  // The button to the observer that counts below the screen, her panel to
  // the one that counts above it: swapped, the bar would go for good at the
  // price card.
  it('wires the price button and her panel to the right observers', () => {
    const { els, doc } = page();
    expect(startPlanBar(doc, deps())).toBeDefined();
    const [onOrBelow, onOrAbove] = FakeIntersection.made;
    expect(onOrBelow.targets).toEqual([els['[data-plan-request]']]);
    expect(onOrBelow.options.rootMargin).toMatch(/^0px 0px /);
    expect(onOrAbove.targets).toEqual([els['[data-plan-closing]']]);
    expect(onOrAbove.options.rootMargin).toMatch(/ 0px 0px 0px$/);
    expect(FakeResize.made[0].targets).toEqual([els['[data-plan-bar]']]);
  });

  it('does nothing on a page without all three', () => {
    for (const missing of ['[data-plan-bar]', '[data-plan-request]', '[data-plan-closing]']) {
      expect(startPlanBar(page(missing).doc, deps()), missing).toBeUndefined();
    }
  });
});
