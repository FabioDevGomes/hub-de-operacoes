(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var endpoint = script.dataset.endpoint || new URL("./collect.php", script.src).href;
  endpoint = new URL(endpoint, document.baseURI).href;
  var productKey = script.dataset.productKey || "";
  var presellHost = script.dataset.presellHost || window.location.hostname;
  var statusSelector = script.dataset.statusSelector || "";
  var stateKey = "tracking_mvp_attribution_v1";
  var visitorKey = "tracking_mvp_visitor_v1";
  var clickParameters = ["gclid", "gbraid", "wbraid"];
  var utmParameters = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content"];

  function uuid() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") {
      return window.crypto.randomUUID();
    }
    if (window.crypto && typeof window.crypto.getRandomValues === "function") {
      var bytes = new Uint8Array(16);
      window.crypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      var hex = Array.prototype.map.call(bytes, function (byte) {
        return byte.toString(16).padStart(2, "0");
      }).join("");
      return hex.slice(0, 8) + "-" + hex.slice(8, 12) + "-" + hex.slice(12, 16) + "-" +
        hex.slice(16, 20) + "-" + hex.slice(20);
    }
    throw new Error("Secure random IDs are unavailable.");
  }

  function readStored(key, fallback) {
    try {
      var value = window.sessionStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function saveStored(key, value) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
      // Tracking still works for the current page if browser storage is disabled.
    }
  }

  function getVisitorId() {
    var value = "";
    try {
      value = window.sessionStorage.getItem(visitorKey) || "";
      if (!value) {
        value = uuid();
        window.sessionStorage.setItem(visitorKey, value);
      }
    } catch (error) {
      value = uuid();
    }
    return value;
  }

  function getAttribution() {
    var attribution = readStored(stateKey, {});
    var params = new URLSearchParams(window.location.search);
    clickParameters.concat(utmParameters).forEach(function (key) {
      var value = params.get(key);
      if (value && value.length <= 2048) attribution[key] = value;
    });
    saveStored(stateKey, attribution);
    return attribution;
  }

  function safeReferrer() {
    if (!document.referrer) return null;
    try {
      return new URL(document.referrer).origin;
    } catch (error) {
      return null;
    }
  }

  function currentPageUrl() {
    return window.location.origin + window.location.pathname;
  }

  function eventPayload(eventType, clickId, destinationUrl, clickbankExtclid) {
    var attribution = getAttribution();
    return {
      event_id: uuid(),
      event_type: eventType,
      click_id: clickId || null,
      clickbank_extclid: clickbankExtclid || null,
      product_key: productKey || null,
      presell_host: presellHost || null,
      visitor_id: getVisitorId(),
      gclid: attribution.gclid || null,
      gbraid: attribution.gbraid || null,
      wbraid: attribution.wbraid || null,
      utm_source: attribution.utm_source || null,
      utm_medium: attribution.utm_medium || null,
      utm_campaign: attribution.utm_campaign || null,
      utm_term: attribution.utm_term || null,
      utm_content: attribution.utm_content || null,
      page_url: currentPageUrl(),
      referrer: safeReferrer(),
      destination_url: destinationUrl || null
    };
  }

  function notify(name, detail) {
    window.dispatchEvent(new CustomEvent(name, { detail: detail }));
  }

  function updateTestStatus(text) {
    if (!statusSelector) return;
    try {
      var element = document.querySelector(statusSelector);
      if (element) element.textContent = text;
    } catch (error) {
      // Invalid status selectors do not interrupt tracking.
    }
  }

  function sendPageView() {
    var payload = eventPayload("page_view", null, null);
    fetch(endpoint, {
      method: "POST",
      mode: "cors",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      keepalive: true,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }).then(function (response) {
      return response.json().catch(function () {
        return { ok: false };
      }).then(function (body) {
        var detail = { ok: response.ok && body.ok === true, recorded: body.recorded === true };
        notify("tracking-mvp:page-view-result", detail);
        updateTestStatus(detail.ok ? "Visita recebida pelo endpoint." : "O endpoint respondeu com erro. Confira a configuração.");
      });
    }).catch(function () {
      notify("tracking-mvp:page-view-result", { ok: false, networkError: true });
      updateTestStatus("Não foi possível conectar ao endpoint. Confira HTTPS, origem permitida e configuração.");
    });
  }

  function destinationWithoutQuery(url) {
    try {
      var parsed = new URL(url, document.baseURI);
      return parsed.origin + parsed.pathname;
    } catch (error) {
      return null;
    }
  }

  function isClickBankHoplink(value) {
    try {
      var destination = new URL(value, document.baseURI);
      var host = destination.hostname.toLowerCase();
      if (destination.protocol !== "https:") return false;

      // ClickBank's encrypted HopLinks encode affiliate/vendor in the host,
      // so they may have Flow parameters (or no query string) but no readable
      // affiliate/vendor query parameters. The bare host still needs both.
      if (host.endsWith(".hop.clickbank.net")) return true;
      return host === "hop.clickbank.net" &&
        Boolean(destination.searchParams.get("affiliate")) &&
        Boolean(destination.searchParams.get("vendor"));
    } catch (error) {
      return false;
    }
  }

  function isGuruMediaTrackingLink(value, link) {
    try {
      var destination = new URL(value, document.baseURI);
      var host = destination.hostname.toLowerCase();
      if (destination.protocol !== "https:") return false;
      return Boolean(link && link.hasAttribute("data-track-gurumedia")) ||
        host === "fasttrack20.com" || host.endsWith(".fasttrack20.com");
    } catch (error) {
      return false;
    }
  }

  document.addEventListener("click", function (event) {
    var target = event.target;
    if (!target || typeof target.closest !== "function") return;
    var link = target.closest("a[href]");
    if (!link) return;

    var isClickBank = isClickBankHoplink(link.href) || link.hasAttribute("data-track-clickbank");
    var isGuruMedia = isGuruMediaTrackingLink(link.href, link);
    if (!link.hasAttribute("data-track-outbound") && !isClickBank && !isGuruMedia) return;

    var destination = destinationWithoutQuery(link.href);
    if (!destination) return;

    var clickId = uuid();
    var clickbankExtclid = null;
    if (isClickBank) {
      try {
        var clickbankUrl = new URL(link.href, document.baseURI);
        var extclidValues = clickbankUrl.searchParams.getAll("extclid");
        var extclid = extclidValues.length === 1 ? extclidValues[0] : null;
        if (extclid === null || extclid === "") {
          clickbankExtclid = clickId;
          clickbankUrl.searchParams.set("extclid", clickbankExtclid);
          link.href = clickbankUrl.href;
        } else if (/^[\x21-\x7e]{1,256}$/.test(extclid)) {
          // Flow Tracking can own this opaque value. Preserve it and record it
          // separately so INS v8 can be reconciled without replacing extclid.
          clickbankExtclid = extclid;
        }
      } catch (error) {
        // Invalid destinations do not interrupt the outbound event.
      }
    }
    if (isGuruMedia) {
      try {
        var guruMediaUrl = new URL(link.href, document.baseURI);
        // Reserve sub6 for the Hub click ID on GuruMedia links. This leaves
        // the existing Flow mapping (sub1–sub5) untouched.
        guruMediaUrl.searchParams.set("sub6", clickId);
        link.href = guruMediaUrl.href;
      } catch (error) {
        // Invalid destinations do not interrupt outbound event capture.
      }
    }
    var payload = eventPayload("outbound_click", clickId, destination, clickbankExtclid);
    var body = new Blob([JSON.stringify(payload)], { type: "text/plain;charset=UTF-8" });
    var queued = false;

    if (navigator.sendBeacon) {
      try {
        queued = navigator.sendBeacon(endpoint, body);
      } catch (error) {
        queued = false;
      }
    }
    if (!queued) {
      fetch(endpoint, {
        method: "POST",
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        keepalive: true,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      }).catch(function () {});
    }

    notify("tracking-mvp:outbound-queued", { queued: queued, clickId: payload.click_id });
  }, true);

  sendPageView();
})();
