import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

const trackerSource = readFileSync(new URL("../public/track.js", import.meta.url), "utf8");

async function clickTrackedLink({ href, attributes = [], productKey = "metabo-drops", presellHost = "presell.example", search = "?gclid=TEST-GCLID-123", storage = new Map() }) {
  const ids = [
    "00000000-0000-4000-8000-000000000001", // page-view event
    "00000000-0000-4000-8000-000000000002", // visitor
    "00000000-0000-4000-8000-000000000003", // outbound click
    "00000000-0000-4000-8000-000000000004"  // outbound event
  ];
  const listeners = {};
  const beacons = [];
  const linkAttributes = new Set(attributes);
  const link = {
    href,
    hasAttribute(name) { return linkAttributes.has(name); }
  };
  const document = {
    currentScript: { dataset: { endpoint: "https://track.example/collect.php", productKey, presellHost }, src: "https://track.example/track.js" },
    baseURI: `https://presell.example/page.html${search}`,
    referrer: "",
    addEventListener(name, callback) { listeners[name] = callback; }
  };
  class FakeCustomEvent {
    constructor(type, init) { this.type = type; this.detail = init.detail; }
  }
  const window = {
    crypto: { randomUUID() { return ids.shift(); } },
    location: { origin: "https://presell.example", pathname: "/page.html", search },
    sessionStorage: {
      getItem(key) { return storage.has(key) ? storage.get(key) : null; },
      setItem(key, value) { storage.set(key, value); }
    },
    dispatchEvent() {}
  };
  const navigator = {
    sendBeacon(endpoint, body) { beacons.push({ endpoint, body }); return true; }
  };
  const fetch = () => Promise.resolve({ ok: true, json: async () => ({ ok: true, recorded: true }) });

  vm.runInNewContext(trackerSource, { window, document, navigator, fetch, URL, URLSearchParams, Blob, CustomEvent: FakeCustomEvent });
  listeners.click({ target: { closest(selector) { assert.equal(selector, "a[href]"); return link; } } });

  const outbound = beacons.find(beacon => beacon.endpoint === "https://track.example/collect.php");
  const event = outbound ? JSON.parse(await outbound.body.text()) : null;
  return { href: link.href, event, beacons };
}

test("HopLinks ClickBank são detectados sem atributos e recebem extclid próprio quando não existe", async () => {
  const result = await clickTrackedLink({
    href: "https://hop.clickbank.net/?affiliate=testaff&vendor=testvendor&tid=presell_a"
  });
  const destination = new URL(result.href);

  assert.ok(result.event, "a delegação deve capturar o HopLink sem data-attributes");
  assert.equal(destination.searchParams.get("tid"), "presell_a");
  assert.equal(destination.searchParams.get("affiliate"), "testaff");
  assert.equal(destination.searchParams.get("vendor"), "testvendor");
  assert.equal(destination.searchParams.get("extclid"), result.event.click_id);
  assert.equal(result.event.clickbank_extclid, result.event.click_id);
  assert.equal(result.event.gclid, "TEST-GCLID-123");
  assert.equal(result.event.product_key, "metabo-drops");
  assert.equal(result.event.presell_host, "presell.example");
});

test("utm_campaign da visita é registrado no evento de saída do HopLink ClickBank", async () => {
  const campaignId = "24442535650";
  const result = await clickTrackedLink({
    href: "https://hop.clickbank.net/?affiliate=testaff&vendor=testvendor&tid=presell_a",
    search: `?gclid=TEST-GCLID-123&utm_campaign=${campaignId}`
  });

  assert.ok(result.event, "o clique de saída deve gerar um evento rastreado");
  assert.equal(result.event.event_type, "outbound_click");
  assert.equal(result.event.utm_campaign, campaignId);
  assert.equal(result.event.gclid, "TEST-GCLID-123");
  assert.equal(result.event.clickbank_extclid, result.event.click_id);
  assert.equal(new URL(result.href).searchParams.get("extclid"), result.event.clickbank_extclid);
});

test("utm_campaign duplicado é omitido do evento de saída", async () => {
  const result = await clickTrackedLink({
    href: "https://hop.clickbank.net/?affiliate=testaff&vendor=testvendor",
    search: "?gclid=TEST-GCLID-123&utm_campaign=24442535650&utm_campaign=24423808553"
  });

  assert.ok(result.event);
  assert.equal(result.event.utm_campaign, null, "valores duplicados não devem ser tratados como um ID confiável");
});

test("nova visita sem utm_campaign não herda campanha anterior da sessão", async () => {
  const storage = new Map([[
    "tracking_mvp_attribution_v2",
    JSON.stringify({ gclid: "OLD-GCLID", utm_campaign: "24442535650" })
  ]]);
  const result = await clickTrackedLink({
    href: "https://hop.clickbank.net/?affiliate=testaff&vendor=testvendor",
    search: "?gclid=NEW-GCLID",
    storage
  });

  assert.ok(result.event);
  assert.equal(result.event.gclid, "NEW-GCLID");
  assert.equal(result.event.utm_campaign, null, "a visita nova não deve reutilizar o ID da campanha anterior");
});

