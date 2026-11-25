"use strict";

const PROFILE_KEY = "letter.profile.v1";
const DAV_KEY = "letter.carddav.v1";
const DAV_SESSION_KEY = "letter.carddav.session.v1";
const DAV_COOKIE = "letter_dav_origin";
const DB_NAME = "letter-contacts";
const DB_VERSION = 1;
const STORE = "contacts";

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function toast(message, kind = "") {
  const el = $("#toast");
  el.textContent = message;
  el.className = "toast show" + (kind ? " " + kind : "");
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { el.className = "toast"; }, 4200);
}

function setStatus(message, kind = "") {
  const el = $("#dav-status");
  el.textContent = message;
  el.className = "status" + (kind ? " " + kind : "");
}

/* ---------- profile ---------- */

function profileFields() {
  return $$("[data-profile]", $("#letter-form"));
}

function readProfile() {
  const data = {};
  for (const el of profileFields()) {
    const key = el.name || el.id;
    if (!key) continue;
    data[key] = el.type === "checkbox" ? el.checked : el.value;
  }
  return data;
}

function applyProfile(data) {
  if (!data) return;
  for (const el of profileFields()) {
    const key = el.name || el.id;
    if (!(key in data)) continue;
    if (el.type === "checkbox") el.checked = Boolean(data[key]);
    else el.value = String(data[key]);
  }
}

let saveTimer = null;
function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(PROFILE_KEY, JSON.stringify(readProfile()));
      const el = $("#save-status");
      el.textContent = "Saved";
      setTimeout(() => { el.textContent = "Saved in this browser"; }, 1200);
    } catch (err) {
      console.warn("profile save failed", err);
      toast("Could not save the profile in this browser.", "error");
    }
  }, 250);
}

/* ---------- payload ---------- */

const PARTY_FIELDS = ["name", "title", "organization", "street", "postal_code", "city", "region", "country", "phone", "email", "website"];

function readParty(prefix) {
  const out = {};
  for (const key of PARTY_FIELDS) {
    const el = $(`[name="${prefix}.${key}"]`, $("#letter-form"));
    out[key] = el ? el.value.trim() : "";
  }
  return out;
}

function readPayload() {
  return {
    style: $("#style").value,
    mode: $("#mode").value,
    paper: $("#paper").value,
    sender: readParty("sender"),
    recipient: readParty("recipient"),
    place: $("#place").value.trim(),
    date: $("#date").value.trim(),
    subject: $("#subject").value.trim(),
    reference: $('[name="reference"]').value.trim(),
    your_ref: $('[name="your_ref"]').value.trim(),
    our_ref: $('[name="our_ref"]').value.trim(),
    salutation: $('[name="salutation"]').value.trim(),
    body: $("#body").value,
    closing: $('[name="closing"]').value.trim(),
    enclosures: $('[name="enclosures"]').value.trim(),
    cc: $('[name="cc"]').value.trim(),
    attach_pdf: $("#attach-pdf").checked,
  };
}

function validatePayload(payload) {
  if (!payload.body.trim()) return "The body is empty.";
  if (!payload.sender.name && !payload.sender.organization) return "Add a sender name or organisation.";
  if (!payload.recipient.name && !payload.recipient.organization) return "Add a recipient name or organisation.";
  return null;
}

async function renderRequest(path, accept) {
  const payload = readPayload();
  const problem = validatePayload(payload);
  if (problem) { toast(problem, "error"); return null; }
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    let detail = "The letter could not be generated.";
    try { const data = await res.json(); if (data && data.detail) detail = data.detail; } catch (_) { /* ignore */ }
    throw new Error(detail);
  }
  const blob = await res.blob();
  return { blob, filename: filenameFromDisposition(res.headers.get("Content-Disposition")) };
}

function filenameFromDisposition(value) {
  if (!value) return null;
  const m = /filename="([^"]+)"/i.exec(value);
  return m ? m[1] : null;
}

function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename || "letter";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}

async function download(kind) {
  const path = kind === "pdf" ? "/api/render/pdf" : "/api/render/eml";
  try {
    const result = await renderRequest(path);
    if (!result) return;
    saveBlob(result.blob, result.filename || (kind === "pdf" ? "letter.pdf" : "letter.eml"));
  } catch (err) {
    toast(err.message || "Rendering failed.", "error");
  }
}

