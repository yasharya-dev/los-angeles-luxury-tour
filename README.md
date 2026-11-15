# Los Angeles Luxury Tour

[![CI](https://github.com/yasharya-dev/los-angeles-luxury-tour/actions/workflows/ci.yml/badge.svg)](https://github.com/yasharya-dev/los-angeles-luxury-tour/actions/workflows/ci.yml)

The website for [Los Angeles Luxury Tour](https://www.instagram.com/losangelesluxurytour/), a private travel service for Japanese visitors to Los Angeles. Bilingual, Japanese first, and built as a funnel to two forms, a booking request and a consultation, rather than a catalogue: the owner sells in conversation, and the site's job is to make the service credible and get people to write.

Currently in private review behind a password gate. Public launch follows once she has settled the final plan names and prices.

## Stack

| | |
| --- | --- |
| Framework | [Astro](https://astro.build) 7, fully static output, TypeScript strict |
| UI | None. No React, no Tailwind, no component library. Scoped `<style>` per component |
| Hosting | Cloudflare Workers with static assets, free tier |
| Email | [Resend](https://resend.com), called from a small Worker |
| Tests | Vitest, most of it against the built `dist/` |

The Worker exists for one reason: Cloudflare's free tier has no outbound email. Email Routing is receive-only and the free MailChannels integration is gone, so `POST /api/inquiry` and `POST /api/booking` validate the form, drop honeypot hits, optionally verify Turnstile, and hand the message to Resend. Everything else is a static file.

## Layout

```
src/
  data/         offerings, journeys, plans (the owner's plan format), contact details. Content lives here, not in templates
  i18n/         locale list, dictionaries, path helpers
  views/        one component per page, holding both languages' copy
  pages/        thin route files: English at the root, Japanese under /ja/
  components/   header, footer, the two forms, toggles, the icon and photo components
  styles/       tokens.css (the design tokens) and base.css (reset and utilities)
worker/         the two form endpoints and the beta gate
tests/          the suite, see below
```

Adding an offering is a data change in `src/data/offerings.ts`. It appears on the landing page, the experience page and in both forms' plan selects without touching a template. Adding a locale is a config entry plus a dictionary; no new markup.

## Decisions worth knowing

**Japanese is authored, not translated.** Both languages were written from the owner's own published copy, so her set phrases appear verbatim. Japanese headings carry authored line breaks (arrays joined with `<br>`), because Japanese has no spaces and automatic wrapping lands mid-clause. Japanese text is never italic, never uppercased, and sets `line-break: strict` so the long-vowel mark stays off the start of a line. Every `html[lang='ja']` rule in the CSS exists for one of these.

**Path-based i18n.** English at `/about`, Japanese at `/ja/about`, with `hreflang` alternates and a hand-rolled sitemap so every page in every language is a real, indexable URL. Not a client-side string swap.

**Cream by default, dark by choice.** The owner's palette is the default theme for every visitor, on `:root`: `#191919` ink on `#FAF9F6`, with `#F2F0E9` for alternating sections and `#B18A3A` as the accent. The dark theme is an opt-in from the toggle, never read from the device, so the site opens the way she designed it.

**Plates.** The header, the footer, a photograph with text on it and the reservation panel are black in both themes. Rather than hard-code light colours on each, they carry one class, `.plate`, which gives everything inside it the dark theme's token values. A component on a plate uses the same tokens as one on the page, and a focus ring or a link inside it comes out in the bright gold by itself.

**The gold rule.** Her accent `#B18A3A` measures 3.0:1 on the cream and 2.8:1 on the alternate surface: enough for an ornament, not for text, and not for an icon or an edge that has to be seen. So gold is two tokens: `--gold-deco` for decoration and the CTA fill, and `--gold-text`, a darker `#806419`, for anything that carries meaning. The solid CTA sets ink on the gold, because white on it is 3.2:1, and has a darker edge so its boundary clears 3:1. A test computes these ratios out of the built CSS rather than asserting a hex, because an earlier hex-equality test passed happily while the value measured 4.37:1.

**One row of header, nothing floating.** Logo, language link, and the way to the pages: a menu under 800px, links in the bar from there. The menu is a `<details>` inside its own `<nav>`, so it opens without JavaScript; a small script adds Escape, tap-outside, and closing when focus leaves it or the viewport grows.

**Every URL built from the current page goes through `pagePath()`.** The build writes `about.html`, and while it does Astro reports the page's path as `/about.html`; in dev it reports `/about`. Using the reported path directly gave a canonical, alternates and a language link that were right locally and wrong in production.

**Photos go through one component.** `Photo.astro` emits AVIF, WebP and a JPEG fallback at a ladder of widths, each format at its own quality so the AVIF really is the smallest, lazy below the fold and prioritized for the image a page opens on. Its `sizes` has to say how wide the photo is drawn, which for a landscape photo filling a tall phone hero is wider than the screen.

**URLs have no trailing slash, on both sides.** Astro builds with `trailingSlash: 'never'` and `build.format: 'file'`; the assets binding serves with `drop-trailing-slash` and `404-page`. A test fails if the two configs stop agreeing, because when they did, every page answered with a redirect and Japanese visitors got the English 404.

**Prices are floors.** Every price carries a from-form. Yen figures on the Japanese pages are converted at a printed rate; English pages show dollars only.

**Every offering has two paths.** Each plan card offers booking and consultation, with the plan carried through as `?service=` to a select built from the same data. A booking is a request: the owner checks availability and confirms, normally within 24 hours, and the pages say so in her words. The site is the one place to book; the owner's older third-party forms are not linked. A test checks both links on every card in both languages.

**No phone number.** Deliberate, and the owner's instruction.

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

`npm run preview` is the one that matters before a deploy. `astro dev` never goes through the assets binding and has no Worker at all, and four of the defects in this repo's history were only visible through the real thing.

To test the forms for real locally, copy `.dev.vars.example` to `.dev.vars`, put a Resend sending-only key in `RESEND_API_KEY` and your own address in `INQUIRY_TO`, then `npm run preview`. Without the key, every submit takes the send-failure path, and the success path never runs.

## Tests

| File | Guards |
| --- | --- |
| `tests/build.test.ts` | Every route in both locales; the canonical, alternates and language link of every page, by value; no English nav on Japanese pages, yen on Japanese pages only, offering and FAQ parity; the palette, with contrast computed for text, the CTA and control edges in both themes; cream as the default theme; the header, menu and footer; photo formats, priority and file sizes; both paths on every card, the booking notice, no phone number, sitemap and robots |
| `tests/data.test.ts` | Unique ids and slugs, full bilingual coverage, every price a floor, every plan books and consults on the site |
| `tests/i18n.test.ts` | Path helpers, including the build's `.html` paths, and dictionary key parity |
| `tests/config.test.ts` | Astro and Cloudflare agree about the URL shape |
| `tests/worker.test.ts` | Input cleaning, HTML escaping, plan labels, redirect paths, and both endpoints driven end to end with Resend stubbed |
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

The client's source material, the research behind the copy, and the working notes are kept outside the repo.
