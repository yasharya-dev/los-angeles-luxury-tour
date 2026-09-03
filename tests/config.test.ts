import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// wrangler.jsonc allows comments; strip them before parsing.
const wrangler = () =>
  JSON.parse(
    readFileSync(join(process.cwd(), 'wrangler.jsonc'), 'utf8').replace(
      /^\s*\/\/.*$/gm,
      '',
    ),
  );

const astroConfig = () =>
  readFileSync(join(process.cwd(), 'astro.config.mjs'), 'utf8');

// Astro decides what the URLs look like; Cloudflare decides what it serves at
// them. If these two disagree, every page answers with a redirect to a URL
// that nothing on the site links to. That is how the site shipped its first
// deploy config, and nothing caught it because astro dev never goes through
// the assets binding.
describe('URL shape', () => {
  it('builds without trailing slashes', () => {
    expect(astroConfig()).toMatch(/trailingSlash:\s*'never'/);
  });

  it('serves without trailing slashes', () => {
    expect(wrangler().assets.html_handling).toBe('drop-trailing-slash');
  });

  // 404-page mode finds files named 404.html, so the Japanese 404 has to
  // build as ja/404.html and not ja/404/index.html.
  it('builds one file per page so the Japanese 404 is where Cloudflare looks', () => {
    expect(astroConfig()).toMatch(/format:\s*'file'/);
  });

  it('serves the 404 page for unknown routes', () => {
    expect(wrangler().assets.not_found_handling).toBe('404-page');
  });
});
