import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

const BASE = process.env.LETTER_BASE_URL || "http://127.0.0.1:8765";
const DAV = process.env.MOCK_DAV_URL || "http://127.0.0.1:8799/addressbook/";
const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "letter-e2e-"));

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

const pageErrors = [];
page.on("pageerror", (err) => pageErrors.push(err.message));
page.on("console", (msg) => {
  if (msg.type() !== "error") return;
  // The intentional 401 check makes the browser log a network error.
  if (/status of 401/.test(msg.text())) return;
  pageErrors.push("console: " + msg.text());
});

function log(step) { console.log("•", step); }

try {
  log("load page and check CSP/title");
  const response = await page.goto(BASE, { waitUntil: "domcontentloaded" });
  assert.equal(await page.title(), "Letter — ronzz.ORG");
  const csp = response.headers()["content-security-policy"];
  assert.ok(csp.includes("script-src 'self'"), "script-src in CSP");
  assert.ok(csp.includes("connect-src 'self'"), "connect-src in CSP");

  log("import vCard and fill recipient");
  await page.setInputFiles("#vcf-file", "tests/fixtures/jane.vcf");
  await page.waitForFunction(() => document.querySelector("#contact-list").textContent.includes("Jane Doe"));
  await page.locator(".contact-item button", { hasText: "Use" }).first().click();
  assert.equal(await page.inputValue('[name="recipient.name"]'), "Jane Doe");
  assert.equal(await page.inputValue('[name="recipient.email"]'), "jane@example.com");
  assert.equal(await page.inputValue('[name="recipient.city"]'), "Springfield");

  log("fill sender and body, check localStorage persistence");
  await page.fill('[name="sender.name"]', "Rong Zhou");
  await page.fill('[name="sender.organization"]', "ronzz.ORG");
  await page.fill('[name="sender.street"]', "1 rue de l'Exemple");
  await page.fill('[name="sender.postal_code"]', "54000");
  await page.fill('[name="sender.city"]', "Nancy");
  await page.fill('[name="sender.country"]', "France");
  await page.fill('[name="sender.email"]', "ron@ronzz.org");
  await page.fill("#subject", "E2E request");
  await page.fill("#body", "Hello **world**.\n\n- one\n- two");
  await page.waitForTimeout(500);
  const stored = JSON.parse(await page.evaluate(() => localStorage.getItem("letter.profile.v1")));
  assert.equal(stored.subject, "E2E request");
  assert.equal(stored["sender.name"], "Rong Zhou");

  log("download PDF");
  const [pdfDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#download-pdf"),
  ]);
  const pdfPath = await pdfDownload.path();
  const pdfBytes = await fs.readFile(pdfPath);
  assert.ok(pdfBytes.subarray(0, 4).toString() === "%PDF", "PDF magic");

  log("download .eml");
  const [emlDownload] = await Promise.all([
    page.waitForEvent("download"),
    page.click("#download-eml"),
  ]);
  const emlText = await fs.readFile(await emlDownload.path(), "utf8");
  assert.ok(emlText.includes("X-Unsent: 1"), "X-Unsent header");
  assert.ok(emlText.includes("Subject: E2E request"), "subject header");

  log("reload: profile persists");
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await page.inputValue("#subject"), "E2E request");
  assert.equal(await page.inputValue('[name="recipient.name"]'), "Jane Doe");

  log("connect CardDAV (sets origin cookie, reloads, tests)");
  await page.fill("#dav-url", DAV);
  const [nav] = await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.click("#dav-connect"),
  ]);
  assert.ok(nav, "reloaded after setting DAV origin");
  const csp2 = nav.headers()["content-security-policy"] || "";
  assert.ok(csp2.includes("http://127.0.0.1:8799"), "CSP allows the DAV origin after reload");
  await page.waitForFunction(
    () => document.querySelector("#dav-status").textContent.startsWith("Connected"),
    null,
    { timeout: 10000 }
  );

  log("fetch contacts over CardDAV");
  await page.click("#dav-fetch");
  await page.waitForFunction(
    () => document.querySelector("#dav-status").textContent.startsWith("Fetched"),
    null,
    { timeout: 10000 }
  );
  assert.ok((await page.textContent("#contact-list")).includes("John Smith"), "fetched contact visible");

  log("401 error mapping");
  await page.fill("#dav-url", "http://127.0.0.1:8799/fail");
  await page.click("#dav-test");
  await page.waitForFunction(
    () => document.querySelector("#dav-status").textContent.includes("401"),
    null,
    { timeout: 10000 }
  );

  assert.deepEqual(pageErrors, [], "no page/console errors");
  console.log("E2E OK");
} finally {
  await browser.close();
  await fs.rm(tmp, { recursive: true, force: true });
}