async function preview() {
  try {
    const result = await renderRequest("/api/render/pdf");
    if (!result) return;
    const url = URL.createObjectURL(result.blob);
    window.open(url, "_blank", "noopener");
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (err) {
    toast(err.message || "Preview failed.", "error");
  }
}

/* ---------- vCard parsing ---------- */

function normalizeNewlines(text) {
  return text.replace(/\r\n|\r|\n/g, "\r\n");
}

function entries(data, name) {
  const value = data[name];
  if (!value) return [];
  if (Array.isArray(value) && value[0] === name) return [value];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [];
}

function entryValue(entry) {
  return Array.isArray(entry) && entry.length >= 4 ? entry[3] : entry;
}

function entryParams(entry) {
  return Array.isArray(entry) && entry.length >= 4 ? (entry[1] || {}) : {};
}

function unescapeVcard(value) {
  if (value == null) return "";
  return String(value)
    .replace(/\\([\\nN,;])/g, (_, ch) => ({ "\\": "\\", n: "\n", N: "\n", ",": ",", ";": ";" }[ch]));
}

function preferredEntry(list) {
  if (!list.length) return null;
  const pref = list.find((entry) => {
    const params = entryParams(entry);
    const types = [].concat(params.type || [], params.pref || []).map((x) => String(x).toLowerCase());
    return types.includes("pref") || types.includes("1");
  });
  const work = list.find((entry) => {
    const types = [].concat(entryParams(entry).type || []).map((x) => String(x).toLowerCase());
    return types.includes("work");
  });
  return pref || work || list[0];
}

function firstText(data, name) {
  const entry = entries(data, name)[0];
  return entry ? unescapeVcard(entryValue(entry)) : "";
}

function normalizeCard(card, meta = {}) {
  // vcf encodes single-value properties as Property objects with a toJSON()
  // jCard representation; round-trip to plain arrays for uniform access.
  const data = JSON.parse(JSON.stringify(card.data || {}));
  const n = entries(data, "n")[0] ? entryValue(entries(data, "n")[0]) : null;
  const family = Array.isArray(n) ? unescapeVcard(n[0] || "") : "";
  const given = Array.isArray(n) ? unescapeVcard(n[1] || "") : "";
  const fn = firstText(data, "fn");
  const name = fn || [given, family].filter(Boolean).join(" ") || firstText(data, "org");

  const orgRaw = firstText(data, "org");
  const org = orgRaw ? orgRaw.split(";").map((s) => s.trim()).filter(Boolean).join(" — ") : "";

  const adrEntry = preferredEntry(entries(data, "adr"));
  const adr = adrEntry && Array.isArray(entryValue(adrEntry)) ? entryValue(adrEntry) : [];
  const street = [adr[0], adr[1], adr[2]].filter(Boolean).map(unescapeVcard).join(" ").trim();

  const emailEntry = preferredEntry(entries(data, "email"));
  const telEntry = preferredEntry(entries(data, "tel"));

  return {
    uid: firstText(data, "uid") || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
    name,
    family,
    given,
    title: firstText(data, "title"),
    organization: org,
    street,
    postal_code: unescapeVcard(adr[5] || ""),
    city: unescapeVcard(adr[3] || ""),
    region: unescapeVcard(adr[4] || ""),
    country: unescapeVcard(adr[6] || ""),
    email: emailEntry ? unescapeVcard(entryValue(emailEntry)) : "",
    phone: telEntry ? unescapeVcard(entryValue(telEntry)) : "",
    website: firstText(data, "url"),
    note: firstText(data, "note"),
    rev: firstText(data, "rev"),
    raw: meta.raw || "",
    href: meta.href || "",
    etag: meta.etag || "",
    source: meta.source || "import",
    updatedAt: Date.now(),
  };
}

function parseVcardText(text, meta = {}) {
  if (!window.vCard) throw new Error("vCard parser is not loaded.");
  const normalized = normalizeNewlines(String(text || ""));
  const parsed = window.vCard.parse(normalized);
  const cards = Array.isArray(parsed) ? parsed : [parsed];
  return cards.filter(Boolean).map((card) => normalizeCard(card, meta));
}

/* ---------- vCard export ---------- */

function vcardEscape(value) {
  return String(value == null ? "" : value)
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function toVcard(contact) {
  const rev = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
  const lines = [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `N:${vcardEscape(contact.family)};${vcardEscape(contact.given)};;;`,
    `FN:${vcardEscape(contact.name)}`,
    contact.organization ? `ORG:${vcardEscape(contact.organization)}` : "",
    contact.title ? `TITLE:${vcardEscape(contact.title)}` : "",
    `ADR;TYPE=work:;;${vcardEscape(contact.street)};${vcardEscape(contact.city)};${vcardEscape(contact.region)};${vcardEscape(contact.postal_code)};${vcardEscape(contact.country)}`,
    contact.email ? `EMAIL;TYPE=work:${vcardEscape(contact.email)}` : "",
    contact.phone ? `TEL;TYPE=work,voice:${vcardEscape(contact.phone)}` : "",
    contact.website ? `URL:${vcardEscape(contact.website)}` : "",
    contact.note ? `NOTE:${vcardEscape(contact.note)}` : "",
    `UID:${vcardEscape(contact.uid)}`,
    `REV:${rev}`,
    "END:VCARD",
  ].filter(Boolean);
  return lines.join("\r\n") + "\r\n";
}

function downloadContacts(contacts) {
  if (!contacts.length) { toast("No contacts to export.", "error"); return; }
  const text = contacts.map(toVcard).join("");
  saveBlob(new Blob([text], { type: "text/vcard;charset=utf-8" }), "contacts.vcf");
}

/* ---------- IndexedDB ---------- */

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "uid" });
        store.createIndex("href", "href", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function putContacts(items) {
  if (!items.length) return;
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const item of items) store.put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllContacts() {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const request = tx.objectStore(STORE).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function clearContacts() {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function deleteContact(uid) {
  const db = await openDb();
  await new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(uid);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ---------- contact list ---------- */

let contacts = [];
let contactFilter = "";

function renderContacts() {
  const list = $("#contact-list");
  list.replaceChildren();
  const filter = contactFilter.trim().toLowerCase();
  const shown = contacts
    .filter((c) => !filter || [c.name, c.organization, c.email, c.city].join(" ").toLowerCase().includes(filter))
    .sort((a, b) => (a.name || a.organization || "").localeCompare(b.name || b.organization || ""));

  if (!shown.length) {
    const li = document.createElement("li");
    li.className = "empty";
    li.textContent = contacts.length ? "No match." : "No saved contacts.";
    list.appendChild(li);
    return;
  }

  for (const contact of shown) {
    const li = document.createElement("li");
    li.className = "contact-item";

    const who = document.createElement("div");
    who.className = "who";
    const strong = document.createElement("strong");
    strong.textContent = contact.name || contact.organization || "(no name)";
    who.appendChild(strong);
    const sub = document.createElement("span");
    sub.textContent = [contact.organization, contact.email, contact.city].filter(Boolean).join(" · ");
    who.appendChild(sub);

    const actions = document.createElement("div");
    actions.className = "contact-actions";
    const use = document.createElement("button");
    use.type = "button";
    use.textContent = "Use";
    use.addEventListener("click", () => useContact(contact));
    const single = document.createElement("button");
    single.type = "button";
    single.className = "ghost";
    single.textContent = "vCard";
    single.addEventListener("click", () => downloadContacts([contact]));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "ghost danger";
    remove.textContent = "×";
    remove.title = "Remove from this browser";
    remove.addEventListener("click", async () => {
      await deleteContact(contact.uid);
      contacts = contacts.filter((c) => c.uid !== contact.uid);
      renderContacts();
    });

    actions.append(use, single, remove);
    li.append(who, actions);
    list.appendChild(li);
  }
}

function useContact(contact) {
  const map = {
    name: contact.name,
    title: contact.title,
    organization: contact.organization,
    street: contact.street,
    postal_code: contact.postal_code,
    city: contact.city,
    region: contact.region,
    country: contact.country,
    phone: contact.phone,
    email: contact.email,
  };
  for (const [key, value] of Object.entries(map)) {
    const el = $(`[name="recipient.${key}"]`, $("#letter-form"));
    if (el) el.value = value || "";
  }
  scheduleSave();
  toast("Recipient filled from the address book.", "ok");
  document.querySelector(".compose").scrollIntoView({ behavior: "smooth", block: "start" });
}

/* ---------- CardDAV ---------- */

class DavError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "DavError";
    this.cause = cause;
  }
}

function basicAuth(user, password) {
  const bytes = new TextEncoder().encode(`${user}:${password}`);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return "Basic " + btoa(binary);
}

function readDavConfig() {
  for (const storage of [localStorage, sessionStorage]) {
    try {
      const raw = storage.getItem(DAV_KEY) || storage.getItem(DAV_SESSION_KEY);
      if (raw) return JSON.parse(raw);
    } catch (err) { console.warn("dav config read failed", err); }
  }
  return null;
}

function saveDavConfig(config) {
  try {
    localStorage.removeItem(DAV_KEY);
    sessionStorage.removeItem(DAV_SESSION_KEY);
    if (config) {
      const storage = config.remember ? localStorage : sessionStorage;
      const key = config.remember ? DAV_KEY : DAV_SESSION_KEY;
      storage.setItem(key, JSON.stringify(config));
    }
  } catch (err) {
    console.warn("dav config save failed", err);
    toast("Could not save the CardDAV settings in this browser.", "error");
  }
}

function forgetDavConfig() {
  try {
    localStorage.removeItem(DAV_KEY);
    sessionStorage.removeItem(DAV_SESSION_KEY);
  } catch (_) { /* ignore */ }
}

function originOf(url) {
  let parsed;
  try { parsed = new URL(url); } catch (_) { throw new DavError("Enter a valid CardDAV address book URL."); }
  const isLocal = ["localhost", "127.0.0.1"].includes(parsed.hostname);
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLocal)) {
    throw new DavError("The address book URL must use HTTPS (HTTP is allowed only for localhost).");
  }
  return parsed.origin;
}

