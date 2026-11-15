// The site's one icon set: line icons drawn on a 24px grid at one stroke
// weight, so every icon on a page reads as the same hand. Rendered by
// components/Icon.astro; kept here so a view can type an icon name.

export const ICONS = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  'chevron-right': '<path d="M9.5 6l6 6-6 6"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.6 7.2l8.4 6 8.4-6"/>',
  instagram:
    '<rect x="3.5" y="3.5" width="17" height="17" rx="4.6"/><circle cx="12" cy="12" r="4"/><circle cx="17" cy="7" r="1" fill="currentColor" stroke="none"/>',
  facebook:
    '<circle cx="12" cy="12" r="9"/><path d="M13.4 20.8V10.1a2.3 2.3 0 0 1 2.3-2.3h1.1M10.3 12.9h5.5"/>',
} as const;

export type IconName = keyof typeof ICONS;