test("extclid existente da Flow é preservado e registrado separadamente", async () => {
  const flowExtclid = "flow-session-id-with-opaque-value-12345678901234567890";
  const href = `https://hop.clickbank.net/?affiliate=testaff&vendor=testvendor&extclid=${encodeURIComponent(flowExtclid)}&ft_sid=session&aff_sub1=campaign&tid=presell_a`;
  const result = await clickTrackedLink({ href });
  const destination = new URL(result.href);

  assert.ok(result.event);
  assert.equal(destination.searchParams.get("extclid"), flowExtclid, "o identificador da Flow não pode ser sobrescrito");
  assert.equal(destination.searchParams.get("ft_sid"), "session");
  assert.equal(destination.searchParams.get("aff_sub1"), "campaign");
  assert.equal(destination.searchParams.get("tid"), "presell_a");
  assert.notEqual(result.event.click_id, flowExtclid, "o ID interno permanece UUID próprio");
  assert.equal(result.event.clickbank_extclid, flowExtclid);
  assert.equal(result.event.product_key, "metabo-drops");
  assert.equal(result.event.gclid, "TEST-GCLID-123");
});

test("HopLink criptografado com extclid da Flow é detectado e preservado", async () => {
  const flowExtclid = "ftsession_a3-ea09-4f20-b2da-7502745502ba";
  const href = `https://b6749iciw98kxl-0kf7-p83jsf.hop.clickbank.net/?extclid=${flowExtclid}&ft_sid=session&tid=presell_a`;
  const result = await clickTrackedLink({ href });
  const destination = new URL(result.href);

  assert.ok(result.event, "HopLink criptografado deve ser detectado pelo host");
  assert.equal(destination.searchParams.get("extclid"), flowExtclid);
  assert.equal(destination.searchParams.get("ft_sid"), "session");
  assert.equal(destination.searchParams.get("tid"), "presell_a");
  assert.equal(result.event.clickbank_extclid, flowExtclid);
  assert.notEqual(result.event.click_id, flowExtclid);
});

test("HopLink criptografado sem extclid recebe UUID próprio, sem precisar da Flow", async () => {
  const href = "https://b6749iciw98kxl-0kf7-p83jsf.hop.clickbank.net/?ft_sid=session&tid=presell_a";
  const result = await clickTrackedLink({ href });
  const destination = new URL(result.href);

  assert.ok(result.event, "HopLink criptografado deve ser rastreado sem Flow");
  assert.equal(destination.searchParams.get("extclid"), result.event.click_id);
  assert.equal(destination.searchParams.get("ft_sid"), "session");
  assert.equal(destination.searchParams.get("tid"), "presell_a");
  assert.equal(result.event.clickbank_extclid, result.event.click_id);
});

test("host ClickBank simples continua exigindo affiliate e vendor", async () => {
  const result = await clickTrackedLink({ href: "https://hop.clickbank.net/?extclid=flow-value" });
  assert.equal(result.event, null);
});

test("atributos antigos continuam funcionando em links ClickBank marcados", async () => {
  const flowExtclid = "existing-flow-value-123456789012345678901234567890";
  const result = await clickTrackedLink({
    href: `https://seller.hop.clickbank.net/?affiliate=testaff&vendor=testvendor&extclid=${flowExtclid}`,
    attributes: ["data-track-outbound", "data-track-clickbank"]
  });
  assert.ok(result.event);
  assert.equal(new URL(result.href).searchParams.get("extclid"), flowExtclid);
  assert.equal(result.event.clickbank_extclid, flowExtclid);
  assert.equal(result.event.product_key, "metabo-drops");
});

test("links de saída legados ainda são registrados sem alterar destinos não ClickBank", async () => {
  const result = await clickTrackedLink({
    href: "https://seller.example/buy?tid=presell_a",
    attributes: ["data-track-outbound"]
  });
  const destination = new URL(result.href);

  assert.ok(result.event);
  assert.equal(destination.searchParams.get("tid"), "presell_a");
  assert.equal(destination.searchParams.has("extclid"), false);
  assert.equal(result.event.clickbank_extclid, null);
  assert.equal(result.event.product_key, "metabo-drops");
});

test("links comuns não marcados não geram evento de saída", async () => {
  const result = await clickTrackedLink({ href: "https://seller.example/buy?tid=presell_a" });
  assert.equal(result.event, null);
});

test("a tag scoped to another product records that product key", async () => {
  const result = await clickTrackedLink({
    href: "https://hop.clickbank.net/?affiliate=testaff&vendor=testvendor",
    productKey: "other-product"
  });
  assert.equal(result.event.product_key, "other-product");
  assert.equal(result.event.presell_host, "presell.example");
});
