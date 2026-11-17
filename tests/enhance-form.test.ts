// The forms' script, on a hand-built stand-in for the page: the suite runs
// in node, with no browser and no DOM library. What it holds is the order a
// send does things in, which only a browser test could otherwise see:
// Safari stops a smooth scroll when the page grows above it, so every error
// mark has to be shown before the one scroll to the first field.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SEND_DEADLINE } from '../src/data/deadlines';
import { enhanceForm } from '../src/scripts/enhance-form';

type Handler = (event: { preventDefault(): void; target?: unknown }) => unknown;

/** Just enough of an element for the script: attributes, classes, a parent. */
class El {
  tag: string;
  id = '';
  name = '';
  type = '';
  value = '';
  required = false;
  disabled = false;
  checked = false;
  hidden = false;
  min = '';
  max = '';
  noValidate = false;
  action = '/api/booking';
  /** Text of its own; the DOM's textContent below adds the children's. */
  text = '';
  dataset: Record<string, string> = {};
  attrs = new Map<string, string>();
  classes = new Set<string>();
  children: El[] = [];
  parent?: El;
  handlers = new Map<string, Handler>();

  constructor(tag: string, props: Partial<El> & { cls?: string[]; data?: Record<string, string> } = {}) {
    this.tag = tag;
    const { cls = [], data = {}, ...rest } = props;
    Object.assign(this, rest);
    cls.forEach((c) => this.classes.add(c));
    Object.assign(this.dataset, data);
  }
  add(...kids: El[]): this {
    for (const kid of kids) {
      kid.parent = this;
      this.children.push(kid);
    }
    return this;
  }
  /** As in the DOM: setting it replaces every child with the text. */
  get textContent(): string {
    return this.text + this.children.map((kid) => kid.textContent).join('');
  }
  set textContent(value: string) {
    this.children = [];
    this.text = value;
  }
  /** Every element under this one, in page order. */
  all(): El[] {
    return this.children.flatMap((kid) => [kid, ...kid.all()]);
  }
  attr(name: string): string | null {
    if (name === 'required') return this.required ? '' : null;
    if (name === 'name' || name === 'type' || name === 'id') return (this[name] as string) || null;
    if (name.startsWith('data-')) {
      const key = name.slice(5).replace(/-(\w)/g, (_, c: string) => c.toUpperCase());
      return key in this.dataset ? this.dataset[key] : null;
    }
    return this.attrs.get(name) ?? null;
  }
  matches(selector: string): boolean {
    return selector.split(',').some((one) => {
      const [, tag = '', rest = ''] = one.trim().match(/^([a-z]*)(.*)$/) ?? [];
      const parts = [...rest.matchAll(/#([\w-]+)|\.([\w-]+)|\[([\w-]+)(?:="([^"]*)")?\]/g)];
      return (
        (!tag || this.tag === tag) &&
        parts.every(([, id, cls, name = '', value]) =>
          id
            ? this.id === id
            : cls
              ? this.classes.has(cls)
              : value !== undefined
                ? this.attr(name) === value
                : this.attr(name) !== null,
        )
      );
    });
  }
  querySelector(selector: string): El | null {
    return this.all().find((el) => el.matches(selector)) ?? null;
  }
  querySelectorAll(selector: string): El[] {
    return this.all().filter((el) => el.matches(selector));
  }
  closest(selector: string): El | null {
    for (let el: El | undefined = this; el; el = el.parent) if (el.matches(selector)) return el;
    return null;
  }
  getAttribute(name: string) {
    return this.attrs.get(name) ?? null;
  }
  setAttribute(name: string, value: string) {
    this.attrs.set(name, String(value));
  }
  removeAttribute(name: string) {
    this.attrs.delete(name);
  }
  get classList() {
    const set = this.classes;
    return {
      toggle: (c: string, on: boolean) => (on ? set.add(c) : set.delete(c), on),
      contains: (c: string) => set.has(c),
    };
  }
  addEventListener(type: string, handler: Handler) {
    this.handlers.set(type, handler);
  }
  checkValidity(): boolean {
    if (this.type === 'radio') {
      const form = this.closest('form');
      return !this.required || !!form?.querySelectorAll(`input[name="${this.name}"]`).some((r) => r.checked);
    }
    if (this.required && this.value === '') return false;
    if (this.type === 'date' && this.value && this.min && this.value < this.min) return false;
    return true;
  }
  scrollIntoView() {
    page.scrolled.push({ to: this, shown: page.lines().filter((line) => !line.hidden).map((line) => line.id) });
  }
  focus() {
    page.focused = this;
  }
}

/** The input class the script tells radios apart by. */
class Input extends El {}

/** The page under test, rebuilt for each test. */
const page = {
  form: new El('form'),
  scrolled: [] as { to: El; shown: string[] }[],
  focused: undefined as El | undefined,
  lines: () => page.form.querySelectorAll('.err, [data-form-error]'),
};

/** Her booking form in miniature: two radios, the date, a name, the sends. */
function build() {
  const form = new El('form');
  const type = new El('fieldset', { cls: ['field', 'choice'] }).add(
    new Input('input', { type: 'radio', name: 'type', value: 'one-way', required: true }),
    new Input('input', { type: 'radio', name: 'type', value: 'round-trip', required: true }),
    new El('p', { id: 'e-type', hidden: true, cls: ['err'] }),
  );
  const date = new El('div', { cls: ['field'] }).add(
    new Input('input', { id: 'f-date', name: 'date', type: 'date', required: true, data: { minToday: '' } }),
    new El('p', { id: 'e-date', hidden: true, cls: ['err'] }),
  );
  const name = new El('div', { cls: ['field'] }).add(
    new Input('input', { id: 'f-name', name: 'name', type: 'text', required: true }),
    new El('p', { id: 'e-name', hidden: true, cls: ['err'] }),
  );
  form.add(
    type,
    date,
    name,
    new El('p', { hidden: true, cls: ['form__err'], data: { formError: '' } }),
    new El('p', { hidden: true, cls: ['form__err'], data: { sendError: '' } }),
    new El('button', { type: 'submit', data: { submit: '', label: 'Send', sending: 'Sending' } }),
  );
  page.form = form;
  page.scrolled = [];
  page.focused = undefined;
  return form;
}

const byId = (id: string) => page.form.all().find((el) => el.id === id) ?? null;
const send = () => page.form.handlers.get('submit')?.({ preventDefault() {}, target: page.form });
const fill = () => {
  page.form.querySelectorAll('input[name="type"]')[1].checked = true;
  (page.form.querySelector('#f-date') as El).value = '2026-12-01';
  (page.form.querySelector('#f-name') as El).value = 'Nao';
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T20:00:00Z'));
  vi.stubGlobal('HTMLInputElement', Input);
  vi.stubGlobal('document', { getElementById: byId });
  vi.stubGlobal('window', { addEventListener() {} });
  vi.stubGlobal('location', { search: '', assign: vi.fn() });
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  vi.stubGlobal('FormData', class {});
  build();
  enhanceForm(page.form as never);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('a send with fields to fix', () => {
  it('shows every mark, then scrolls once, to the first field', async () => {
    await send();
    expect(page.scrolled).toHaveLength(1);
    // The box with the label, for a radio its fieldset.
    expect(page.scrolled[0].to.tag).toBe('fieldset');
    // Every line was already in the page when the scroll began.
    expect(page.scrolled[0].shown.sort()).toEqual(['', 'e-date', 'e-name', 'e-type'].sort());
    expect(page.focused?.name).toBe('type');
  });

  it('scrolls to a later field when the earlier ones are fine', async () => {
    fill();
    (page.form.querySelector('#f-name') as El).value = '';
    vi.stubGlobal('fetch', vi.fn());
    await send();
    expect(page.scrolled).toHaveLength(1);
    expect(page.scrolled[0].to.querySelector('#f-name')).not.toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });

  // A field the Worker refuses: the summary line shows before the scroll
  // too, then the field is marked and brought into view.
  it('marks and shows a field the Worker refused, with the page settled first', async () => {
    fill();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: false, error: 'date' }), { status: 400 })),
    );
    await send();
    expect(page.scrolled).toHaveLength(1);
    expect(page.scrolled[0].to.querySelector('#f-date')).not.toBeNull();
    expect(page.scrolled[0].shown).toEqual(expect.arrayContaining(['', 'e-date']));
    expect(byId('e-date')?.hidden).toBe(false);
  });

  it('goes on to the page the Worker names when the send succeeds', async () => {
    fill();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ ok: true, next: '/ja/book/received?x=1' }))),
    );
    await send();
    expect(location.assign).toHaveBeenCalledWith('/ja/book/received?x=1');
    expect(page.scrolled).toHaveLength(0);
  });
});