function cookieValue(name) {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : "";
}

function setOriginCookie(origin) {
  const secure = location.protocol === "https:" ? "; Secure" : "";
  if (origin) {
    document.cookie = `${DAV_COOKIE}=${encodeURIComponent(origin)}; Path=/; SameSite=Lax; Max-Age=31536000${secure}`;
  } else {
    document.cookie = `${DAV_COOKIE}=; Path=/; SameSite=Lax; Max-Age=0${secure}`;
  }
}

function davFields() {
  return {
    url: $("#dav-url").value.trim(),
    username: $("#dav-user").value.trim(),
    password: $("#dav-pass").value,
    remember: $("#dav-remember").checked,
  };
}

function fillDavFields(config) {
  if (!config) return;
  $("#dav-url").value = config.url || "";
  $("#dav-user").value = config.username || "";
  $("#dav-pass").value = config.password || "";
  $("#dav-remember").checked = Boolean(config.remember);
}

function davHeaders(config) {
  const headers = {
    "Depth": "1",
    "Content-Type": "application/xml; charset=utf-8",
  };
  if (config.username || config.password) headers["Authorization"] = basicAuth(config.username, config.password);
  return headers;
}

const PROPFIND_BODY = `<?xml version="1.0" encoding="utf-8"?>
<d:propfind xmlns:d="DAV:" xmlns:card="urn:ietf:params:xml:ns:carddav">
  <d:prop>
    <d:getetag/>
    <card:address-data/>
  </d:prop>
</d:propfind>`;

