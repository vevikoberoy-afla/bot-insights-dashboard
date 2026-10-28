import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { issueWidgetSessionToken } from '@/lib/security/widgetSessionToken'

// GET /api/tracker/[clientId] — serves tracker.js for a specific client
// This is the JS file clients embed on their website
export async function GET(req: NextRequest, props: { params: Promise<{ clientId: string }> }) {
  const params = await props.params;
  const { clientId } = params

  const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'Tracker not found' }, { status: 404 })

  // Fetch active trigger rules for this client
  const { data: rules } = await supabase
    .from('trigger_rules')
    .select('id, name, conditions, actions, frequency_per_session, min_gap_minutes, status')
    .eq('client_id', clientId)
    .eq('status', 'active')

  // Fetch bot config for widget settings
  const { data: bots } = await supabase
    .from('bots')
    .select('id, callout_timer, callout_title, show_callout_only, opening_message')
    .eq('client_id', clientId)
    .eq('status', 'active')
    .limit(1)

  const bot = bots?.[0] || null
  const trackerCapability = issueWidgetSessionToken({ workspaceId: clientId, botId: bot?.id || 'tracker', purpose: 'tracker', ttlSeconds: 86400 })

  const trackerScript = `
(function() {
  'use strict';
  
  var VITTAIN_API = '${process.env.NEXT_PUBLIC_APP_URL || 'https://vittain.ai'}';
  var CLIENT_ID = '${clientId}';
  var TRACKER_TOKEN = '${trackerCapability.token}';
  
  // Session state — persists across page navigations in same session
  window._vittainSession = window._vittainSession || {
    triggers_fired: [],
    coupon_sent: false,
    cart_value: 0,
    pages_visited: [],
    last_trigger_at: null,
    contact_id: null,
    session_id: 'vs_' + (crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), function(b) { return b.toString(16).padStart(2, '0'); }).join('')),
    visit_count: parseInt(localStorage.getItem('_vittain_visits') || '0') + 1,
    time_on_page: 0,
    scroll_depth: 0,
  };
  
  // Increment visit count
  localStorage.setItem('_vittain_visits', window._vittainSession.visit_count.toString());
  
  // Loaded trigger rules from server
  var TRIGGER_RULES = ${JSON.stringify(rules || [])};
  
  // Bot config
  var BOT_CONFIG = ${JSON.stringify(bot)};
  
  // Track time on page
  var _pageStart = Date.now();
  setInterval(function() {
    window._vittainSession.time_on_page = Math.floor((Date.now() - _pageStart) / 1000);
  }, 1000);
  
  // Track scroll depth
  window.addEventListener('scroll', function() {
    var scrolled = (window.scrollY + window.innerHeight) / document.documentElement.scrollHeight;
    window._vittainSession.scroll_depth = Math.max(window._vittainSession.scroll_depth, Math.round(scrolled * 100));
  });
  
  // Track exit intent
  document.addEventListener('mouseleave', function(e) {
    if (e.clientY <= 0) {
      window.vittain('track', 'exit_intent', {});
    }
  });
  
  // Main vittain tracking function
  window.vittain = function(method, event, data) {
    if (method === 'track') {
      handleEvent(event, data || {});
    } else if (method === 'identify') {
      window._vittainSession.contact_id = data.contact_id || data.id;
      sendToBackend('identify', data);
    }
  };
  
  // Also track page view automatically
  window._vittainSession.pages_visited.push(window.location.href);
  handleEvent('page_url', { url: window.location.href });
  
  // Handle idle detection
  var _idleTimer = null;
  function resetIdle() {
    clearTimeout(_idleTimer);
    _idleTimer = setTimeout(function() {
      handleEvent('idle_time', { seconds: 30 });
    }, 30000);
  }
  document.addEventListener('mousemove', resetIdle);
  document.addEventListener('keypress', resetIdle);
  resetIdle();
  
  function handleEvent(eventType, eventData) {
    // Update session state
    if (eventType === 'cart_updated' && eventData.value !== undefined) {
      window._vittainSession.cart_value = eventData.value;
    }
    
    // Evaluate all trigger rules
    TRIGGER_RULES.forEach(function(rule) {
      if (shouldFire(rule, eventType, eventData)) {
        fireTrigger(rule, eventData);
      }
    });
    
    // Send to backend (non-blocking)
    sendToBackend(eventType, eventData);
  }
  
  function shouldFire(rule, eventType, eventData) {
    // Check if already fired this session
    if (rule.frequency_per_session === 1 && window._vittainSession.triggers_fired.indexOf(rule.id) !== -1) return false;
    
    // Check minimum gap between triggers
    if (rule.min_gap_minutes > 0 && window._vittainSession.last_trigger_at) {
      var gap = (Date.now() - window._vittainSession.last_trigger_at) / 60000;
      if (gap < rule.min_gap_minutes) return false;
    }
    
    // Evaluate conditions (all must match — AND logic)
    var conditions = rule.conditions || [];
    return conditions.every(function(cond) {
      return evaluateCondition(cond, eventType, eventData);
    });
  }
  
  function evaluateCondition(cond, eventType, eventData) {
    var sess = window._vittainSession;
    
    if (cond.event !== eventType && cond.event !== 'any') return false;
    
    var val = parseFloat(cond.value) || cond.value;
    
    switch(cond.event) {
      case 'cart_updated':
        var cartVal = eventData.value || sess.cart_value;
        if (cond.operator === '>=') return cartVal >= val;
        if (cond.operator === '<=') return cartVal <= val;
        if (cond.operator === 'between') return cartVal >= val && cartVal <= parseFloat(cond.value2);
        break;
      case 'page_url':
        var url = window.location.href;
        if (cond.operator === 'contains') return url.indexOf(cond.value) !== -1;
        if (cond.operator === 'equals') return url === cond.value;
        if (cond.operator === 'starts_with') return url.startsWith(cond.value);
        break;
      case 'time_on_page':
        if (cond.operator === '>=') return sess.time_on_page >= val;
        break;
      case 'visit_count':
        if (cond.operator === '=') return sess.visit_count === val;
        if (cond.operator === '>=') return sess.visit_count >= val;
        if (cond.operator === 'is_first_visit') return sess.visit_count === 1;
        if (cond.operator === 'is_returning') return sess.visit_count > 1;
        break;
      case 'scroll_depth':
        if (cond.operator === '>=') return sess.scroll_depth >= val;
        break;
      case 'exit_intent':
        return cond.operator === 'is_true';
      case 'idle_time':
        if (cond.operator === '>=') return (eventData.seconds || 0) >= val;
        break;
      case 'checkout_started':
        return cond.operator === 'is_true';
      default:
        return true;
    }
    return false;
  }
  
  function calculateMissingAmount(rule) {
    var target = 0;
    var conditions = rule.conditions || [];
    conditions.forEach(function(c) {
      if (c.event === 'cart_updated' && c.value2) target = parseFloat(c.value2);
      else if (c.event === 'cart_updated' && c.operator === '>=') target = parseFloat(c.value) + 500;
    });
    return Math.max(0, target - window._vittainSession.cart_value);
  }
  
  function fireTrigger(rule, eventData) {
    window._vittainSession.triggers_fired.push(rule.id);
    window._vittainSession.last_trigger_at = Date.now();
    
    var missing = calculateMissingAmount(rule);
    
    (rule.actions || []).forEach(function(action) {
      var msg = (action.message || '').replace('{{cart_value}}', window._vittainSession.cart_value)
        .replace('{{missing_amount}}', missing)
        .replace('{{customer_name}}', window._vittainSession.contact_name || 'there');
      
      if (action.type === 'send_message' || action.type === 'whatsapp_gate') {
        setTimeout(function() {
          if (!action.channel || action.channel === 'web') {
            var displayType = action.type === 'whatsapp_gate' ? 'whatsapp_gate' : (action.message_type || 'callout');
            openWidgetWithMessage(msg, displayType, action.coupon_code, action.discount_text);
          }
        }, (action.delay_seconds || 0) * 1000);
      }
      
      if (action.type === 'fire_mcp') {
        executeMCPAction(action, eventData);
      }
    });
    
    // Record in backend
    sendToBackend('trigger_fired', { rule_id: rule.id, rule_name: rule.name });
  }
  
  function openWidgetWithMessage(message, type, couponCode, discountText) {
    // Send trigger event to native Vittain widget
    window.postMessage({
      type: 'vittain_trigger',
      payload: {
        message: message,
        displayType: type,
        coupon_code: couponCode,
        discount_text: discountText
      }
    }, '*');
  }
  
  function executeMCPAction(action, eventData) {
    if (!action.webhook_url) return;
    fetch(action.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contact_id: window._vittainSession.contact_id,
        cart_value: window._vittainSession.cart_value,
        session_id: window._vittainSession.session_id,
        event_data: eventData,
      })
    }).then(function(r) { return r.json(); }).then(function(resp) {
      if (resp.coupon_code) {
        window._vittainSession.coupon_sent = resp.coupon_code;
        var couponMsg = (action.response_template || 'Here is your code: {{coupon_code}}')
          .replace('{{coupon_code}}', resp.coupon_code)
          .replace('{{response.coupon_code}}', resp.coupon_code);
        openWidgetWithMessage(couponMsg, 'full');
      }
    });
  }
  
  function sendToBackend(eventType, data) {
    // Fire and forget — don't block UI
    var payload = {
      client_id: CLIENT_ID,
      contact_id: window._vittainSession.contact_id,
      event_type: eventType,
      event_data: data,
      session_id: window._vittainSession.session_id,
      page_url: window.location.href,
      channel: 'web'
    };
    
    if (navigator.sendBeacon) {
      fetch(VITTAIN_API + '/api/events/ingest', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Widget-Session-Token': TRACKER_TOKEN }, body: JSON.stringify(payload), keepalive: true }).catch(function() {});
    } else {
      fetch(VITTAIN_API + '/api/events/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Widget-Session-Token': TRACKER_TOKEN },
        body: JSON.stringify(payload),
        keepalive: true
      }).catch(function(){});
    }
  }
  
  // Callout timer on load
  if (BOT_CONFIG && BOT_CONFIG.callout_timer >= 0 && BOT_CONFIG.callout_title) {
    setTimeout(function() {
      openWidgetWithMessage(BOT_CONFIG.callout_title, BOT_CONFIG.show_callout_only ? 'callout' : 'full');
    }, (BOT_CONFIG.callout_timer || 0) * 1000);
  }
  
  console.log('[Vittain] Tracker loaded. ' + TRIGGER_RULES.length + ' trigger rules active.');
})();
`

  return new NextResponse(trackerScript, {
    headers: {
      'Content-Type': 'application/javascript',
      'Cache-Control': 'public, max-age=60', // cache 1 minute
      'Access-Control-Allow-Origin': '*',
    }
  })
}