// A stalled phone network, or the mail service: a send with no answer would
// otherwise stay on 送信中 for good, with no address to write to instead.
describe('a send that never answers', () => {
  it('fails at the deadline: the failure line, the button back, focus on it', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    fill();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      ),
    );
    const sending = send();
    const button = page.form.querySelector('[data-submit]') as El;
    await vi.advanceTimersByTimeAsync(SEND_DEADLINE - 1);
    expect(button.disabled).toBe(true);
    expect(page.form.querySelector('[data-send-error]')?.hidden).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    await sending;
    expect(page.form.querySelector('[data-send-error]')?.hidden).toBe(false);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe('Send');
    expect(page.focused).toBe(button);
  });
});

// Her booking submit carries an arrow (10B). The script changes the button's
// words, not the whole button, or the arrow would go with them on the first
// send and stay gone.
describe('a submit with an icon', () => {
  it('changes only its words while sending, and puts them back', async () => {
    vi.useFakeTimers({ toFake: ['Date', 'setTimeout', 'clearTimeout'] });
    build();
    const words = new El('span', { data: { submitLabel: '' }, textContent: 'Send' });
    const arrow = new El('svg', { cls: ['icon'] });
    const button = new El('button', {
      type: 'submit',
      data: { submit: '', label: 'Send', sending: 'Sending' },
    }).add(words, arrow);
    const old = page.form.querySelector('[data-submit]') as El;
    page.form.children.splice(page.form.children.indexOf(old), 1, button);
    button.parent = page.form;
    enhanceForm(page.form as never);
    fill();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) =>
            init.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
          ),
      ),
    );
    const sending = send();
    expect(button.textContent).toBe('Sending');
    expect(button.children).toEqual([words, arrow]);
    await vi.advanceTimersByTimeAsync(SEND_DEADLINE);
    await sending;
    expect(button.textContent).toBe('Send');
    expect(button.children).toEqual([words, arrow]);
  });
});