async function propfind(config) {
  let response;
  try {
    response = await fetch(config.url, {
      method: "PROPFIND",
      headers: davHeaders(config),
      body: PROPFIND_BODY,
      mode: "cors",
      credentials: "omit",
      redirect: "follow",
    });
  } catch (err) {
    throw new DavError(
      "Network or CORS failure. The CardDAV server must allow this origin and support PROPFIND. " +
      "You can import a .vcf file instead.",
      err
    );
  }

  if (response.status === 401) throw new DavError("Authentication failed (401). Check the username and password.");
  if (response.status === 403) throw new DavError("Access denied (403). The account needs read access to this address book.");
  if (response.status === 404) throw new DavError("Address book not found (404). Check the URL.");
  if (response.status === 429) throw new DavError("The CardDAV server is rate-limiting requests (429). Try again later.");
  if (!response.ok && response.status !== 207) throw new DavError(`CardDAV request failed (${response.status}).`);

  const text = await response.text();
  return parseDavXml(text);
}

function parseDavXml(text) {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.querySelector("parsererror")) throw new DavError("The CardDAV server returned invalid XML.");
  const responses = Array.from(doc.getElementsByTagNameNS("DAV:", "response"));
  const out = [];
  for (const response of responses) {
    const href = response.getElementsByTagNameNS("DAV:", "href")[0]?.textContent || "";
    const etag = response.getElementsByTagNameNS("DAV:", "getetag")[0]?.textContent || "";
    const data = response.getElementsByTagNameNS("urn:ietf:params:xml:ns:carddav", "address-data")[0]?.textContent;
    if (data) out.push({ href, etag, vcard: data });
  }
  return out;
}

async function testConnection(config) {
  const items = await propfind(config);
  setStatus(`Connected — ${items.length} card${items.length === 1 ? "" : "s"} visible.`, "ok");
  return items;
}

async function fetchContacts(config) {
  const items = await propfind(config);
  const normalized = [];
  for (const item of items) {
    try {
      normalized.push(...parseVcardText(item.vcard, { href: item.href, etag: item.etag, source: "dav" }));
    } catch (err) {
      console.warn("skipping invalid vCard", item.href, err);
    }
  }
  await putContacts(normalized);
  contacts = await getAllContacts();
  renderContacts();
  setStatus(`Fetched ${normalized.length} contact${normalized.length === 1 ? "" : "s"} and saved them in this browser.`, "ok");
  toast(`Fetched ${normalized.length} contacts.`, "ok");
}

