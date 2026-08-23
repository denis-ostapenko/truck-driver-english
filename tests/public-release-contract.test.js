const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "..");
const workerSource = fs.readFileSync(path.join(ROOT, "app", "_worker.js"), "utf8");
const headersSource = fs.readFileSync(path.join(ROOT, "app", "_headers"), "utf8");
const html = fs.readFileSync(path.join(ROOT, "app", "index.html"), "utf8");
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, "app", "manifest.webmanifest"), "utf8"));
const robots = fs.readFileSync(path.join(ROOT, "app", "robots.txt"), "utf8");
const sitemap = fs.readFileSync(path.join(ROOT, "app", "sitemap.xml"), "utf8");
const guidePage = fs.readFileSync(path.join(ROOT, "app", "guide.html"), "utf8");

test("the public worker serves assets without beta credentials and keeps security headers", async () => {
  assert.doesNotMatch(workerSource, /BETA_|Authorization|WWW-Authenticate|noindex|nofollow/);
  const moduleUrl = `data:text/javascript;base64,${Buffer.from(workerSource).toString("base64")}`;
  const worker = (await import(moduleUrl)).default;
  const request = new Request("https://truck-driver-english-eug.pages.dev/index.html");
  const response = await worker.fetch(request, {
    ASSETS: {
      fetch: async () => new Response("public", {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    },
  });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), "public");
  assert.equal(response.headers.get("X-Frame-Options"), "DENY");
  assert.equal(response.headers.get("X-Content-Type-Options"), "nosniff");
  assert.equal(response.headers.get("X-Robots-Tag"), null);
  assert.equal(response.headers.get("WWW-Authenticate"), null);
});

test("the static public surface is crawlable and names the production URL", () => {
  assert.doesNotMatch(headersSource, /X-Robots-Tag|noindex|nofollow/);
  assert.match(html, /<meta name="robots" content="index, follow">/);
  assert.match(html, /<link rel="canonical" href="https:\/\/truck-driver-english-eug\.pages\.dev\/">/);
  assert.doesNotMatch(html, /Закрытая бета/);
  assert.doesNotMatch(manifest.description, /Закрытая бета/);
  assert.match(robots, /User-agent: \*\s+Allow: \/\s+Sitemap: https:\/\/truck-driver-english-eug\.pages\.dev\/sitemap\.xml/);
  assert.match(sitemap, /<loc>https:\/\/truck-driver-english-eug\.pages\.dev\/<\/loc>/);
});

test("full guides and legal texts are public in Russian, Ukrainian and Belarusian", () => {
  for (const [language, file] of [["ru", "USER_GUIDE_RU.md"], ["uk", "USER_GUIDE_UK.md"], ["be", "USER_GUIDE_BE.md"]]) {
    const source = fs.readFileSync(path.join(ROOT, file), "utf8");
    const published = fs.readFileSync(path.join(ROOT, "app", file), "utf8");
    assert.equal(published, source, `${file} public copy must match its source`);
    assert.match(guidePage, new RegExp(`<article id="${language}" lang="${language}">`));
    assert.ok(source.split("\n").length >= 100, `${file} must remain a full guide`);
  }
  for (const file of ["LICENSE", "NOTICE"]) {
    assert.equal(
      fs.readFileSync(path.join(ROOT, "app", file), "utf8"),
      fs.readFileSync(path.join(ROOT, file), "utf8"),
      `${file} public copy must match its source`,
    );
  }
  assert.match(guidePage, /id="license"/);
  assert.match(guidePage, /Permission is hereby granted, free of charge/);
  assert.match(guidePage, /id="notice"/);
  assert.match(html, /guide\.html#ru/);
  assert.match(html, /guide\.html#uk/);
  assert.match(html, /guide\.html#be/);
});
