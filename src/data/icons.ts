// The site's one icon set: line icons drawn on a 24px grid at one stroke
// weight, so every icon on a page reads as the same hand. Rendered by
// components/Icon.astro; kept here so a view can type an icon name.

export const ICONS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  'chevron-right': '<path d="M9.5 6l6 6-6 6"/>',
  'chevron-down': '<path d="M6 9.5l6 6 6-6"/>',
  'arrow-right': '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  'check-circle': '<circle cx="12" cy="12" r="8.5"/><path d="M8.2 12.3l2.6 2.6 5-5.4"/>',

  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.6 7.2l8.4 6 8.4-6"/>',
  instagram:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="4.6"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1" fill="currentColor" stroke="none"/>',
  facebook:
    '<circle cx="12" cy="12" r="9"/><path d="M13.4 20.8V10.1a2.3 2.3 0 0 1 2.3-2.3h1.1M10.3 12.9h5.5"/>',
  // A speech bubble with a tail. The word next to it says which app.
  line: '<path d="M4 11.2C4 7.2 7.6 4 12 4s8 3.2 8 7.2-3.6 7.2-8 7.2c-.9 0-1.7-.1-2.5-.3L6 20l.8-3.1C5.1 15.6 4 13.5 4 11.2z"/>',

  chat: '<path d="M5.5 5.5h13A1.5 1.5 0 0 1 20 7v8.5a1.5 1.5 0 0 1-1.5 1.5H12l-4.5 3.3V17h-2A1.5 1.5 0 0 1 4 15.5V7a1.5 1.5 0 0 1 1.5-1.5z"/><circle cx="8.6" cy="11.3" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="11.3" r="1" fill="currentColor" stroke="none"/><circle cx="15.4" cy="11.3" r="1" fill="currentColor" stroke="none"/>',
  doc: '<path d="M7 3.5h7.5l4 4V19a1.5 1.5 0 0 1-1.5 1.5H7A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z"/><path d="M14.5 3.5v4h4M8.8 12.2h6.4M8.8 15.7h4.4"/>',
  calendar:
    '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.6h17M8 3v4M16 3v4"/>',
  // Drawn nose-up, then turned to climb to the upper right.
  plane:
    '<path transform="rotate(45 12 12)" d="M12 2.8c.8 0 1.3 1 1.3 2.3V10l6.4 4.2v1.7l-6.4-1.9v4l1.9 1.5v1.4L12 20l-3.2.9v-1.4l1.9-1.5v-4l-6.4 1.9v-1.7L10.7 10V5.1c0-1.3.5-2.3 1.3-2.3z"/>',

  users:
    '<circle cx="9" cy="8.3" r="3.1"/><path d="M3.3 19.5v-.7a5 5 0 0 1 5-5h1.4a5 5 0 0 1 5 5v.7M15.3 5.4a3.1 3.1 0 0 1 0 5.8M17.7 14.2a5 5 0 0 1 3 4.6v.7"/>',
  // Front view: roof, body, two lamps, two wheels.
  car: '<path d="M6.4 10l1.3-3.5a1.5 1.5 0 0 1 1.4-1h5.8a1.5 1.5 0 0 1 1.4 1l1.3 3.5"/><rect x="4" y="10" width="16" height="6.2" rx="1.6"/><circle cx="7.4" cy="13.1" r="1" fill="currentColor" stroke="none"/><circle cx="16.6" cy="13.1" r="1" fill="currentColor" stroke="none"/><path d="M6 16.2v1.6a.8.8 0 0 0 .8.8h1a.8.8 0 0 0 .8-.8v-1.6M15.4 16.2v1.6a.8.8 0 0 0 .8.8h1a.8.8 0 0 0 .8-.8v-1.6"/>',
  map: '<path d="M3.5 6.4l5.5-2 6 2 5.5-2v13.2l-5.5 2-6-2-5.5 2zM9 4.4v13.2M15 6.4v13.2"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-10.5a6.5 6.5 0 0 1 13 0C18.5 15.4 12 21 12 21z"/><circle cx="12" cy="10.4" r="2.3"/>',
} as const;


export type IconName = keyof typeof ICONS;
