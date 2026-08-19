/**
 * AI-F embeddable chat widget. Tenants embed this via a single script tag:
 *
 *   <script src="https://<app-domain>/widget.js" data-tenant-id="..." async></script>
 *
 * Deliberately plain, dependency-free JS (no React/Next build step) since
 * this runs inside an arbitrary third-party page, not our own app — it
 * can't assume anything about that page's bundler, CSS, or JS globals.
 * Everything is rendered inside a Shadow DOM so the widget's styles can
 * never leak into (or be broken by) the host page's own CSS, in either
 * direction.
 */
(function () {
  "use strict";

  var scriptEl = document.currentScript;
  if (!scriptEl) return;

  var tenantId = scriptEl.getAttribute("data-tenant-id");
  if (!tenantId) {
    console.error("[AI-F widget] Missing data-tenant-id attribute on the widget <script> tag.");
    return;
  }

  var apiOrigin = new URL(scriptEl.src, window.location.href).origin;
  var apiUrl = apiOrigin + "/api/widget/" + encodeURIComponent(tenantId) + "/message";

  var VISITOR_ID_KEY = "aif-widget-visitor-id";
  function getVisitorId() {
    try {
      var existing = window.localStorage.getItem(VISITOR_ID_KEY);
      if (existing) return existing;
      var generated =
        window.crypto && window.crypto.randomUUID
          ? window.crypto.randomUUID()
          : "v-" + Date.now() + "-" + Math.random().toString(36).slice(2);
      window.localStorage.setItem(VISITOR_ID_KEY, generated);
      return generated;
    } catch {
      // localStorage unavailable (private browsing, disabled storage, etc.)
      // — fall back to a per-page-load id rather than failing the widget.
      return "v-" + Date.now() + "-" + Math.random().toString(36).slice(2);
    }
  }
  var visitorId = getVisitorId();

  function init() {
    var host = document.createElement("div");
    host.setAttribute("data-aif-widget-host", "");
    document.body.appendChild(host);
    var shadow = host.attachShadow({ mode: "open" });

    var style = document.createElement("style");
    style.textContent =
      ":host{all:initial}" +
      "*{box-sizing:border-box;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif}" +
      ".aif-bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;" +
      "background:#111827;color:#fff;border:none;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.25);" +
      "font-size:24px;line-height:1;z-index:2147483647}" +
      ".aif-bubble:focus-visible{outline:2px solid #6366f1;outline-offset:2px}" +
      ".aif-panel{position:fixed;bottom:88px;right:20px;width:340px;max-width:calc(100vw - 32px);" +
      "height:480px;max-height:calc(100vh - 120px);background:#fff;border-radius:12px;" +
      "box-shadow:0 10px 40px rgba(0,0,0,.2);display:flex;flex-direction:column;overflow:hidden;" +
      "z-index:2147483647}" +
      ".aif-panel[hidden]{display:none}" +
      ".aif-header{background:#111827;color:#fff;padding:12px 16px;display:flex;" +
      "justify-content:space-between;align-items:center;font-weight:600;font-size:14px}" +
      ".aif-close{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;padding:4px}" +
      ".aif-close:focus-visible{outline:2px solid #fff;outline-offset:2px}" +
      ".aif-log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px}" +
      ".aif-msg{max-width:85%;padding:8px 12px;border-radius:10px;font-size:14px;line-height:1.4;" +
      "white-space:pre-wrap;word-break:break-word}" +
      ".aif-msg-user{align-self:flex-end;background:#6366f1;color:#fff;border-bottom-right-radius:2px}" +
      ".aif-msg-assistant{align-self:flex-start;background:#f3f4f6;color:#111827;border-bottom-left-radius:2px}" +
      ".aif-form{display:flex;gap:8px;padding:12px;border-top:1px solid #e5e7eb}" +
      ".aif-input{flex:1;border:1px solid #d1d5db;border-radius:8px;padding:8px 10px;font-size:14px}" +
      ".aif-input:focus-visible{outline:2px solid #6366f1;outline-offset:1px}" +
      ".aif-send{background:#111827;color:#fff;border:none;border-radius:8px;padding:0 14px;" +
      "font-size:14px;cursor:pointer}" +
      ".aif-send:disabled{opacity:.5;cursor:not-allowed}" +
      ".aif-send:focus-visible{outline:2px solid #6366f1;outline-offset:1px}" +
      "@media (max-width:480px){.aif-panel{position:fixed;inset:0;width:100%;height:100%;" +
      "max-width:100%;max-height:100%;border-radius:0;bottom:0;right:0}}";
    shadow.appendChild(style);

    var bubble = document.createElement("button");
    bubble.className = "aif-bubble";
    bubble.type = "button";
    bubble.setAttribute("aria-label", "Open chat");
    bubble.setAttribute("aria-expanded", "false");
    bubble.setAttribute("aria-controls", "aif-panel");
    bubble.textContent = "💬";
    shadow.appendChild(bubble);

    var panel = document.createElement("div");
    panel.className = "aif-panel";
    panel.id = "aif-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-label", "Chat");
    panel.hidden = true;
    shadow.appendChild(panel);

    var header = document.createElement("div");
    header.className = "aif-header";
    var headerTitle = document.createElement("span");
    headerTitle.textContent = "Chat with us";
    var closeBtn = document.createElement("button");
    closeBtn.className = "aif-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close chat");
    closeBtn.textContent = "✕";
    header.appendChild(headerTitle);
    header.appendChild(closeBtn);
    panel.appendChild(header);

    var log = document.createElement("div");
    log.className = "aif-log";
    log.setAttribute("role", "log");
    log.setAttribute("aria-live", "polite");
    log.setAttribute("aria-relevant", "additions");
    panel.appendChild(log);

    var form = document.createElement("form");
    form.className = "aif-form";
    var inputLabel = document.createElement("label");
    inputLabel.htmlFor = "aif-input";
    inputLabel.textContent = "Message";
    inputLabel.style.position = "absolute";
    inputLabel.style.width = "1px";
    inputLabel.style.height = "1px";
    inputLabel.style.overflow = "hidden";
    inputLabel.style.clip = "rect(0,0,0,0)";
    var input = document.createElement("input");
    input.className = "aif-input";
    input.id = "aif-input";
    input.type = "text";
    input.placeholder = "Type a message…";
    input.autocomplete = "off";
    var sendBtn = document.createElement("button");
    sendBtn.className = "aif-send";
    sendBtn.type = "submit";
    sendBtn.textContent = "Send";
    form.appendChild(inputLabel);
    form.appendChild(input);
    form.appendChild(sendBtn);
    panel.appendChild(form);

    function appendMessage(role, text) {
      var msg = document.createElement("div");
      msg.className = "aif-msg " + (role === "user" ? "aif-msg-user" : "aif-msg-assistant");
      msg.textContent = text;
      log.appendChild(msg);
      log.scrollTop = log.scrollHeight;
    }

    function openPanel() {
      panel.hidden = false;
      bubble.setAttribute("aria-expanded", "true");
      input.focus();
    }
    function closePanel() {
      panel.hidden = true;
      bubble.setAttribute("aria-expanded", "false");
      bubble.focus();
    }

    bubble.addEventListener("click", function () {
      if (panel.hidden) openPanel();
      else closePanel();
    });
    closeBtn.addEventListener("click", closePanel);
    panel.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closePanel();
    });

    var sending = false;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var text = input.value.trim();
      if (!text || sending) return;
      input.value = "";
      appendMessage("user", text);
      sending = true;
      sendBtn.disabled = true;

      fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorId: visitorId, message: text }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (result.ok && result.data && result.data.reply) {
            appendMessage("assistant", result.data.reply);
          } else {
            appendMessage("assistant", "Sorry, something went wrong. Please try again.");
          }
        })
        .catch(function () {
          appendMessage("assistant", "Sorry, we couldn't reach the server. Please try again.");
        })
        .finally(function () {
          sending = false;
          sendBtn.disabled = false;
        });
    });
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener("DOMContentLoaded", init);
  }
})();
