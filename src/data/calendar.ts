// The calendar a booking runs on: Los Angeles, where every plan takes place.
// The form's script and the Worker both use it, so they agree on which dates
// can be asked for. It imports nothing, to stay small in the page's script.

const ZONE = 'America/Los_Angeles';

/** Today in Los Angeles, as YYYY-MM-DD: the earliest date a request can name. */
export function todayInLA(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((p) => p.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** The same date three years on: as far ahead as a request can sensibly be
    made. A 29 February becomes the 28th, so the result is a real date. */
export function threeYearsOn(date: string): string {
  const rest = date.slice(4);
  return `${Number(date.slice(0, 4)) + 3}${rest === '-02-29' ? '-02-28' : rest}`;
}
