import { defaultLocale, locales, ui, type Locale, type UIKey } from './ui';

export function useTranslations(locale: Locale) {
  return function t(key: UIKey): string {
    return (ui[locale] as Record<string, string>)[key] ?? ui[defaultLocale][key];
  };
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
