# Los Angeles Luxury Tour

[![CI](https://github.com/yasharya-dev/los-angeles-luxury-tour/actions/workflows/ci.yml/badge.svg)](https://github.com/yasharya-dev/los-angeles-luxury-tour/actions/workflows/ci.yml)

The website for [Los Angeles Luxury Tour](https://www.instagram.com/losangelesluxurytour/), a one-person private travel service for Japanese visitors to Los Angeles. Bilingual, Japanese first, and built as a funnel to one contact form rather than a catalogue: the owner sells in conversation, and the site's job is to make her credible and get people to write to her.

Currently in private review behind a password gate. Public launch follows once she has settled the final plan names and prices.

## Stack

| | |
| --- | --- |
| Framework | [Astro](https://astro.build) 7, fully static output, TypeScript strict |
| UI | None. No React, no Tailwind, no component library. Scoped `<style>` per component |
| Hosting | Cloudflare Workers with static assets, free tier |
| Email | [Resend](https://resend.com), called from a small Worker |
| Tests | Vitest, most of it against the built `dist/` |

The Worker exists for one reason: Cloudflare's free tier has no outbound email. Email Routing is receive-only and the free MailChannels integration is gone, so `POST /api/inquiry` validates the form, drops honeypot hits, optionally verifies Turnstile, and hands the message to Resend. Everything else is a static file.

## Layout

```
src/
  data/         offerings, journeys, contact details. Content lives here, not in templates
  i18n/         locale list, dictionaries, path helpers
  views/        one component per page, holding both languages' copy
  pages/        thin route files: English at the root, Japanese under /ja/
  components/   header, footer, contact form, toggles
  styles/       tokens.css (the design tokens) and base.css (reset and utilities)
worker/         the inquiry endpoint and the beta gate
tests/          the suite, see below
```

Adding an offering is a data change in `src/data/offerings.ts`. It appears on the landing page, the experience page and in the contact form's plan select without touching a template. Adding a locale is a config entry plus a dictionary; no new markup.

## Decisions worth knowing

**Japanese is authored, not translated.** Both languages were written from the owner's own published copy, so her set phrases appear verbatim. Japanese headings carry authored line breaks (arrays joined with `<br>`), because Japanese has no spaces and automatic wrapping lands mid-clause. Japanese text is never italic, never uppercased, and sets `line-break: strict` so the long-vowel mark stays off the start of a line. Every `html[lang='ja']` rule in the CSS exists for one of these.

**Path-based i18n.** English at `/about`, Japanese at `/ja/about`, with `hreflang` alternates and a hand-rolled sitemap so every page in every language is a real, indexable URL. Not a client-side string swap.

**The light-theme gold rule.** The brand gold `#D4AF37` is 9.0:1 on the dark background and 2.1:1 on white, which fails AA for text and the 3:1 floor for UI. So gold is two tokens: `--gold-text` for anything that carries meaning, which darkens to `#806419` in the light theme, and `--gold-deco` for decoration, which does not. A test computes the actual contrast ratio out of the built CSS against both light surfaces rather than asserting a hex, because an earlier hex-equality test passed happily while the value measured 4.37:1.

**URLs have no trailing slash, on both sides.** Astro builds with `trailingSlash: 'never'` and `build.format: 'file'`; the assets binding serves with `drop-trailing-slash` and `404-page`. A test fails if the two configs stop agreeing, because when they did, every page answered with a redirect and Japanese visitors got the English 404.

**Prices are floors.** Every price carries a from-form. Yen figures on the Japanese pages are converted at a printed rate; English pages show dollars only.

**Every offering has somewhere to go.** Plans with a matching booking form link to it. The rest link to the contact form with the plan carried through as `?service=`, where a select built from the same data is pre-selected. Nothing renders with nothing to click, and a test checks that on every card in both languages.

**No phone number, one person.** Both are deliberate and both are the owner's instruction.

## Running it

Node 22 or later.

```bash
npm install
npm run dev        # astro dev on :4321
npm run check      # astro check, kept at 0 errors
npm test           # astro build, then the suite against dist/
npm run test:unit  # the suite without a build
npm run preview    # wrangler dev: the built site through the real Worker
npm run deploy     # astro build && wrangler deploy
```

`npm run preview` is the one that matters before a deploy. `astro dev` never goes through the assets binding, and two of the defects in this repo's history were only visible through it.

## Tests

| File | Guards |
| --- | --- |
| `tests/build.test.ts` | Every route in both locales, `lang` and reciprocal `hreflang`, no English nav on Japanese pages, yen on Japanese pages only, offering and FAQ parity, the gold contrast maths, every offering has an action, no phone number, sitemap and robots |
| `tests/data.test.ts` | Unique ids and slugs, full bilingual coverage, every price a floor, every booking link a real form |
| `tests/i18n.test.ts` | Path helpers and dictionary key parity |
| `tests/config.test.ts` | Astro and Cloudflare agree about the URL shape |
| `tests/worker.test.ts` | Input cleaning, HTML escaping, plan labels, redirect paths |
| `tests/beta.test.ts` | The gate: cookie signing, open-redirect guard, `noindex`, the page itself |

## The beta gate

A `BETA_PASSWORD` secret on the Worker. **Absent means the site is public**, so production is the default and the gate is the exception. With the secret set, every request without a valid cookie gets a Japanese-first password page and a `401`; everything behind it carries `X-Robots-Tag: noindex, nofollow`. The cookie is an HMAC keyed by the password, so the password is never stored in the browser and rotating it invalidates every cookie.

Going public is `wrangler secret delete BETA_PASSWORD`, not a deploy.

`run_worker_first` on the assets binding is what makes this work. Without it Cloudflare serves matching static assets without calling the Worker, and the gate never sees them.

## Configuration and secrets

Public vars live in `wrangler.jsonc`. Secrets never touch the repo:

```bash
npx wrangler secret put RESEND_API_KEY
npx wrangler secret put BETA_PASSWORD         # optional, see above
npx wrangler secret put TURNSTILE_SECRET_KEY  # optional
```

For local development, copy `.dev.vars.example` to `.dev.vars`; it is gitignored. `PUBLIC_TURNSTILE_SITE_KEY` is a build-time variable, documented in `.env.example`; leave it unset and the widget does not render and the Worker skips verification.

## What is not here

The client's source material, the research behind the copy, and the working notes are kept outside the repo. The nine photographs in `src/assets/` are the complete set; the site is roughly three parts type and space to one part photography, on purpose.
