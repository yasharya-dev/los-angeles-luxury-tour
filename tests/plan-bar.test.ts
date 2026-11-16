// Her phone bar on the plan page (src/scripts/plan-bar.ts), run against a
// stand-in for IntersectionObserver: the test says which button crosses the
// screen and where, as the browser would.
import { describe, expect, it } from 'vitest';
import { watchPlanBar } from '../src/scripts/plan-bar';

class FakeObserver {
  static last: FakeObserver;
  readonly root = null;
  readonly rootMargin = '0px';
  readonly thresholds = [0];
  targets: Element[] = [];
  constructor(private readonly callback: IntersectionObserverCallback) {
    FakeObserver.last = this;
  }
  observe(target: Element) {
    this.targets.push(target);
  }
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
  /** Each entry: the button, whether any of it is on screen, its top edge. */
  report(...entries: Array<[Element, boolean, number]>) {
    this.callback(
      entries.map(
        ([target, isIntersecting, top]) =>
          ({ target, isIntersecting, boundingClientRect: { top } }) as unknown as IntersectionObserverEntry,
      ),
      this as unknown as IntersectionObserver,
    );
  }
}

/** The bar: its `hidden` and its classes are all the script touches. */
function fakeBar() {
  const classes = new Set<string>();
  return {
    hidden: true,
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

function setUp() {
  const bar = fakeBar();
  const price = { id: 'price' } as unknown as HTMLElement;
  const closing = { id: 'closing' } as unknown as HTMLElement;
  watchPlanBar(bar, [price, closing], FakeObserver as unknown as typeof IntersectionObserver);
  const io = FakeObserver.last;
  const shown = () => bar.classList.contains('is-shown');
  return { bar, price, closing, io, shown };
}

describe('her phone bar on the plan page', () => {
  it('watches both request buttons, and comes out of hidden only when it runs', () => {
    const { bar, price, closing, io } = setUp();
    expect(io.targets).toEqual([price, closing]);
    expect(bar.hidden).toBe(false);
  });

  // The top of the page on most phones: the photo and the title, neither
  // button yet.
  it('shows while neither button is on screen', () => {
    const { price, closing, io, shown } = setUp();
    io.report([price, false, 823], [closing, false, 1790]);
    expect(shown()).toBe(true);
  });

  // A tall screen opens with the price card's button already in view.
  it('waits while the price card button is on screen', () => {
    const { price, closing, io, shown } = setUp();
    io.report([price, true, 700], [closing, false, 1790]);
    expect(shown()).toBe(false);
    // Scrolled past it: the bar takes over.
    io.report([price, false, -60]);
    expect(shown()).toBe(true);
  });

  // From the closing panel on, the page's own button and then the footer
  // are what is on screen: the bar does not come back over them.
  it('goes for good once the closing panel button has been passed', () => {
    const { price, closing, io, shown } = setUp();
    io.report([price, false, -400], [closing, false, 500]);
    expect(shown()).toBe(true);
    io.report([closing, true, 300]);
    expect(shown()).toBe(false);
    io.report([closing, false, -40]);
    expect(shown()).toBe(false);
    // Back up the page, past the closing panel again: the bar returns.
    io.report([closing, true, 200]);
    expect(shown()).toBe(false);
    io.report([closing, false, 700]);
    expect(shown()).toBe(true);
  });

  // Either button in view is enough to stand the bar down, whichever came
  // first in one report.
  it('stays down while either button is on screen', () => {
    const { price, closing, io, shown } = setUp();
    io.report([price, true, 500], [closing, true, 900]);
    expect(shown()).toBe(false);
    io.report([price, false, -50]);
    expect(shown()).toBe(false);
  });
});