// The check on blur shows a line above the button, which moves it out from
// under a press, and the click then lands on nothing.
describe('a press on Send', () => {
  it('holds back the check on blur, which the send makes anyway', () => {
    const date = page.form.querySelector('#f-date') as El;
    const button = page.form.querySelector('[data-submit]') as El;
    date.value = '2026-11-01'; // before today in Los Angeles
    button.handlers.get('pointerdown')?.({ preventDefault() {} });
    page.form.handlers.get('focusout')?.({ preventDefault() {}, target: date });
    expect(byId('e-date')?.hidden).toBe(true);
  });

  it('leaves the check on blur alone otherwise', () => {
    const date = page.form.querySelector('#f-date') as El;
    date.value = '2026-11-01';
    page.form.handlers.get('focusout')?.({ preventDefault() {}, target: date });
    expect(byId('e-date')?.hidden).toBe(false);
  });
});

// Edge and Chrome read an untouched required field as invalid; the script
// says otherwise from the start. The markup leaves it out (build.test.ts), so
// a visitor without script keeps the browser's own state.
describe('the state a screen reader hears at rest', () => {
  it('reads every required field and every choice as valid until a send', () => {
    const fields = page.form.querySelectorAll('[required], input[type="radio"]');
    expect(fields.length).toBe(4);
    for (const field of fields) expect(field.getAttribute('aria-invalid')).toBe('false');
  });
});

// Midnight in Los Angeles is late afternoon in Japan: a page left open over
// it must not go on offering the day that has just ended.
describe('the dates the picker offers', () => {
  it('starts at today in Los Angeles, and moves on with the clock', async () => {
    const date = page.form.querySelector('#f-date') as El;
    expect([date.min, date.max]).toEqual(['2026-11-15', '2029-11-15']);
    vi.setSystemTime(new Date('2026-11-16T09:00:00Z')); // 01:00 on the 16th there
    date.value = '2026-11-15';
    await send();
    expect(date.min).toBe('2026-11-16');
    expect(byId('e-date')?.hidden).toBe(false);
  });

  it('moves on as the picker opens, too', () => {
    const date = page.form.querySelector('#f-date') as El;
    vi.setSystemTime(new Date('2026-11-16T09:00:00Z'));
    page.form.handlers.get('focusin')?.({ preventDefault() {}, target: date });
    expect(date.min).toBe('2026-11-16');
  });
});
