// Her phone bar on the plan page (src/scripts/plan-bar.ts), run against
// stand-ins for IntersectionObserver, ResizeObserver, the timer and the
// guest's scrolls and taps: the test says what is on the screen, below it or
// above it, as the browser would.
import { describe, expect, it } from 'vitest';
import { watchPlanBar, startPlanBar, SETTLE, ARRIVE, type PlanBarDeps } from '../src/scripts/plan-bar';

class FakeIntersection {
  static made: FakeIntersection[] = [];
  targets: Element[] = [];
  disconnected = false;
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
  /** A size change of any target it watches. */
  fire() {
    this.callback([], this as unknown as ResizeObserver);
  }
}

type Size = { height: number; scrollWidth: number; clientWidth: number };

/** The bar: its `hidden`, classes, sizes and parts are all the script reads. */
function fakeBar(size: Size = { height: 66, scrollWidth: 350, clientWidth: 350 }) {
  const classes = new Set<string>();
  const parts = [{ id: 'price' }, { id: 'button' }] as unknown as Element[];
  return {
    hidden: true,
    children: parts,
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

type Timer = { run: () => void; ms: number; cleared: boolean };

function setUp(size?: Size) {
  FakeIntersection.made = [];
  FakeResize.made = [];
  const timers: Timer[] = [];
  const activity: Array<() => void> = [];
  const bar = fakeBar(size);
  const request = { id: 'request' } as unknown as Element;
  const closing = { id: 'closing' } as unknown as Element;
  const root = { style: { scrollPaddingBottom: '' } } as unknown as HTMLElement;
  const deps: PlanBarDeps = {
    root,
    Intersection: FakeIntersection as unknown as typeof IntersectionObserver,
    Resize: FakeResize as unknown as typeof ResizeObserver,
    setTimer: (run, ms) => {
      const timer = { run, ms, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => {
      (timer as Timer).cleared = true;
    },
    onActivity: (run) => {
      activity.push(run);
      return () => activity.splice(activity.indexOf(run), 1);
    },
  };
  const watch = watchPlanBar(bar as unknown as HTMLElement, request, closing, deps);
  const [onOrBelow, onOrAbove] = FakeIntersection.made;
  const [resize] = FakeResize.made;
  const shown = () => bar.classList.contains('is-shown');
  const arriving = () => bar.classList.contains('is-arriving');
  /** Timers still waiting: set and neither run nor cleared. */
  const live = () => timers.filter((t) => !t.cleared);
  /** Runs every live timer of this length, as time passes. */
  const elapse = (ms: number) => {
    for (const timer of timers.filter((t) => !t.cleared && t.ms === ms)) {
      timer.cleared = true;
      timer.run();
    }
  };
  const settle = () => elapse(SETTLE);
  /** The guest scrolls a little, or touches the screen. */
  const act = () => activity.slice().forEach((run) => run());
  /** Into the stretch: the price button gone above, her panel still below. */
  const enter = () => {
    onOrBelow.report([request, false]);
    onOrAbove.report([closing, false]);
  };
  return { bar, request, closing, root, watch, onOrBelow, onOrAbove, resize, shown, arriving, live, elapse, settle, act, enter, timers, activity };
}

describe('her phone bar on the plan page', () => {
  // The button counts on the screen or below it, her panel on the screen
  // or above it: a jump past either is still seen.
  it('watches the price button on the screen or below, and her panel on it or above', () => {
    const { bar, request, closing, onOrBelow, onOrAbove, resize } = setUp();
    expect(onOrBelow.targets).toEqual([request]);
    expect(onOrBelow.options.rootMargin).toMatch(/^0px 0px \d{5,}px 0px$/);
    expect(onOrAbove.targets).toEqual([closing]);
    expect(onOrAbove.options.rootMargin).toMatch(/^\d{5,}px 0px 0px 0px$/);
    // The bar and its parts: a part can widen the row without changing the
    // bar's own height.
    expect(resize.targets).toEqual([bar, ...bar.children]);
    expect(bar.hidden).toBe(false);
  });

  // Long enough not to flash while a guest scrolls on; the slide is 250ms.
  it('waits a real moment, and lets taps through for the length of its slide', () => {
    expect(SETTLE).toBeGreaterThanOrEqual(150);
    expect(ARRIVE).toBeGreaterThanOrEqual(250);
  });

  // Her first screen, her tiles and her price card are never under it.
  it('stays down while the price button is on the screen or still below it', () => {
    const { request, closing, onOrBelow, onOrAbove, shown, settle, live } = setUp();
    onOrBelow.report([request, true]);
    onOrAbove.report([closing, false]);
    expect(live().length).toBe(0);
    settle();
    expect(shown()).toBe(false);
  });

  it('comes up once the guest is still between the price button and her panel', () => {
    const { shown, settle, live, enter } = setUp();
    enter();
    expect(shown()).toBe(false);
    expect(live().map((t) => t.ms)).toEqual([SETTLE]);
    settle();
    expect(shown()).toBe(true);
  });

  // Scrolling on or touching the screen in the stretch starts the wait again,
  // so it comes up only once the guest stops there.
  it('starts the wait again on every scroll or touch', () => {
    const { shown, settle, act, live, timers, enter } = setUp();
    enter();
    const first = timers[0];
    act();
    expect(first.cleared).toBe(true);
    expect(live().length).toBe(1);
    expect(shown()).toBe(false);
    settle();
    expect(shown()).toBe(true);
    // Once up, scrolling on in the stretch leaves it up.
    act();
    expect(shown()).toBe(true);
  });

  // The fonts arrive during the wait: still one wait, not a second that a
  // scroll could no longer stop.
  it('keeps one wait at a time', () => {
    const { resize, live, enter } = setUp();
    enter();
    resize.fire();
    resize.fire();
    expect(live().length).toBe(1);
  });

  // Through a short stretch: the wait is dropped, not left to run.
  it('drops the wait when the stretch is left before it settles', () => {
    const { closing, onOrAbove, shown, settle, live, enter } = setUp();
    enter();
    onOrAbove.report([closing, true]);
    expect(live().length).toBe(0);
    settle();
    expect(shown()).toBe(false);
  });

  // The row stops fitting during the wait, with no report to say so: the
  // wait's own check keeps it down.
  it('measures again when the wait ends', () => {
    const { bar, shown, settle, enter } = setUp({ height: 70, scrollWidth: 335, clientWidth: 335 });
    enter();
    bar.size.scrollWidth = 470;
    settle();
    expect(shown()).toBe(false);
  });

  // Her panel and everything after it, or the price card again: it goes at
  // once, with no wait.
  it('goes at once when her panel comes up or the price button comes back', () => {
    const { request, closing, onOrBelow, onOrAbove, shown, settle, enter } = setUp();
    enter();
    settle();
    onOrAbove.report([closing, true]);
    expect(shown()).toBe(false);
    onOrAbove.report([closing, false]);
    settle();
    expect(shown()).toBe(true);
    onOrBelow.report([request, true]);
    expect(shown()).toBe(false);
  });

  // A tap meant for her accordion at the foot of the screen does not land
  // on the bar as it slides in.
  it('lets taps through while it slides in', () => {
    const { closing, onOrAbove, shown, arriving, settle, elapse, enter, live } = setUp();
    enter();
    settle();
    expect(shown()).toBe(true);
    expect(arriving()).toBe(true);
    elapse(ARRIVE);
    expect(arriving()).toBe(false);
    // Down, up again, and gone again mid-slide: nothing is left pending.
    onOrAbove.report([closing, true]);
    enter();
    settle();
    expect(arriving()).toBe(true);
    onOrAbove.report([closing, true]);
    expect(arriving()).toBe(false);
    expect(live().length).toBe(0);
  });

  // A reload at the foot of the page: one observer has spoken, the other
  // not yet. Nothing shows on a guess.
  it('waits for both to report before anything shows', () => {
    const { request, onOrBelow, shown, settle, live } = setUp();
    onOrBelow.report([request, false]);
    settle();
    expect(live().length).toBe(0);
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
  it("keeps the bar's room wherever it can show, up or not", () => {
    const { request, closing, root, onOrBelow, onOrAbove, settle } = setUp({ height: 70, scrollWidth: 335, clientWidth: 335 });
    onOrBelow.report([request, true]);
    onOrAbove.report([closing, false]);
    expect(root.style.scrollPaddingBottom).toBe('78px');
    onOrBelow.report([request, false]);
    settle();
    expect(root.style.scrollPaddingBottom).toBe('78px');
  });

  // The fonts arrive, the text is zoomed, the label folds: measured again.
  it('measures again when the bar or a part of it changes size', () => {
    const { request, closing, root, onOrBelow, onOrAbove, resize, bar } = setUp({ height: 78, scrollWidth: 335, clientWidth: 335 });
    onOrBelow.report([request, true]);
    onOrAbove.report([closing, false]);
    expect(root.style.scrollPaddingBottom).toBe('86px');
    bar.size.height = 70;
    resize.fire();
    expect(root.style.scrollPaddingBottom).toBe('78px');
  });

  it('keeps no room where the stylesheet keeps the bar off', () => {
    const { root, shown, settle, enter } = setUp({ height: 0, scrollWidth: 0, clientWidth: 0 });
    enter();
    settle();
    expect(root.style.scrollPaddingBottom).toBe('');
    // The class is harmless there; the stylesheet keeps the bar off.
    expect(shown()).toBe(true);
  });

  // A pixel of rounding fits; two do not.
  it('fits to the pixel, and not past it', () => {
    const one = setUp({ height: 70, scrollWidth: 336, clientWidth: 335 });
    one.enter();
    one.settle();
    expect(one.shown()).toBe(true);
    const two = setUp({ height: 70, scrollWidth: 337, clientWidth: 335 });
    two.enter();
    two.settle();
    expect(two.shown()).toBe(false);
    expect(two.root.style.scrollPaddingBottom).toBe('');
  });

  // At 200% text the row is wider than the screen: it does not come up.
  it('stays down, and keeps no room, when it does not fit', () => {
    const { root, shown, settle, enter } = setUp({ height: 142, scrollWidth: 488, clientWidth: 360 });
    enter();
    settle();
    expect(shown()).toBe(false);
    expect(root.style.scrollPaddingBottom).toBe('');
  });

  // Up, then the text is zoomed until the row no longer fits: it goes.
  it('goes when it stops fitting while up', () => {
    const { root, resize, bar, shown, settle, enter } = setUp({ height: 70, scrollWidth: 335, clientWidth: 335 });
    enter();
    settle();
    expect(shown()).toBe(true);
    bar.size.scrollWidth = 470;
    resize.fire();
    expect(shown()).toBe(false);
    expect(root.style.scrollPaddingBottom).toBe('');
  });

  it('lets go of everything when disconnected, for good', () => {
    const { root, watch, onOrBelow, onOrAbove, resize, shown, live, activity, enter } = setUp();
    enter();
    expect(live().length).toBe(1);
    watch.disconnect();
    expect(onOrBelow.disconnected && onOrAbove.disconnected && resize.disconnected).toBe(true);
    expect(activity.length).toBe(0);
    expect(live().length).toBe(0);
    expect(shown()).toBe(false);
    expect(root.style.scrollPaddingBottom).toBe('');
    // A late call, or a report already queued, does nothing.
    watch.update();
    onOrBelow.report([{} as Element, false]);
    expect(live().length).toBe(0);
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
      onActivity: () => () => {},
    };
  };

  // The button to the observer that counts below the screen, her panel to
  // the one that counts above it: swapped either way, it never comes up.
  it('wires the price button and her panel to the right observers', () => {
    const { els, doc } = page();
    expect(startPlanBar(doc, deps())).toBeDefined();
    const [onOrBelow, onOrAbove] = FakeIntersection.made;
    expect(onOrBelow.targets).toEqual([els['[data-plan-request]']]);
    expect(onOrBelow.options.rootMargin).toMatch(/^0px 0px /);
    expect(onOrAbove.targets).toEqual([els['[data-plan-closing]']]);
    expect(onOrAbove.options.rootMargin).toMatch(/ 0px 0px 0px$/);
    expect(FakeResize.made[0].targets[0]).toBe(els['[data-plan-bar]']);
  });

  it('does nothing on a page without all three', () => {
    for (const missing of ['[data-plan-bar]', '[data-plan-request]', '[data-plan-closing]']) {
      expect(startPlanBar(page(missing).doc, deps()), missing).toBeUndefined();
    }
  });
});
