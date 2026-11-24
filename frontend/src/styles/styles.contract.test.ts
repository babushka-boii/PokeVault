import { describe, expect, test } from "vitest";

/**
 * Style contracts for the "Unova Noir" design system (Iteration 8A).
 * jsdom does not evaluate CSS, so these tests read the stylesheets as text.
 */
const sheets = import.meta.glob("/src/**/*.css", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** Files still using hard-coded colors. Emptied by 8A Task 4; new stylesheets must use tokens from the start. */
const LEGACY_FILES = new Set<string>();

const TOKENS = "/src/styles/tokens.css";
const BASE = "/src/styles/base.css";
const RAW_COLOR = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(/;

function stripComments(css: string) {
  return css.replace(/\/\*[\s\S]*?\*\//g, "");
}

/** Removes blocks explicitly allow-listed as content colors (type badges, wallpapers, holo). */
function withoutAllowedBlocks(css: string) {
  return css.replace(/\/\*\s*pv-allow-colors:[^*]*\*\/[\s\S]*?\/\*\s*pv-allow-colors-end\s*\*\//g, "");
}

/** Innermost `selector { declarations }` blocks; good enough for flat and @media rules. */
function rules(css: string) {
  return [...stripComments(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selector, body]) => ({ selector: selector.trim(), body }));
}

function tokens(): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [, name, value] of stripComments(sheets[TOKENS]).matchAll(/(--pv-[a-z0-9-]+)\s*:\s*([^;]+);/g)) values[name] = value.trim();
  return values;
}

function resolve(values: Record<string, string>, name: string): string {
  const value = values[name];
  if (value === undefined) throw new Error(`Missing token ${name}`);
  const reference = /^var\((--pv-[a-z0-9-]+)\)$/.exec(value);
  return reference ? resolve(values, reference[1]) : value;
}

function luminance(hex: string) {
  const channels = [1, 3, 5].map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4);
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrast(a: string, b: string) {
  const [high, low] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (high + 0.05) / (low + 0.05);
}

const SURFACES = ["--pv-bg", "--pv-panel", "--pv-panel-raised", "--pv-bar"];
const TEXT = ["--pv-text", "--pv-text-2", "--pv-text-3", "--pv-cyan", "--pv-gold", "--pv-danger", "--pv-success"];
const NON_TEXT = ["--pv-border-strong", "--pv-focus"];

describe("design tokens", () => {
  test("define every palette color as a six-digit hex value", () => {
    const values = tokens();
    for (const name of [...SURFACES, ...TEXT, ...NON_TEXT, "--pv-on-cyan", "--pv-border", "--pv-border-soft", "--pv-warn-border"]) {
      expect(resolve(values, name), name).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  test.each(TEXT.flatMap((text) => SURFACES.map((surface) => [text, surface])))("%s on %s meets WCAG AA for text", (text, surface) => {
    const values = tokens();
    expect(contrast(resolve(values, text), resolve(values, surface))).toBeGreaterThanOrEqual(4.5);
  });

  test("primary button text on cyan meets WCAG AA", () => {
    const values = tokens();
    expect(contrast(resolve(values, "--pv-on-cyan"), resolve(values, "--pv-cyan"))).toBeGreaterThanOrEqual(4.5);
  });

  test.each(NON_TEXT.flatMap((token) => SURFACES.map((surface) => [token, surface])))("%s against %s meets 3:1 for non-text", (token, surface) => {
    const values = tokens();
    expect(contrast(resolve(values, token), resolve(values, surface))).toBeGreaterThanOrEqual(3);
  });
});

describe("stylesheets", () => {
  test("the contract sees the tokens, the base layer and the feature stylesheets", () => {
    expect(Object.keys(sheets)).toEqual(expect.arrayContaining([TOKENS, BASE, "/src/styles.css", "/src/components/boxes/boxes.css"]));
  });

  test("every stylesheet has been migrated to tokens", () => {
    expect([...LEGACY_FILES]).toEqual([]);
  });

  test("legacy entries still exist, so the list shrinks instead of going stale", () => {
    for (const file of LEGACY_FILES) expect(Object.keys(sheets), file).toContain(file);
  });

  test("only tokens.css and allow-listed content blocks contain raw colors", () => {
    const offenders = Object.entries(sheets)
      .filter(([file]) => file !== TOKENS && !LEGACY_FILES.has(file))
      .filter(([, css]) => RAW_COLOR.test(stripComments(withoutAllowedBlocks(css))))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  test("migrated stylesheets never animate forever", () => {
    const offenders = Object.entries(sheets)
      .filter(([file]) => !LEGACY_FILES.has(file))
      .filter(([, css]) => /\binfinite\b/.test(stripComments(css)))
      .map(([file]) => file);
    expect(offenders).toEqual([]);
  });

  test("the base layer disables motion globally for reduced-motion users", () => {
    const base = stripComments(sheets[BASE]);
    const block = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?\})\s*\}/.exec(base);
    expect(block).not.toBeNull();
    expect(block![1]).toMatch(/animation-duration:\s*\.01ms\s*!important/);
    expect(block![1]).toMatch(/animation-iteration-count:\s*1\s*!important/);
    expect(block![1]).toMatch(/transition-duration:\s*\.01ms\s*!important/);
    expect(block![1]).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });

  test("skeletons pulse at most three times", () => {
    const skeleton = rules(sheets[BASE]).find((rule) => /(^|,)\s*\.pv-skeleton\s*($|,)/.test(rule.selector));
    expect(skeleton).toBeDefined();
    const count = /animation-iteration-count:\s*(\d+)/.exec(skeleton!.body);
    expect(count).not.toBeNull();
    expect(Number(count![1])).toBeLessThanOrEqual(3);
  });

  test("the pixel font is never smaller than the pixel text token", () => {
    const values = tokens();
    expect(resolve(values, "--pv-text-pixel")).toBe("0.75rem");
    const offenders = Object.entries(sheets).flatMap(([file, css]) => rules(css)
      .filter((rule) => rule.body.includes("var(--pv-font-pixel)"))
      .filter((rule) => {
        const size = /font-size:\s*([^;]+)/.exec(rule.body)?.[1].trim();
        if (!size || size === "var(--pv-text-pixel)") return false;
        const rem = /^([\d.]+)rem$/.exec(size); const px = /^([\d.]+)px$/.exec(size);
        return !(rem && Number(rem[1]) * 16 >= 11) && !(px && Number(px[1]) >= 11);
      })
      .map((rule) => `${file} ${rule.selector}`));
    expect(offenders).toEqual([]);
  });

  test("focus is drawn with the focus token in the base layer", () => {
    const focus = rules(sheets[BASE]).find((rule) => rule.selector === ":focus-visible");
    expect(focus?.body).toMatch(/outline:\s*3px solid var\(--pv-focus\)/);
  });
});
