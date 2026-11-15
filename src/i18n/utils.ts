import { defaultLocale, locales, ui, type Locale, type UIKey } from './ui';

export function useTranslations(locale: Locale) {
  return function t(key: UIKey): string {
    return (ui[locale] as Record<string, string>)[key] ?? ui[defaultLocale][key];
  };
}

/**
 * The page's public path, from the path Astro reports for it.
 *
 * The build writes about.html rather than about/index.html (astro.config:
 * build.format 'file'), and while it does, `Astro.url.pathname` is the path of
 * the file being written: /about.html, /ja.html, /index.html. In `astro dev`
 * the same value is the clean /about. Anything that builds a URL from the
 * current page (the canonical, the alternates, the language link, the
 * current-page mark) has to go through this, or it is right in dev and wrong
 * in production.
 */
export function pagePath(pathname: string): string {
  const clean = pathname
    .replace(/\.html$/, '')
    .replace(/\/index$/, '')
    .replace(/\/+$/, '');
  return clean === '' ? '/' : clean;
}

export function localeFromPath(pathname: string): Locale {
  const seg = pathname.split('/').filter(Boolean)[0];
  return (locales as readonly string[]).includes(seg ?? '')
    ? (seg as Locale)
    : defaultLocale;
}

// English sits at the root, everything else is prefixed.
export function localizePath(path: string, locale: Locale): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  if (locale === defaultLocale) return clean;
  return clean === '/' ? `/${locale}` : `/${locale}${clean}`;
}

// Same page, other locale. Used by the language toggle and the hreflang tags.
export function alternatePath(pathname: string, target: Locale): string {
  const current = localeFromPath(pathname);
  let bare = pathname;
  if (current !== defaultLocale) {
    bare = pathname.replace(new RegExp(`^/${current}(?=/|$)`), '') || '/';
  }
  return localizePath(bare, target);
}
