import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";

const BASE = process.env.LETTER_URL || "https://letter.ronzz.org/";
const DAV = process.env.RADICALE_URL;
const USER = process.env.RADICALE_USER;
const PASS = process.env.RADICALE_PASS;
if (!DAV || !USER || !PASS) {
  console.error("Set RADICALE_URL, RADICALE_USER, RADICALE_PASS.");
  process.exit(2);
}

const resolverRules = process.env.PLAYWRIGHT_HOST_RESOLVER_RULES;
const args = resolverRules ? [`--host-resolver-rules=${resolverRules}`] : [];
const browser = await chromium.launch({ headless: true, args });
const context = await browser.newContext({ acceptDownloads: true });
const page = await context.newPage();

const errors = [];
page.on("pageerror", (err) => errors.push(err.message));
page.on("console", (msg) => { if (msg.type() === "error") errors.push("console: " + msg.text()); });
page.on("response", (r) => { if (r.url().includes("/api/")) console.log("  response", r.status(), r.url()); });

async function downloadAfter(selector, label) {
  try {
    const [download] = await Promise.all([
      page.waitForEvent("download", { timeout: 20000 }),
      page.click(selector),
    ]);
    return download;
  } catch (err) {
    console.log(`  ${label} failed; toast=`, await page.textContent("#toast"));
    throw err;
  }
}

function log(step) { console.log("•", step); }

try {
  log("load deployed app");
  const response = await page.goto(BASE, { waitUntil: "domcontentloaded" });
  assert.equal(response.status(), 200);
  assert.equal(await page.title(), "Letter — ronzz.ORG");

  log("fill sender");
  await page.fill('[name="sender.name"]', "Rong Zhou");
  await page.fill('[name="sender.organization"]', "ronzz.ORG");
  await page.fill('[name="sender.street"]', "1 rue de l'Exemple");
  await page.fill('[name="sender.postal_code"]', "54000");
  await page.fill('[name="sender.city"]', "Nancy");
  await page.fill('[name="sender.country"]', "France");
  await page.fill('[name="sender.email"]', "ron@ronzz.org");

  log("connect to deployed Radicale");
  await page.fill("#dav-url", DAV);
  await page.fill("#dav-user", USER);
  await page.fill("#dav-pass", PASS);
  await page.check("#dav-remember");
  const [nav] = await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.click("#dav-connect"),
  ]);
  const csp = nav.headers()["content-security-policy"] || "";
  assert.ok(csp.includes("https://people.ronzz.org"), "CSP allows the Radicale origin");
  await page.waitForFunction(
    () => document.querySelector("#dav-status").textContent.startsWith("Connected"),
    null,
    { timeout: 20000 }
  );

  log("fetch contacts from Radicale over CORS");
  await page.click("#dav-fetch");
  await page.waitForFunction(
    () => document.querySelector("#dav-status").textContent.startsWith("Fetched"),
    null,
    { timeout: 20000 }
  );
  const listText = await page.textContent("#contact-list");
  assert.ok(listText.includes("Rong Zhou"), "Radicale contact visible in the address book");

  log("use the Radicale contact");
  await page.locator(".contact-item button", { hasText: "Use" }).first().click();
  await page.waitForTimeout(900);
  assert.equal(await page.inputValue('[name="recipient.name"]'), "Rong Zhou");
  assert.equal(await page.inputValue('[name="recipient.email"]'), "ron@ronzz.org");

  log("render PDF");
  await page.fill("#subject", "Deployed letter test");
  await page.fill("#body", "Hello from **letter.ronzz.org** and *people.ronzz.org*.");
  await page.waitForTimeout(400);
  const pdfDownload = await downloadAfter("#download-pdf", "PDF");
  const pdfBytes = await fs.readFile(await pdfDownload.path());
  assert.equal(pdfBytes.subarray(0, 4).toString(), "%PDF");
  assert.ok(pdfBytes.length > 1000);

  log("render .eml");
  const emlDownload = await downloadAfter("#download-eml", "EML");
  const eml = await fs.readFile(await emlDownload.path(), "utf8");
  assert.ok(eml.includes("X-Unsent: 1"));
  assert.ok(eml.includes("Subject: Deployed letter test"));
  assert.ok(eml.includes("To: ron@ronzz.org"));

  assert.deepEqual(errors, [], "no page/console errors");
  console.log("DEPLOYED E2E OK");
} finally {
  await browser.close();
}