async function runDavAction(action, config) {
  if (action === "fetch") await fetchContacts(config);
  else await testConnection(config);
}

async function ensureDav(action) {
  try {
    const config = davFields();
    if (!config.url) throw new DavError("Enter the CardDAV address book URL.");
    const origin = originOf(config.url);
    saveDavConfig(config);

    if (origin !== cookieValue(DAV_COOKIE)) {
      setOriginCookie(origin);
      sessionStorage.setItem("letter.pendingAction", action);
      toast("Reloading once to allow this CardDAV origin…", "");
      location.reload();
      return;
    }

    await runDavAction(action, config);
  } catch (err) {
    setStatus(err.message, "error");
    toast(err.message, "error");
  }
}

function disconnect() {
  forgetDavConfig();
  setOriginCookie("");
  $("#dav-pass").value = "";
  setStatus("Disconnected.");
  toast("Disconnected from CardDAV.");
}

/* ---------- init ---------- */

function defaultDate(style) {
  const locale = style === "fr-formal" ? "fr-FR" : "en-GB";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric" }).format(new Date());
}

function wire() {
  for (const el of profileFields()) {
    el.addEventListener("input", scheduleSave);
    el.addEventListener("change", scheduleSave);
  }

  $("#style").addEventListener("change", () => {
    if (!$("#date").value.trim()) $("#date").value = defaultDate($("#style").value);
  });

  $("#preview-pdf").addEventListener("click", preview);
  $("#download-pdf").addEventListener("click", () => download("pdf"));
  $("#download-eml").addEventListener("click", () => download("eml"));

  $("#dav-form").addEventListener("submit", (event) => {
    event.preventDefault();
    ensureDav("test");
  });
  $("#dav-test").addEventListener("click", () => ensureDav("test"));
  $("#dav-fetch").addEventListener("click", () => ensureDav("fetch"));
  $("#dav-disconnect").addEventListener("click", disconnect);

  $("#vcf-file").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseVcardText(text, { source: "import" });
      await putContacts(parsed);
      contacts = await getAllContacts();
      renderContacts();
      toast(`Imported ${parsed.length} contact${parsed.length === 1 ? "" : "s"}.`, "ok");
    } catch (err) {
      console.error(err);
      toast(err.message || "Could not read that vCard file.", "error");
    }
  });

  $("#vcf-export").addEventListener("click", () => downloadContacts(contacts));
  $("#contact-search").addEventListener("input", (event) => {
    contactFilter = event.target.value;
    renderContacts();
  });

  $("#clear-data").addEventListener("click", async () => {
    if (!confirm("Clear the saved profile, CardDAV settings, and contacts from this browser?")) return;
    localStorage.removeItem(PROFILE_KEY);
    forgetDavConfig();
    setOriginCookie("");
    try { await clearContacts(); } catch (err) { console.warn(err); }
    contacts = [];
    renderContacts();
    location.reload();
  });
}

async function init() {
  wire();

  let profile = null;
  try { profile = JSON.parse(localStorage.getItem(PROFILE_KEY) || "null"); } catch (_) { profile = null; }
  if (profile) applyProfile(profile);
  if (!$("#date").value.trim()) $("#date").value = defaultDate($("#style").value);

  const config = readDavConfig();
  if (config) {
    fillDavFields(config);
    setStatus("Saved CardDAV settings found. Test or fetch to connect.");
    try {
      const origin = originOf(config.url);
      if (origin !== cookieValue(DAV_COOKIE)) {
        setOriginCookie(origin);
        if (!sessionStorage.getItem("letter.originReloaded")) {
          sessionStorage.setItem("letter.originReloaded", "1");
          location.reload();
          return;
        }
      }
    } catch (err) {
      setStatus(err.message, "error");
    }
  }

  try {
    contacts = await getAllContacts();
    renderContacts();
  } catch (err) {
    console.warn("contacts load failed", err);
    toast("Could not open the local contact store.", "error");
  }

  const pending = sessionStorage.getItem("letter.pendingAction");
  if (pending) {
    sessionStorage.removeItem("letter.pendingAction");
    const saved = readDavConfig();
    if (saved) {
      try { await runDavAction(pending, saved); }
      catch (err) { setStatus(err.message, "error"); toast(err.message, "error"); }
    }
  }
}

window.addEventListener("DOMContentLoaded", init);
