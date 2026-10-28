(function (window, document) {
  'use strict';

  // Extract settings from the global object setup by the snippet or script attributes
  const settings = window.VittainSettings || {};
  const scriptTag = document.currentScript;
  const clientId = settings.clientId || 
    (scriptTag && (scriptTag.getAttribute('data-client-id') || scriptTag.getAttribute('data-ctx'))) ||
    localStorage.getItem('vittain_client_id');
  let trackerToken = settings.sessionToken || (scriptTag && scriptTag.getAttribute('data-session-token')) || '';

  if (!clientId) {
    console.warn('[Vittain] Missing clientId in tracker.js script tag (data-client-id) or window.VittainSettings.');
  }
  // Determine the API base URL
  let API_BASE = '';
  if (scriptTag && scriptTag.src) {
    API_BASE = scriptTag.src.split('/tracker.js')[0];
  } else {
    API_BASE = window.location.origin;
  }
  const trackerTokenReady = trackerToken || !clientId
    ? Promise.resolve(trackerToken)
    : fetch(`${API_BASE}/api/tracker/token?client_id=${encodeURIComponent(clientId)}`)
        .then(response => response.ok ? response.json() : Promise.reject(new Error('Tracker capability unavailable')))
        .then(data => (trackerToken = data.token || ''))
        .catch(() => '')

  // Visitor Identification
  const VISITOR_KEY = 'vittain_vid';
  let visitorId = localStorage.getItem(VISITOR_KEY);
  if (!visitorId) {
    visitorId = 'vid_' + (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join(''));
    localStorage.setItem(VISITOR_KEY, visitorId);
  }

  // Session State
  window._vittainSession = window._vittainSession || {
    triggers_fired: [],
    coupon_sent: false,
    cart_value: 0,
    pages_visited: [],
    last_trigger_at: null,
    contact_id: visitorId,
    active_rules: []
  };

  // Fetch active trigger rules on load
  function fetchActiveRules() {
    if (!clientId) return;
    fetch(`${API_BASE}/api/tracker/rules?clientId=${encodeURIComponent(clientId)}`)
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.rules)) {
          window._vittainSession.active_rules = data.rules;
        }
      }).catch(() => {});
  }
  fetchActiveRules();

  // Define the core tracking function
  function trackEvent(eventName, payload = {}) {
    const enrichedPayload = {
      ...payload,
      $url: window.location.href,
      $path: window.location.pathname,
      $title: document.title,
      $referrer: document.referrer,
      $timestamp: new Date().toISOString()
    };

    if (clientId) trackerTokenReady.then(token => token && fetch(`${API_BASE}/api/events/ingest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Widget-Session-Token': token },
        body: JSON.stringify({
          client_id: clientId,
          contact_id: visitorId,
          event_type: eventName,
          event_data: payload,
          page_url: window.location.href,
          channel: 'web'
        })
      })
      .then(res => res.json())
      .then(data => {
        if (data && Array.isArray(data.matched_rules) && data.matched_rules.length > 0) {
          data.matched_rules.forEach(rule => {
            const act = (rule.actions && rule.actions[0]) || {};
            window.postMessage({
              type: 'vittain_trigger',
              payload: {
                rule_id: rule.id,
                name: rule.name,
                message: act.message || rule.message,
                displayType: rule.popup_style || act.message_type || 'callout',
                popup_style: rule.popup_style || act.message_type || 'callout',
                tone: rule.tone || 'casual',
                delay_seconds: rule.delay_seconds || act.delay_seconds || 0,
                auto_dismiss_seconds: rule.auto_dismiss_seconds || 0,
                cta_text: rule.cta_text || null,
                cta_url: rule.cta_url || null,
                coupon_code: act.coupon_code || null,
                discount_text: act.discount_text || null,
              }
            }, '*');
          });
        }
      })
      .catch(err => {
        console.warn('[Vittain] Events tracking warning:', err);
      }));

    evaluateRules(eventName, payload);
  }

  // Client-Side Rule Evaluation Engine
  function evaluateRules(eventName, payload) {
    const session = window._vittainSession;

    if (eventName === 'cart_updated' && payload.value !== undefined) {
      session.cart_value = Number(payload.value);
    }
    if (eventName === 'page_viewed') {
      session.pages_visited.push(window.location.pathname);
    }

    const now = Date.now();
    const MIN_GAP_MS = 3000;
    if (session.last_trigger_at && (now - session.last_trigger_at < MIN_GAP_MS)) return;

    for (const rule of session.active_rules) {
      if (session.triggers_fired.includes(rule.name || rule.id)) continue;

      let matched = false;

      if (rule.trigger_event === eventName) {
        if (rule.condition && rule.condition.cart_value_target) {
          if (session.cart_value >= (rule.condition.cart_min || 0) && session.cart_value < rule.condition.cart_value_target) {
            matched = true;
          }
        } else {
          matched = true;
        }
      }

      if (matched) {
        session.triggers_fired.push(rule.name || rule.id);
        session.last_trigger_at = now;

        let missing = '0';
        if (rule.condition && rule.condition.cart_value_target) {
          missing = Math.max(0, rule.condition.cart_value_target - session.cart_value).toString();
        }

        let msg = rule.message || '';
        msg = msg
          .replace(/\{\{missing_amount\}\}/g, missing)
          .replace(/\{\{cart_value\}\}/g, session.cart_value.toString());

        // Dispatch to Vittain Webchat Widget
        window.postMessage({
          type: 'vittain_trigger',
          payload: {
            rule_id: rule.id,
            name: rule.name,
            message: msg,
            displayType: rule.popup_style || rule.action_type || 'callout',
            popup_style: rule.popup_style || 'callout',
            tone: rule.tone || 'casual',
            delay_seconds: rule.delay_seconds || 0,
            auto_dismiss_seconds: rule.auto_dismiss_seconds || 0,
            cta_text: rule.cta_text || null,
            cta_url: rule.cta_url || null,
            coupon_code: rule.coupon_code || null,
            discount_text: rule.discount_text || null,
          }
        }, '*');

        break;
      }
    }
  }

  // Expose API on global window
  const existingQueue = window.vittain && window.vittain.q ? window.vittain.q : [];
  window.vittain = function (action, eventName, payload) {
    if (action === 'track') {
      trackEvent(eventName, payload);
    }
  };

  // Process queued calls
  for (let i = 0; i < existingQueue.length; i++) {
    const args = existingQueue[i];
    window.vittain.apply(null, args);
  }

  if (settings.autoTrack !== false) {
    window.vittain('track', 'page_viewed');
  }

})(window, document);
