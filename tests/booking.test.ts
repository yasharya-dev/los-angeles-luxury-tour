import { describe, expect, it } from 'vitest';
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

describe('guestOptions', () => {
  it('offers her plan’s capacity and her five-or-more choice', () => {
    expect(guestOptions('dodgers-transfer').map((g) => g.value)).toEqual(['1', '2', '3', '4', 'over']);
  });

  it('offers the general list for every other plan, in both languages', () => {
    for (const o of offerings) {
      if (plans.some((p) => p.slug === o.id)) continue;
      const list = guestOptions(o.id);
      expect(list.map((g) => g.value), o.id).toEqual(['1', '2', '3', '4', '5', '6+']);
      for (const g of list) expect(g.label.en && g.label.ja, o.id).toBeTruthy();
    }
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
