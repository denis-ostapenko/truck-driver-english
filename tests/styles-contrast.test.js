const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const CSS = fs.readFileSync(path.resolve(__dirname, "..", "app", "styles.css"), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = CSS.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`));
  assert.ok(match, `missing CSS rule: ${selector}`);
  return match[1];
}

function property(selector, name) {
  const match = rule(selector).match(new RegExp(`(?:^|;)\\s*${name}\\s*:\\s*([^;]+)`));
  assert.ok(match, `missing ${name} in ${selector}`);
  return match[1].trim();
}

const root = rule(":root");
const variables = Object.fromEntries(Array.from(root.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g), match => [match[1], match[2].trim()]));

function resolve(value) {
  const variable = value.match(/^var\(--([\w-]+)\)$/);
  return variable ? resolve(variables[variable[1]]) : value;
}

function rgba(value) {
  const resolved = resolve(value).trim().toLowerCase();
  if (resolved.startsWith("#")) {
    let hex = resolved.slice(1);
    if (hex.length === 3) hex = hex.split("").map(char => char + char).join("");
    assert.match(hex, /^[0-9a-f]{6}$/);
    return [0, 2, 4].map(index => parseInt(hex.slice(index, index + 2), 16)).concat(1);
  }
  const match = resolved.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/);
  assert.ok(match, `unsupported color: ${value}`);
  return [Number(match[1]), Number(match[2]), Number(match[3]), match[4] === undefined ? 1 : Number(match[4])];
}

function composite(foreground, background) {
  const fg = rgba(foreground);
  const bg = rgba(background);
  const alpha = fg[3] + bg[3] * (1 - fg[3]);
  return [0, 1, 2].map(index => (fg[index] * fg[3] + bg[index] * bg[3] * (1 - fg[3])) / alpha).concat(alpha);
}

function luminance(color) {
  return color.slice(0, 3).map(channel => {
    const value = channel / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(foreground, background) {
  const bg = rgba(background);
  const fg = composite(foreground, background);
  const first = luminance(fg);
  const second = luminance(bg);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

function expectContrast(label, foreground, background, minimum) {
  const ratio = contrast(foreground, background);
  assert.ok(ratio >= minimum, `${label}: ${ratio.toFixed(2)} is below ${minimum}:1`);
}

test("normal text tokens keep at least 4.5:1 on every light runtime surface", () => {
  const lightSurfaces = ["var(--paper)", "var(--surface)", "var(--surface-2)", "var(--green-soft)", "var(--amber-soft)", "#e4e0d6", "#e8e4da", "#eaf2f8"];
  for (const foreground of ["var(--ink)", "var(--muted)", "var(--green)"]) {
    for (const background of lightSurfaces) {
      expectContrast(`${foreground} on ${background}`, foreground, background, 4.5);
    }
  }
});

test("normal text colors on the dark application surfaces keep at least 4.5:1", () => {
  const darkText = [
    "#fff", "#b9c9c2", "#c8d4cf", "#91a69d", "#82978e", "#e3ebe7",
    "#c2d0cb", "#b9cbc3", "#9eb3aa", "#d1ddd8", "#92a69e", "#d3ded9",
    "#b8c9c2", "#c7d4cf", "#e7eee9", "#cfdbd6", "#b4c5be", "#c3d1cb", "#c5d3cd",
  ];
  for (const foreground of darkText) {
    expectContrast(`${foreground} on forest`, foreground, "var(--forest)", 4.5);
  }
  expectContrast("DMS amber text", "#ffc642", "#111512", 4.5);
  expectContrast("DMS source label", "#d8d2c5", "#111512", 4.5);
});

test("the reported low contrast selectors compute to WCAG AA text contrast", () => {
  expectContrast("segmented inactive text", property(".segmented button", "color"), property(".segmented", "background"), 4.5);
  expectContrast("segmented active text", property(".segmented button.active", "color"), property(".segmented button.active", "background"), 4.5);
  expectContrast("situation and document secondary text", property(".situation-list small, .document-list small", "color"), "var(--green-soft)", 4.5);
  expectContrast("role chip text", property(".role-row span", "color"), property(".role-row span", "background"), 4.5);
  expectContrast("hidden dialogue text", property(".dialogue-placeholder", "color"), property(".dialogue-placeholder", "background"), 4.5);
  expectContrast("document practice label", property(".document-practice span, .field-quiz span", "color"), "var(--green-soft)", 4.5);
  expectContrast("lesson number", property(".lesson-number", "color"), property(".lesson-number", "background"), 4.5);
  expectContrast("Voice Lab target label", property(".voice-target span", "color"), property(".voice-target", "background"), 4.5);
  expectContrast("Voice Lab model button", property(".voice-target .audio-button.light", "color"), property(".voice-target .audio-button.light", "background"), 4.5);
  expectContrast("dark card eyebrow", property(".card-tip .eyebrow, .focus-panel .eyebrow, .next-step-card .eyebrow, .progress-guidance .eyebrow, .official-card .eyebrow, .hero-panel .eyebrow", "color"), "var(--forest)", 4.5);
});

test("key control and state boundaries keep at least 3:1 non-text contrast", () => {
  for (const background of ["var(--paper)", "var(--surface)", "var(--green-soft)", "var(--amber-soft)"]) {
    expectContrast(`control line on ${background}`, "var(--control-line)", background, 3);
  }
  expectContrast("dark surface control boundary", property(".audio-button.light", "border-color"), "var(--forest)", 3);
  expectContrast("segmented control boundary", property(".segmented", "border" ).split(/\s+/).at(-1), "var(--paper)", 3);
  expectContrast("completed state boundary", "var(--green)", "var(--green-soft)", 3);
  expectContrast("primary button boundary", "#835b10", "var(--surface)", 3);
  expectContrast("focus indicator", "#1769d2", "var(--surface)", 3);
});

test("new productive controls use the accessible control border and visible focus", () => {
  assert.equal(resolve(property(".typed-response", "border").split(/\s+/).at(-1)), resolve("var(--control-line)"));
  assert.equal(resolve(property(".condition-control", "border").split(/\s+/).at(-1)), resolve("var(--control-line)"));
  assert.match(CSS, /\.condition-control:has\(input:focus-visible\)\s*\{[^}]*outline:\s*3px solid #1769d2/);
  assert.match(rule(":focus-visible"), /outline:\s*3px solid #1769d2/);
});

test("Cycle 3 status surfaces retain readable text contrast", () => {
  expectContrast("persistence status", property(".persistence-status", "color"), property(".persistence-status", "background"), 4.5);
  expectContrast("construct limitations", property(".construct-limits", "color"), property(".construct-limits", "background"), 4.5);
  expectContrast("construct limitations detail", property(".construct-limits p", "color"), property(".construct-limits", "background"), 4.5);
  expectContrast("route backlog", property(".route-backlog", "color"), "var(--surface)", 4.5);
});

test("interactive control rules preserve a 44 pixel minimum target and reduced motion", () => {
  assert.equal(property(".icon-button", "min-width"), "44px");
  assert.equal(property(".icon-button", "height"), "44px");
  assert.equal(property(".segmented button", "min-height"), "44px");
  assert.equal(property(".sign-rubric .button", "min-height"), "44px");
  assert.equal(property(".storage-warning button", "min-height"), "44px");
  assert.match(CSS, /@media \(prefers-reduced-motion: reduce\)[\s\S]*transition:\s*none !important;[\s\S]*animation:\s*none !important;/);
});
