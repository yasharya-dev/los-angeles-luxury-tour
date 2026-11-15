// The site's one icon set: line icons drawn on a 24px grid at one stroke
// weight, so every icon on a page reads as the same hand. Rendered by
// components/Icon.astro; kept here so a view can type an icon name.

export const ICONS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  'chevron-right': '<path d="M9.5 6l6 6-6 6"/>',
  'chevron-down': '<path d="M6 9.5l6 6 6-6"/>',
  'arrow-right': '<path d="M4.5 12h15M13.5 6l6 6-6 6"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.6 7.2l8.4 6 8.4-6"/>',
  instagram:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="4.6"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1" fill="currentColor" stroke="none"/>',
  facebook:
    '<circle cx="12" cy="12" r="9"/><path d="M13.4 20.8V10.1a2.3 2.3 0 0 1 2.3-2.3h1.1M10.3 12.9h5.5"/>',

  calendar:
    '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 9.6h17M8 3v4M16 3v4"/>',
  users:
    '<circle cx="9" cy="8.3" r="3.1"/><path d="M3.3 19.5v-.7a5 5 0 0 1 5-5h1.4a5 5 0 0 1 5 5v.7M15.3 5.4a3.1 3.1 0 0 1 0 5.8M17.7 14.2a5 5 0 0 1 3 4.6v.7"/>',
  // Front view: roof, body, two lamps, two wheels.
  car: '<path d="M6.4 10l1.3-3.5a1.5 1.5 0 0 1 1.4-1h5.8a1.5 1.5 0 0 1 1.4 1l1.3 3.5"/><rect x="4" y="10" width="16" height="6.2" rx="1.6"/><circle cx="7.4" cy="13.1" r="1" fill="currentColor" stroke="none"/><circle cx="16.6" cy="13.1" r="1" fill="currentColor" stroke="none"/><path d="M6 16.2v1.6a.8.8 0 0 0 .8.8h1a.8.8 0 0 0 .8-.8v-1.6M15.4 16.2v1.6a.8.8 0 0 0 .8.8h1a.8.8 0 0 0 .8-.8v-1.6"/>',
  map: '<path d="M3.5 6.4l5.5-2 6 2 5.5-2v13.2l-5.5 2-6-2-5.5 2zM9 4.4v13.2M15 6.4v13.2"/>',
} as const;

export type IconName = keyof typeof ICONS;
