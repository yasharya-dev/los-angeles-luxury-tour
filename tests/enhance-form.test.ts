// The forms' script, on a hand-built stand-in for the page: the suite runs
// in node, with no browser and no DOM library. What it holds is the order a
// send does things in, which only a browser test could otherwise see:
// Safari stops a smooth scroll when the page grows above it, so every error
// mark has to be shown before the one scroll to the first field.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  textContent = '';
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
});
