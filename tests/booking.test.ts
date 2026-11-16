import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { threeYearsOn, todayInLA } from '../src/data/calendar';
import {
  checkBooking,
  formatDate,
  guestOptions,
  isDate,
  receivedQuery,
  summary,
} from '../src/data/booking';
import { offerings } from '../src/data/offerings';
import { plans } from '../src/data/plans';

// A request is refused before today in Los Angeles, and the fixtures are
// dated 2027: on the real clock this file would start failing as those days
// pass, and npm run deploy with it. The clock is pinned to the day these were
// written; a test about the clock sets its own.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-15T20:00:00Z'));
});
afterEach(() => {
  vi.useRealTimers();
});

const transfer = {
  service: 'dodgers-transfer',
  type: 'one-way',
  route: 'to-stadium',
  date: '2027-04-10',
  guests: '2',
};

describe('checkBooking', () => {
  it('accepts a request made of the plan’s own choices', () => {
    expect(checkBooking(transfer)).toEqual({ ok: true, booking: transfer });
  });

  it('drops what does not apply: a route on a round trip, a choice on a plan without one', () => {
    const round = checkBooking({ ...transfer, type: 'round-trip' });
    expect(round.ok && round.booking.route).toBe('');
    const plain = checkBooking({ service: 'temecula', type: 'x', route: 'y', date: '2027-01-05', guests: '6+' });
    expect(plain).toEqual({
      ok: true,
      booking: { service: 'temecula', type: '', route: '', date: '2027-01-05', guests: '6+' },
    });
  });

  it('names what is wrong', () => {
    expect(checkBooking({ ...transfer, service: 'x' })).toEqual({ ok: false, problem: 'service' });
    expect(checkBooking({ ...transfer, type: '' })).toEqual({ ok: false, problem: 'type' });
    expect(checkBooking({ ...transfer, route: 'x' })).toEqual({ ok: false, problem: 'route' });
    expect(checkBooking({ ...transfer, date: '10/04/2027' })).toEqual({ ok: false, problem: 'date' });
    // A date that has passed everywhere is not a request anyone can make.
    expect(checkBooking({ ...transfer, date: '2001-01-01' })).toEqual({ ok: false, problem: 'date' });
    expect(checkBooking({ ...transfer, guests: '5' })).toEqual({ ok: false, problem: 'guests' });
  });
});

describe('the dates a request can name', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts at today in Los Angeles, not yesterday in UTC', () => {
    // 23:50 UTC on the 15th is 15:50 on the 15th in Los Angeles. The 14th is
    // over everywhere, but yesterday in UTC, the old floor, let it through.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T23:50:00Z'));
    expect(todayInLA()).toBe('2026-11-15');
    expect(checkBooking({ ...transfer, date: '2026-11-14' })).toEqual({ ok: false, problem: 'date' });
    expect(checkBooking({ ...transfer, date: '2026-11-15' }).ok).toBe(true);
    // 07:30 UTC on the 16th is still the 15th in Los Angeles.
    vi.setSystemTime(new Date('2026-11-16T07:30:00Z'));
    expect(todayInLA()).toBe('2026-11-15');
    expect(checkBooking({ ...transfer, date: '2026-11-15' }).ok).toBe(true);
  });

  it('reads the Los Angeles date across the clock change', () => {
    // Either side of a clock change: 23:59 PST on 7 March, 23:59 PDT on 31
    // October, 00:30 PST on 2 November.
    expect(todayInLA(new Date('2026-03-08T07:59:00Z'))).toBe('2026-03-07');
    expect(todayInLA(new Date('2026-11-01T06:59:00Z'))).toBe('2026-10-31');
    expect(todayInLA(new Date('2026-11-02T08:30:00Z'))).toBe('2026-11-02');
  });

  it('ends three years on, on a real date', () => {
    expect(threeYearsOn('2026-11-15')).toBe('2029-11-15');
    expect(threeYearsOn('2028-02-29')).toBe('2031-02-28');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-15T20:00:00Z'));
    expect(checkBooking({ ...transfer, date: '2029-11-15' }).ok).toBe(true);
    expect(checkBooking({ ...transfer, date: '2029-11-16' })).toEqual({ ok: false, problem: 'date' });
  });
});

describe('guestOptions', () => {
  it('offers her plan’s capacity and her five-or-more choice', () => {
    expect(guestOptions('dodgers-transfer').map((g) => g.value)).toEqual(['1', '2', '3', '4', 'over']);
  });

  it('offers the general list for every other plan, in both languages', () => {
    for (const o of offerings) {
      if (plans.some((p) => p.slug === o.id)) continue;
      const list = guestOptions(o.id);
      const all = ['1', '2', '3', '4', '5', '6+'];
      const from = all.filter((v) => v === '6+' || Number(v) >= (o.minGuests ?? 1));
      expect(list.map((g) => g.value), o.id).toEqual(from);
      for (const g of list) expect(g.label.en && g.label.ja, o.id).toBeTruthy();
    }
  });

  it('starts where the price does: the mansion dinner is for two and up', () => {
    expect(guestOptions('mansion-dinner').map((g) => g.value)).toEqual(['2', '3', '4', '5', '6+']);
    expect(
      checkBooking({ service: 'mansion-dinner', date: '2027-04-10', guests: '1' }),
    ).toEqual({ ok: false, problem: 'guests' });
  });
});

describe('dates', () => {
  it('accepts a real calendar date and nothing else', () => {
    expect(isDate('2028-02-29')).toBe(true);
    for (const bad of ['2027-02-29', '2027-13-01', '2027-1-5', '', 'tomorrow']) {
      expect(isDate(bad), bad).toBe(false);
    }
  });

  it('reads a date back with its weekday, so a day ahead in Japan shows', () => {
    expect(formatDate('2027-04-10', 'ja')).toBe('2027年4月10日（土）');
    expect(formatDate('2027-04-10', 'en')).toBe('Saturday, April 10, 2027');
  });
});

describe('summary', () => {
  it('reads her rows back, the route only where there is one', () => {
    expect(summary(checkOk(transfer), 'ja')).toEqual({
      title: 'お申し込み内容',
      plan: 'ドジャース観戦 プライベート送迎',
      rows: [
        { label: '送迎タイプ', value: '片道送迎' },
        { label: '送迎区間', value: 'ホテル → スタジアム' },
        { label: 'ご利用日', value: '2027年4月10日（土）' },
        { label: '人数', value: '2名様' },
      ],
    });
    const round = summary(checkOk({ ...transfer, type: 'round-trip' }), 'en');
    expect(round.rows.map((r) => r.label)).toEqual(['Transfer', 'Date', 'Guests']);
  });

  it('puts nothing in the address but the checked values', () => {
    expect(receivedQuery(checkOk({ ...transfer, type: 'round-trip' }))).toBe(
      'service=dodgers-transfer&type=round-trip&date=2027-04-10&guests=2',
    );
  });
});

function checkOk(input: Record<string, string>) {
  const result = checkBooking(input);
  if (!result.ok) throw new Error(result.problem);
  return result.booking;
}
