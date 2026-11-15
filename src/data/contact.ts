// The gmail stays: it's already printed on her Instagram cards and captions,
// so moving to concierge@ would orphan all of it. Forward concierge@ here
// first, swap later.
//
// No phone number. The only one she ever published is a Hawaii number from
// her old operation.

export const CONTACT = {
  email: 'losangelesluxurytour@gmail.com',
  lineId: '@153cqwqp',
  // LINE strips the leading @ in the add-friend URL.
  lineUrl: 'https://line.me/R/ti/p/@153cqwqp',
  instagram: 'https://www.instagram.com/losangelesluxurytour/',
  instagramHandle: '@losangelesluxurytour',
  // She asked for a Facebook icon in the footer (2026-11-05). The page URL is
  // hers to give; the icon renders once this is set.
  facebook: '' as string,
  /** Both handled by worker/index.ts; see SUBMISSIONS there. */
  formEndpoint: '/api/inquiry',
  bookingEndpoint: '/api/booking',
} as const;
