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
| Japanese line breaking | [BudouX](https://github.com/google/budoux) and `Intl.Segmenter`, at build time only |
| Tests | Vitest, most of it against the built `dist/` |

The Worker exists for one reason: Cloudflare's free tier has no outbound email. Email Routing is receive-only and the free MailChannels integration is gone, so `POST /api/inquiry` and `POST /api/booking` validate the form, drop honeypot hits, optionally verify Turnstile, and hand the message to Resend. Everything else is a static file.

## Layout

```
src/
  data/         offerings, journeys, plans (the owner's plan page, one entry per plan), cancellation terms, contact details. Content lives here, not in templates
  i18n/         locale list, dictionaries, path helpers, and where a line of Japanese may fold
  views/        one component per page, holding both languages' copy
  pages/        thin route files: English at the root, Japanese under /ja/
  components/   header, footer, the two forms, the plan list and its card, toggles, the icon, photo and phrase components
  styles/       tokens.css (the design tokens) and base.css (reset and utilities)
worker/         the two form endpoints and the beta gate
scripts/        og.mjs and icons.mjs: the share image and the tab and home-screen icons, made from the photography and the logo. Their output is committed under public/; rerun one when its source changes
tests/          the suite, see below
```

A plan in the owner's own format is an entry in `src/data/plans.ts` (with a card of the same slug in `offerings.ts`); its page renders entirely from that entry, and a test fails if the page template ever holds plan-specific copy. Her cancellation terms live once, in `src/data/cancellation.ts`, and the FAQ and every plan page read them.

Adding an offering is a data change in `src/data/offerings.ts`. It appears on the landing page, the experience page, the consultation form's select and the booking pages without touching a template. A plan with a `slug` has its own page and its card links there; a plan without one carries a `detail`, which is what its card opens to show. Every card shows the monogram tile until the owner's photograph for the plan arrives. Adding a locale is a config entry plus a dictionary; no new markup.

## Decisions worth knowing

**Japanese is authored, not translated.** Both languages were written from the owner's own published copy, so her set phrases appear verbatim. Japanese text is never italic, never uppercased, and sets `line-break: strict` so the long-vowel mark stays off the start of a line. Every `html[lang='ja']` rule in the CSS exists for one of these.

**Japanese folds at phrases, in every browser.** Japanese has no spaces, so a browser breaks a line between any two characters: a card ends on `ディ` and starts the next line with `ナー`, and a heading strands its last character. Chrome has `word-break: auto-phrase` for this; Safari, which most of this site's visitors use, does not. So the fold points are found at build time (`src/i18n/phrase.ts`) and rendered as `<wbr>` under `word-break: keep-all` (`Phrases.astro`), which keeps the text one run for a screen reader and for find-in-page. A fold has to be both a phrase boundary by BudouX, Google's phrase model, and a word start by ICU's dictionary: BudouX alone now and then cuts inside a word (`空|港送迎`), and the dictionary alone is weak on katakana compounds. Where the owner gave the line breaks herself, the copy is an array of her phrases instead, and `BR` in it is a break she wants at every width. A space she wrote inside a Japanese title is treated the same way: the title folds there and nowhere else.

Those two sources can change under the site: a BudouX release, or a Node upgrade, since ICU's dictionary ships with Node. So every fold on the built site is pinned in `tests/__snapshots__/japanese-folds.txt` and a change shows up as a diff to read, `.nvmrc` holds one exact Node version for CI, and `npm run deploy` runs the suite before it uploads.

**Path-based i18n.** English at `/about`, Japanese at `/ja/about`, with `hreflang` alternates and a hand-rolled sitemap so every page in every language is a real URL. Not a client-side string swap. The pages for search have a canonical and three alternates and are in the sitemap. The two not-found pages, the pages after each form and the per-plan booking forms say `noindex` instead (`Base.astro`'s `noindex`), with no canonical or alternates: the plan pages are what a search should find.

**Cream by default, dark by choice.** The owner's palette is the default theme for every visitor, on `:root`: `#191919` ink on `#FAF9F6`, with `#F2F0E9` for alternating sections and `#B18A3A` as the accent. The dark theme is an opt-in from the toggle, never read from the device, so the site opens the way she designed it.

**Plates.** The header, the footer, a photograph with text on it and the reservation panel are black in both themes. Rather than hard-code light colours on each, they carry one class, `.plate`, which gives everything inside it the dark theme's token values. A component on a plate uses the same tokens as one on the page, and a focus ring or a link inside it comes out in the bright gold by itself.

**A photo is cut to its band at build time.** A portrait photograph shown as a short band would otherwise send a phone the whole picture to draw a strip of it. `Photo.astro` takes an `aspect` and which part to `keep`, and crops while it resizes: the Experience page's opening image went from 89 KB to 18 KB at the width a phone asks for.

**Text over a photograph is safe by construction.** An accessibility checker cannot judge text over an image, so `PhotoHero.astro` does not leave it to the photo: the text sits in the lower part of the frame over a gradient that belongs to the text, clear at the top of the picture and at its full depth exactly where the first line starts. That depth is tested against a pure white pixel, so the text clears 4.5:1 over any photograph the owner sends.


**The gold rule.** Her accent `#B18A3A` measures 3.0:1 on the cream and 2.8:1 on the alternate surface: enough for an ornament, not for text, and not for an icon or an edge that has to be seen. So gold is two tokens: `--gold-deco` for decoration, and `--gold-text`, a darker `#806419`, for anything that carries meaning. Buttons come in the two finishes she drew: her flat olive with a white label on every page but the homepage, a shade darker than hers so the white clears 4.5:1, and the champagne metal of her two homepage buttons with her warm brown label. Neither has a ring, as she draws none: a text button's label names it, which is all WCAG 1.4.11 asks, and a transparent border keeps the box in a Windows contrast theme. A test computes every label's ratio against every colour its fill paints, out of the built CSS rather than asserting a hex, because an earlier hex-equality test passed happily while the value measured 4.37:1.

**One row of header, nothing floating.** Logo, language link, and the way to the pages: a menu under 800px, links in the bar from there. The menu is a `<details>` inside its own `<nav>`, so it opens without JavaScript; a small script adds Escape, tap-outside, and closing when focus leaves it or the viewport grows.

**Every URL built from the current page goes through `pagePath()`.** The build writes `about.html`, and while it does Astro reports the page's path as `/about.html`; in dev it reports `/about`. Using the reported path directly gave a canonical, alternates and a language link that were right locally and wrong in production.

**Photos go through one component.** `Photo.astro` emits AVIF, WebP and a JPEG fallback at a ladder of widths, each format at its own quality so the AVIF really is the smallest, lazy below the fold and prioritized for the image a page opens on. Its `sizes` has to say how wide the photo is drawn, which for a landscape photo filling a tall phone hero is wider than the screen.

**URLs have no trailing slash, on both sides.** Astro builds with `trailingSlash: 'never'` and `build.format: 'file'`; the assets binding serves with `drop-trailing-slash` and `404-page`. A test fails if the two configs stop agreeing, because when they did, every page answered with a redirect and Japanese visitors got the English 404.

**Prices are floors.** Every price carries a from-form. Yen figures converted from dollars are marked 約 on the Japanese pages; the rate itself is not printed, at the owner's request. English pages show dollars, except where she has given yen only.

**Every offering has two paths.** Each plan offers booking and consultation. Booking goes to the plan's own page, `/book/<id>`, so the form knows its plan without script; consultation carries the plan as `?service=` to a select built from the same data, and `/book` asks which plan. The site is the one place to book; the owner's older third-party forms are not linked.

**A booking is a request.** The owner checks availability and confirms, normally within 24 hours, and every page and email says so in her words. A plan in her format offers its own choices (one way or round trip, the route for one way, its group sizes), all from `src/data/plans.ts`, and `src/data/booking.ts` holds the rules the form, the received page and the Worker share: the Worker refuses any choice that is not the plan's own. The guest gets a receipt that carries only those checked values, never anything they typed, and only past the challenge or behind the preview's password, since it mails an address typed into a public form. The received page shows the same summary, filled in by the Worker from the checked request its address carries, so a visitor without script sees it too.

**No phone number.** Deliberate, and the owner's instruction.

## Running it

Node 22; `.nvmrc` has the exact version CI builds with.

```bash
npm install
npm run dev        # astro dev on :4321
npm run check      # astro check, kept at 0 errors
npm test           # astro build, then the suite against dist/
npm run test:unit  # the suite without a build
npm run preview    # wrangler dev: the built site through the real Worker
npm run deploy     # the suite (which builds), then wrangler deploy
```

`npm run preview` is the one that matters before a deploy. `astro dev` never goes through the assets binding and has no Worker at all, and four of the defects in this repo's history were only visible through the real thing.

To test the forms for real locally, copy `.dev.vars.example` to `.dev.vars`, put a Resend sending-only key in `RESEND_API_KEY` and your own address in `INQUIRY_TO`, then `npm run preview`. Without the key, every submit takes the send-failure path, and the success path never runs.

## Tests

| File | Guards |
| --- | --- |
| `tests/build.test.ts` | Every route in both locales; the canonical, alternates and language link of every page, by value; no English nav on Japanese pages, yen on Japanese pages only, offering and FAQ parity; her homepage and Experience copy, character for character and in her order; no exchange rate on any page; the palette, with contrast computed for text, for every button's label against every colour its fill paints, and for form-field edges, in both themes; cream as the default theme; the header, menu and footer; photo formats, priority and file sizes; the depth of the gradient behind text on a photo; every Japanese fold, pinned; one label for the booking request; both paths on every card, the booking notice, no phone number, sitemap and robots; every built page read by the URL checks, `noindex` where it belongs, every link of the site's own resolving to a built file or a Worker route, and the icons |
| `tests/data.test.ts` | Unique ids and slugs, full bilingual coverage, every price a floor, every plan has a page or a description for its card, every plan books and consults on the site |
| `tests/i18n.test.ts` | Path helpers, including the build's `.html` paths, and dictionary key parity |
| `tests/phrase.test.ts` | Where Japanese may fold: lossless, never inside a katakana word, a dictionary word or a compound verb, never a one-character phrase, kinsoku respected, an authored space as the only fold of a title |
| `tests/config.test.ts` | Astro and Cloudflare agree about the URL shape |
| `tests/booking.test.ts` | The booking rules: a plan's own choices only, the route only where it applies, real dates from today in Los Angeles, the guest list per plan, and how a request reads back. The clock is pinned |
| `tests/enhance-form.test.ts` | The forms' script on a stand-in page: every error mark shown before the one scroll to the first field to fix, on an empty send and on a field the Worker refused, and the date picker's bounds moving with the clock |
| `tests/worker.test.ts` | Input cleaning, one-line fields, a single email address, HTML escaping, plan labels, redirect paths, refused choices and origins, the guest receipt and what it may carry, the received page's summary, and both endpoints driven end to end with Resend stubbed; the 64 KB cap counted as a body arrives, a broken upload, the mail service's deadline, the headers and cache rule on every response, and the gate through the Worker (its icons, its origin check, a caught form post); and that every export of the Worker is one the runtime can load |
| `tests/beta.test.ts` | The gate: cookie signing, the open-redirect guard (dot segments, backslashes, control characters), `noindex`, the page itself, its error tied to the field, its English tagged, its text sizes and contrast |

## The beta gate

A `BETA_PASSWORD` secret on the Worker. **Absent means the site is public**, so production is the default and the gate is the exception. With the secret set, every request without a valid cookie gets a Japanese-first password page and a `401`; everything behind it carries `X-Robots-Tag: noindex, nofollow`. The cookie is an HMAC keyed by the password, so the password is never stored in the browser and rotating it invalidates every cookie.

Going public is `wrangler secret delete BETA_PASSWORD`, not a deploy.

`run_worker_first` on the assets binding is what makes this work. Without it Cloudflare serves matching static assets without calling the Worker, and the gate never sees them. Her icons are served before the gate, so its first screen has one. A form post the gate catches returns the visitor to the form's page after signing in.

Every response, gated or not, goes through `harden()` in the Worker: `nosniff`, a referrer policy, and no framing by another site (`X-Frame-Options` and `frame-ancestors`). A file under `/_astro/` is named by a hash of its content and is kept for a year: `public`, or `private` while the gate is up.

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
