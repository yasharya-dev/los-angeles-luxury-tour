import type { APIRoute } from 'astro';
import { locales } from '../i18n/ui';
import { localizePath } from '../i18n/utils';
import { journeys } from '../data/journeys';

// Hand-rolled over @astrojs/sitemap so every URL declares its locale
// alternate. Without those, Google reads EN and JA as competing duplicates.
const SITE = 'https://losangelesluxurytour.com';

const paths = [
  '/',
  '/experience',
  ...journeys.map((j) => `/experience/${j.slug}`),
  '/about',
  '/contact',
  '/privacy',
];

export const GET: APIRoute = () => {
  const urls = locales
    .flatMap((locale) =>
      paths.map((path) => {
        const loc = SITE + localizePath(path, locale);
        const alts = locales
          .map(
            (alt) =>
              `    <xhtml:link rel="alternate" hreflang="${alt}" href="${SITE + localizePath(path, alt)}"/>`,
          )
          .join('\n');
        return (
          `  <url>\n` +
          `    <loc>${loc}</loc>\n` +
          `${alts}\n` +
          `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE + localizePath(path, 'en')}"/>\n` +
          `  </url>`
        );
      }),
    )
    .join('\n');

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n` +
    `        xmlns:xhtml="http://www.w3.org/1999/xhtml">\n` +
    `${urls}\n` +
    `</urlset>\n`;

  return new Response(xml, {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
};
