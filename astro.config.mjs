// @ts-check
import { defineConfig } from 'astro/config';

// Fully pre-rendered. The only dynamic surface is the
// inquiry form, which POSTs to a Worker route defined in wrangler.jsonc.
export default defineConfig({
  site: 'https://losangelesluxurytour.com',
  output: 'static',
  trailingSlash: 'never',

  // A third locale is a line here plus one dictionary file.
    i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ja'],
    routing: {
      prefixDefaultLocale: false,
      redirectToDefaultLocale: false,
    },
  },

  build: {
    // about.html rather than about/index.html. Cloudflare's 404-page mode
    // looks for files named 404.html walking up from the request, so this is
    // what puts the Japanese one at ja/404.html where /ja/* can find it. The
    // URL shape is unchanged: wrangler.jsonc serves both layouts at /about.
    format: 'file',
    // One stylesheet: the CSS is almost entirely shared, so per-page
    // inlining would duplicate it 18 times.
    inlineStylesheets: 'never',
  },

  image: {
    // Hero images are large photographic JPEGs; keep quality high enough that
    // gold type over them stays clean.
    responsiveStyles: true,
  },
});
