(function () {
  'use strict';

  // Prevent multiple initializations
  if (document.getElementById('siexy-concierge-root')) {
    return;
  }

  // 1. Resolve Script Tag and Configuration
  let script = document.currentScript;
  if (!script) {
    const scripts = document.getElementsByTagName('script');
    for (let i = scripts.length - 1; i >= 0; i--) {
      const src = scripts[i].src || '';
      if (src.includes('widget.js')) {
        script = scripts[i];
        if (script.getAttribute('data-bot') || script.getAttribute('data-ctx')) break;
      }
    }
  }

  let CTX_ID = script?.getAttribute('data-ctx') ||
    script?.getAttribute('data-context-id') ||
    script?.getAttribute('data-client-id') ||
    window.VITTAIN_CONFIG?.contextId ||
    window.RAG_CONFIG?.contextId || '';

  let BOT_ID = script?.getAttribute('data-bot') ||
    script?.getAttribute('data-bot-id') ||
    script?.getAttribute('data-id') ||
    window.VITTAIN_CONFIG?.botId ||
    window.RAG_CONFIG?.botId || '';

  let API_BASE = window.VITTAIN_CONFIG?.apiBase || window.RAG_CONFIG?.apiBase || '';

  if (script?.src) {
    try {
      const parsedUrl = new URL(script.src, window.location.href);
      if (!API_BASE) {
        API_BASE = parsedUrl.origin;
      }
      const params = parsedUrl.searchParams;
      if (!CTX_ID) CTX_ID = params.get('ctx') || params.get('contextId') || params.get('clientId') || '';
      if (!BOT_ID) BOT_ID = params.get('bot') || params.get('botId') || params.get('id') || '';
    } catch (e) {
      if (!API_BASE) API_BASE = script.src.split('/widget.js')[0];
    }
  }

  if (!API_BASE) {
    API_BASE = window.location.origin;
  }

  if (CTX_ID === 'null' || CTX_ID === 'undefined' || CTX_ID === 'YOUR_CLIENT_ID') CTX_ID = '';
  if (BOT_ID === 'null' || BOT_ID === 'undefined' || BOT_ID === 'YOUR_BOT_ID') BOT_ID = '';

  const sessionStoreKey = `siexy_chat_session_${CTX_ID || BOT_ID || 'default'}`;
  const sessionStartedStoreKey = `${sessionStoreKey}_started_at`;
  const sessionRetentionMs = 3 * 24 * 60 * 60 * 1000;
  function secureSessionId() {
    const value = crypto.randomUUID ? crypto.randomUUID() : Array.from(crypto.getRandomValues(new Uint8Array(16)), function (b) { return b.toString(16).padStart(2, '0'); }).join('');
    return 'session_' + value;
  }
  let SESSION_ID = '';
  try {
    SESSION_ID = localStorage.getItem(sessionStoreKey) || '';
    const sessionStartedAt = Number(localStorage.getItem(sessionStartedStoreKey) || 0);
    if (!SESSION_ID || !sessionStartedAt || Date.now() - sessionStartedAt >= sessionRetentionMs) {
      SESSION_ID = secureSessionId();
      localStorage.setItem(sessionStoreKey, SESSION_ID);
      localStorage.setItem(sessionStartedStoreKey, String(Date.now()));
    }
  } catch (e) {
    SESSION_ID = secureSessionId();
  }

  const openStoreKey = `siexy_chat_open_${CTX_ID || BOT_ID || 'default'}`;
  let wasOpen = false;
  try {
    wasOpen = sessionStorage.getItem(openStoreKey) === 'true';
  } catch (e) { }

  const initialOpen = script?.getAttribute('data-open') === 'true' ||
    window.VITTAIN_CONFIG?.initialOpen === true ||
    wasOpen;
  const position = (script?.getAttribute('data-position') || 'right').toLowerCase();

  // 2. Inject Styles
  const styleEl = document.createElement('style');
  styleEl.id = 'siexy-concierge-styles';
  styleEl.textContent = `
    #siexy-concierge-root {
      position: fixed;
      z-index: 2147483647;
      pointer-events: none;
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }

    #siexy-concierge-launcher {
      position: fixed;
      ${position === 'left' ? 'left: 28px;' : 'right: 28px;'}
      bottom: 24px;
      width: 54px;
      height: 54px;
      border-radius: 50%;
      background: #ffffff;
      border: 1px solid rgba(226, 232, 240, 0.95);
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.14), 0 4px 16px rgba(15, 23, 42, 0.04);
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      pointer-events: auto;
      z-index: 2147483647;
      transition: transform 0.22s cubic-bezier(0.16, 1, 0.3, 1), box-shadow 0.22s ease-out;
      padding: 0;
      margin: 0;
      outline: none;
      -webkit-tap-highlight-color: transparent;
      user-select: none;
    }

    #siexy-concierge-launcher:hover {
      transform: scale(1.06);
      box-shadow: 0 28px 90px rgba(15, 23, 42, 0.18), 0 6px 20px rgba(15, 23, 42, 0.06);
    }

    #siexy-concierge-launcher:active {
      transform: scale(0.95);
    }

    #siexy-concierge-launcher svg {
      width: 23px;
      height: 23px;
      color: #0f172a;
      transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.15s ease;
    }

    .siexy-launcher-status {
      position: absolute;
      right: 1px;
      top: 1px;
      width: 11px;
      height: 11px;
      border: 2px solid #ffffff;
      border-radius: 50%;
      background: #10b981;
      transition: transform 0.2s;
    }

    .siexy-unread-badge {
      position: absolute;
      top: -2px;
      right: -2px;
      background: #ef4444;
      color: #ffffff;
      font-size: 10px;
      font-weight: 700;
      width: 19px;
      height: 19px;
      border-radius: 50%;
      display: none;
      align-items: center;
      justify-content: center;
      border: 2px solid #ffffff;
    }

    #siexy-concierge-container {
      position: fixed;
      ${position === 'left' ? 'left: 24px;' : 'right: 24px;'}
      bottom: 92px;
      width: 390px;
      max-width: calc(100vw - 32px);
      height: min(720px, calc(100svh - 116px));
      border: 1px solid rgba(226, 232, 240, 0.9);
      border-radius: 28px;
      box-shadow: 0 24px 80px rgba(15, 23, 42, 0.14), 0 4px 16px rgba(15, 23, 42, 0.04);
      background: #ffffff;
      overflow: hidden;
      z-index: 2147483646;
      pointer-events: auto;
      opacity: 0;
      visibility: hidden;
      transform: translateY(14px) scale(0.98);
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), 
                  transform 0.25s cubic-bezier(0.16, 1, 0.3, 1),
                  visibility 0.25s;
    }

    #siexy-concierge-container.siexy-open {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
    }

    #siexy-concierge-iframe {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
      background: #ffffff;
    }

    /* Floating Callout Bubble */
    #siexy-callout-bubble {
      position: fixed;
      ${position === 'left' ? 'left: 28px;' : 'right: 28px;'}
      bottom: 90px;
      max-width: 330px;
      min-width: 250px;
      width: calc(100vw - 56px);
      background: rgba(255, 255, 255, 0.94);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      backdrop-filter: blur(24px) saturate(180%);
      border: 1px solid rgba(226, 232, 240, 0.95);
      box-shadow: 0 20px 48px -6px rgba(15, 23, 42, 0.16), 0 4px 16px rgba(15, 23, 42, 0.05);
      border-radius: 22px;
      padding: 14px 16px 14px 16px;
      pointer-events: auto;
      z-index: 2147483645;
      opacity: 0;
      visibility: hidden;
      transform: translateY(10px) scale(0.96);
      transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                  transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                  visibility 0.28s;
      cursor: pointer;
      user-select: none;
      box-sizing: border-box;
    }

    #siexy-callout-bubble.siexy-popup-visible {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
    }

    #siexy-callout-bubble:hover {
      box-shadow: 0 24px 54px -6px rgba(15, 23, 42, 0.2), 0 6px 20px rgba(15, 23, 42, 0.06);
    }

    .siexy-callout-tail {
      position: absolute;
      bottom: -6.5px;
      ${position === 'left' ? 'left: 21px;' : 'right: 21px;'}
      width: 12px;
      height: 12px;
      background: rgba(255, 255, 255, 0.95);
      ${position === 'left'
      ? 'border-left: 1px solid rgba(226, 232, 240, 0.95); border-bottom: 1px solid rgba(226, 232, 240, 0.95);'
      : 'border-right: 1px solid rgba(226, 232, 240, 0.95); border-bottom: 1px solid rgba(226, 232, 240, 0.95);'}
      transform: rotate(45deg);
      pointer-events: none;
    }

    .siexy-popup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 6px;
    }

    .siexy-popup-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 700;
      letter-spacing: 0.02em;
      color: #0f172a;
      text-transform: uppercase;
    }

    .siexy-popup-pulse {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 6px rgba(16, 185, 129, 0.6);
      display: inline-block;
    }

    .siexy-popup-close {
      width: 22px;
      height: 22px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      color: #94a3b8;
      font-size: 15px;
      line-height: 1;
      transition: background 0.15s, color 0.15s;
      background: transparent;
      border: none;
      padding: 0;
    }

    .siexy-popup-close:hover {
      background: rgba(15, 23, 42, 0.08);
      color: #0f172a;
    }

    .siexy-popup-body {
      font-size: 13.5px;
      line-height: 1.45;
      color: #1e293b;
      font-weight: 500;
      margin: 0;
      word-break: break-word;
    }

    .siexy-popup-action {
      margin-top: 10px;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11.5px;
      font-weight: 600;
      padding: 6px 12px;
      border-radius: 100px;
      background: #0433ff;
      color: #ffffff;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(4, 51, 255, 0.2);
      transition: transform 0.15s, box-shadow 0.15s;
    }

    .siexy-popup-action:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 16px rgba(4, 51, 255, 0.3);
    }

    /* Floating Banner Popup */
    #siexy-banner-popup {
      position: fixed;
      ${position === 'left' ? 'left: 28px;' : 'right: 28px;'}
      bottom: 90px;
      max-width: 360px;
      width: calc(100vw - 56px);
      background: rgba(255, 255, 255, 0.95);
      -webkit-backdrop-filter: blur(24px) saturate(180%);
      backdrop-filter: blur(24px) saturate(180%);
      border: 1px solid rgba(226, 232, 240, 0.95);
      box-shadow: 0 20px 48px -6px rgba(15, 23, 42, 0.18);
      border-radius: 20px;
      padding: 12px 14px;
      pointer-events: auto;
      z-index: 2147483645;
      opacity: 0;
      visibility: hidden;
      transform: translateY(10px) scale(0.96);
      transition: opacity 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                  transform 0.28s cubic-bezier(0.16, 1, 0.3, 1),
                  visibility 0.28s;
      cursor: pointer;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }

    #siexy-banner-popup.siexy-popup-visible {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
    }

    /* Modal Popup Overlay */
    #siexy-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      background: rgba(15, 23, 42, 0.4);
      -webkit-backdrop-filter: blur(6px);
      backdrop-filter: blur(6px);
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      box-sizing: border-box;
      opacity: 0;
      visibility: hidden;
      pointer-events: auto;
      transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1), visibility 0.25s;
    }

    #siexy-modal-overlay.siexy-popup-visible {
      opacity: 1;
      visibility: visible;
    }

    #siexy-modal-card {
      background: #ffffff;
      border: 1px solid rgba(226, 232, 240, 0.9);
      border-radius: 24px;
      box-shadow: 0 25px 60px rgba(15, 23, 42, 0.25);
      max-width: 380px;
      width: 100%;
      padding: 26px 22px;
      text-align: center;
      position: relative;
      transform: scale(0.92);
      transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      box-sizing: border-box;
    }

    #siexy-modal-overlay.siexy-popup-visible #siexy-modal-card {
      transform: scale(1);
    }

    @media (max-width: 600px) {
      #siexy-concierge-container {
        width: 100vw !important;
        max-width: 100vw !important;
        height: 100% !important;
        height: 100svh !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        top: 0 !important;
        border-radius: 0 !important;
        border: none !important;
        box-shadow: none !important;
      }
      #siexy-concierge-container.siexy-open + #siexy-concierge-launcher {
        display: none !important;
      }
      #siexy-callout-bubble,
      #siexy-banner-popup {
        left: 16px !important;
        right: 16px !important;
        width: calc(100vw - 32px) !important;
        max-width: none !important;
        bottom: 86px !important;
      }
    }
  `;
  document.head.appendChild(styleEl);

  // 3. Create Root & Core Elements
  const root = document.createElement('div');
  root.id = 'siexy-concierge-root';

  // Launcher Button
  const launcher = document.createElement('button');
  launcher.id = 'siexy-concierge-launcher';
  launcher.setAttribute('aria-label', 'Open concierge chat');
  launcher.setAttribute('title', 'Open concierge chat');
  launcher.type = 'button';

  // SVG Icons
  const chatIconHtml = `
    <svg id="siexy-icon-chat" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>
    </svg>
  `;
  const closeIconHtml = `
    <svg id="siexy-icon-close" style="display:none;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
    </svg>
  `;

  launcher.innerHTML = `
    ${chatIconHtml}
    ${closeIconHtml}
    <i class="siexy-launcher-status"></i>
    <span class="siexy-unread-badge" id="siexy-unread">0</span>
  `;

  // Iframe Container
  const container = document.createElement('div');
  container.id = 'siexy-concierge-container';

  // Build target URL
  const queryParams = new URLSearchParams();
  if (BOT_ID) queryParams.set('bot', BOT_ID);
  if (CTX_ID) queryParams.set('ctx', CTX_ID);
  if (SESSION_ID) queryParams.set('session_id', SESSION_ID);
  queryParams.set('iframe', 'true');
  queryParams.set('embed', 'true');

  const iframeSrc = `${API_BASE}/widget?${queryParams.toString()}`;

  const iframe = document.createElement('iframe');
  iframe.id = 'siexy-concierge-iframe';
  iframe.setAttribute('src', iframeSrc);
  iframe.setAttribute('allow', 'camera; microphone; autoplay; encrypted-media; fullscreen');
  iframe.setAttribute('title', 'SIEXY Concierge Chat');

  container.appendChild(iframe);

  // 4. Create Callout Bubble Element
  const calloutBubble = document.createElement('div');
  calloutBubble.id = 'siexy-callout-bubble';
  calloutBubble.setAttribute('role', 'dialog');
  calloutBubble.setAttribute('aria-live', 'polite');
  calloutBubble.innerHTML = `
    <div class="siexy-callout-tail"></div>
    <div class="siexy-popup-header">
      <div class="siexy-popup-tag">
        <span class="siexy-popup-pulse"></span>
        <span class="siexy-tag-text">AI Assistant</span>
      </div>
      <button class="siexy-popup-close siexy-callout-close-btn" type="button" aria-label="Dismiss">&times;</button>
    </div>
    <p class="siexy-popup-body siexy-callout-body-text"></p>
    <button class="siexy-popup-action siexy-callout-action-btn" type="button">
      <span class="siexy-action-text">Chat with us</span>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>
    </button>
  `;

  // 5. Create Banner Popup Element
  const bannerPopup = document.createElement('div');
  bannerPopup.id = 'siexy-banner-popup';
  bannerPopup.setAttribute('role', 'dialog');
  bannerPopup.setAttribute('aria-live', 'polite');
  bannerPopup.innerHTML = `
    <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
      <div class="siexy-banner-icon" style="width:32px;height:32px;border-radius:10px;background:rgba(4,51,255,0.1);display:flex;align-items:center;justify-content:center;font-size:15px;flex-shrink:0;">📢</div>
      <div style="flex:1;min-width:0;">
        <div class="siexy-banner-tag" style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:#64748b;margin-bottom:2px;">Special Update</div>
        <p class="siexy-banner-text" style="font-size:12.5px;font-weight:500;color:#0f172a;line-height:1.35;margin:0;word-break:break-word;"></p>
      </div>
    </div>
    <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
      <button class="siexy-banner-action" type="button" style="font-size:11px;font-weight:600;padding:5px 11px;border-radius:100px;background:#0433ff;color:#ffffff;border:none;cursor:pointer;">Chat now</button>
      <button class="siexy-popup-close siexy-banner-close-btn" type="button" aria-label="Dismiss">&times;</button>
    </div>
  `;

  // 6. Create Modal Popup Element
  const modalOverlay = document.createElement('div');
  modalOverlay.id = 'siexy-modal-overlay';
  modalOverlay.innerHTML = `
    <div id="siexy-modal-card">
      <button class="siexy-popup-close siexy-modal-close-btn" type="button" aria-label="Close" style="position:absolute;top:14px;right:14px;font-size:18px;">&times;</button>
      <div class="siexy-modal-badge" style="display:inline-block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;padding:3px 10px;border-radius:100px;background:rgba(4,51,255,0.1);color:#0433ff;margin-bottom:12px;">Special Offer</div>
      <p class="siexy-modal-text" style="font-size:14px;font-weight:500;color:#0f172a;line-height:1.5;margin-bottom:18px;word-break:break-word;"></p>
      <button class="siexy-modal-action" type="button" style="font-size:13px;font-weight:600;padding:10px 22px;border-radius:100px;background:#0433ff;color:#ffffff;border:none;cursor:pointer;box-shadow:0 6px 18px rgba(4,51,255,0.25);">Chat with us &rarr;</button>
    </div>
  `;

  root.appendChild(container);
  root.appendChild(calloutBubble);
  root.appendChild(bannerPopup);
  root.appendChild(modalOverlay);
  root.appendChild(launcher);
  document.body.appendChild(root);

  // 7. State & UI Handlers
  let isOpen = false;
  let activeBotConfig = null;
  let autoOpenCalloutTimer = null;
  let autoDismissTimer = null;

  const chatIcon = launcher.querySelector('#siexy-icon-chat');
  const closeIcon = launcher.querySelector('#siexy-icon-close');
  const statusDot = launcher.querySelector('.siexy-launcher-status');
  const unreadBadge = launcher.querySelector('#siexy-unread');

  function hideAllPopups() {
    hideCallout();
    hideBanner();
    hideModal();
  }

  function hideCallout() {
    calloutBubble.classList.remove('siexy-popup-visible');
    if (autoOpenCalloutTimer) {
      clearTimeout(autoOpenCalloutTimer);
      autoOpenCalloutTimer = null;
    }
  }

  function hideBanner() {
    bannerPopup.classList.remove('siexy-popup-visible');
  }

  function hideModal() {
    modalOverlay.classList.remove('siexy-popup-visible');
  }

  function setOpen(open) {
    isOpen = open;
    try {
      sessionStorage.setItem(openStoreKey, open ? 'true' : 'false');
    } catch (e) { }

    if (isOpen) {
      hideAllPopups();
      container.classList.add('siexy-open');
      if (chatIcon) chatIcon.style.display = 'none';
      if (closeIcon) closeIcon.style.display = 'block';
      if (statusDot) statusDot.style.display = 'none';
      if (unreadBadge) {
        unreadBadge.style.display = 'none';
        unreadBadge.textContent = '0';
      }
      launcher.setAttribute('aria-label', 'Close concierge chat');
      launcher.setAttribute('title', 'Close concierge chat');
      try {
        iframe.contentWindow?.postMessage({ type: 'rag_widget_open' }, '*');
      } catch (e) { }
    } else {
      container.classList.remove('siexy-open');
      if (chatIcon) chatIcon.style.display = 'block';
      if (closeIcon) closeIcon.style.display = 'none';
      if (statusDot) statusDot.style.display = 'block';
      launcher.setAttribute('aria-label', 'Open concierge chat');
      launcher.setAttribute('title', 'Open concierge chat');
      try {
        iframe.contentWindow?.postMessage({ type: 'rag_widget_close' }, '*');
      } catch (e) { }
    }
  }

  launcher.addEventListener('click', function () {
    setOpen(!isOpen);
  });

  // Callout interactions
  calloutBubble.addEventListener('click', function () {
    hideCallout();
    setOpen(true);
  });

  const calloutCloseBtn = calloutBubble.querySelector('.siexy-callout-close-btn');
  calloutCloseBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    hideCallout();
  });

  const calloutActionBtn = calloutBubble.querySelector('.siexy-callout-action-btn');
  calloutActionBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    hideCallout();
    setOpen(true);
  });

  // Banner interactions
  bannerPopup.addEventListener('click', function () {
    hideBanner();
    setOpen(true);
  });

  const bannerCloseBtn = bannerPopup.querySelector('.siexy-banner-close-btn');
  bannerCloseBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    hideBanner();
  });

  const bannerActionBtn = bannerPopup.querySelector('.siexy-banner-action');
  bannerActionBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    hideBanner();
    setOpen(true);
  });

  // Modal interactions
  modalOverlay.addEventListener('click', function (e) {
    if (e.target === modalOverlay) {
      hideModal();
    }
  });

  const modalCloseBtn = modalOverlay.querySelector('.siexy-modal-close-btn');
  modalCloseBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    hideModal();
  });

  const modalActionBtn = modalOverlay.querySelector('.siexy-modal-action');
  modalActionBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    hideModal();
    setOpen(true);
  });

  // 8. Popup Display Functions
  function showCallout(payload) {
    if (isOpen) return;
    const msg = typeof payload === 'string' ? payload : (payload?.message || '');
    if (!msg) return;

    const tagText = payload?.tag || activeBotConfig?.widget_title || 'SIEXY';
    const ctaText = payload?.cta_text || 'Chat with us';
    const theme = payload?.theme_color || activeBotConfig?.theme_color || '#0433ff';

    const tagEl = calloutBubble.querySelector('.siexy-tag-text');
    if (tagEl) tagEl.textContent = tagText;

    const bodyEl = calloutBubble.querySelector('.siexy-callout-body-text');
    if (bodyEl) bodyEl.textContent = msg;

    const actionTextEl = calloutBubble.querySelector('.siexy-action-text');
    if (actionTextEl) actionTextEl.textContent = ctaText;

    if (calloutActionBtn && theme) {
      calloutActionBtn.style.backgroundColor = theme;
      calloutActionBtn.style.boxShadow = `0 4px 12px ${theme}33`;
    }

    hideBanner();
    calloutBubble.classList.add('siexy-popup-visible');

    // Auto open widget after callout if configured
    if (payload?.auto_open_after && payload.auto_open_after > 0) {
      clearTimeout(autoOpenCalloutTimer);
      autoOpenCalloutTimer = setTimeout(function () {
        if (!isOpen && calloutBubble.classList.contains('siexy-popup-visible')) {
          hideCallout();
          setOpen(true);
        }
      }, payload.auto_open_after * 1000);
    }

    // Auto dismiss if configured
    if (payload?.auto_dismiss_seconds && payload.auto_dismiss_seconds > 0) {
      clearTimeout(autoDismissTimer);
      autoDismissTimer = setTimeout(function () {
        hideCallout();
      }, payload.auto_dismiss_seconds * 1000);
    }
  }

  function showBanner(payload) {
    if (isOpen) return;
    const msg = typeof payload === 'string' ? payload : (payload?.message || '');
    if (!msg) return;

    const tagText = payload?.tag || 'Update';
    const ctaText = payload?.cta_text || 'Chat now';
    const theme = payload?.theme_color || activeBotConfig?.theme_color || '#0433ff';

    const tagEl = bannerPopup.querySelector('.siexy-banner-tag');
    if (tagEl) tagEl.textContent = tagText;

    const bodyEl = bannerPopup.querySelector('.siexy-banner-text');
    if (bodyEl) bodyEl.textContent = msg;

    const actionBtn = bannerPopup.querySelector('.siexy-banner-action');
    if (actionBtn) {
      actionBtn.textContent = ctaText;
      if (theme) {
        actionBtn.style.backgroundColor = theme;
      }
    }

    hideCallout();
    bannerPopup.classList.add('siexy-popup-visible');

    if (payload?.auto_dismiss_seconds && payload.auto_dismiss_seconds > 0) {
      clearTimeout(autoDismissTimer);
      autoDismissTimer = setTimeout(function () {
        hideBanner();
      }, payload.auto_dismiss_seconds * 1000);
    }
  }

  function showModal(payload) {
    if (isOpen) return;
    const msg = typeof payload === 'string' ? payload : (payload?.message || '');
    if (!msg) return;

    const tagText = payload?.tag || 'Assistance';
    const ctaText = payload?.cta_text || 'Chat with us →';
    const theme = payload?.theme_color || activeBotConfig?.theme_color || '#0433ff';

    const tagEl = modalOverlay.querySelector('.siexy-modal-badge');
    if (tagEl) {
      tagEl.textContent = tagText;
      if (theme) {
        tagEl.style.color = theme;
        tagEl.style.backgroundColor = `${theme}1a`;
      }
    }

    const bodyEl = modalOverlay.querySelector('.siexy-modal-text');
    if (bodyEl) bodyEl.textContent = msg;

    const actionBtn = modalOverlay.querySelector('.siexy-modal-action');
    if (actionBtn) {
      actionBtn.textContent = ctaText;
      if (theme) {
        actionBtn.style.backgroundColor = theme;
        actionBtn.style.boxShadow = `0 6px 18px ${theme}33`;
      }
    }

    hideCallout();
    hideBanner();
    modalOverlay.classList.add('siexy-popup-visible');

    if (payload?.auto_dismiss_seconds && payload.auto_dismiss_seconds > 0) {
      clearTimeout(autoDismissTimer);
      autoDismissTimer = setTimeout(function () {
        hideModal();
      }, payload.auto_dismiss_seconds * 1000);
    }
  }

  // 9. Fetch Bot Configuration and Schedule Timed Nudges
  function initTriggersAndPopups(cfg) {
    if (!cfg) return;
    activeBotConfig = cfg;

    const botTitle = cfg.widget_title || 'SIEXY';
    const openingMsg = cfg.opening_message || cfg.callout_title || cfg.welcome_message || '';
    const calloutOnly = cfg.callout_only === true;
    const openDelaySec = Number(cfg.open_delay ?? cfg.callout_timer ?? 3);
    const openAfterCallout = cfg.open_after_callout === true;
    const showOncePerSession = cfg.show_once_per_session === true;
    const timedPopups = Array.isArray(cfg.timed_popups) ? cfg.timed_popups : [];

    // Apply theme color to launcher status or borders if desired
    if (cfg.theme_color) {
      if (calloutActionBtn) calloutActionBtn.style.backgroundColor = cfg.theme_color;
      if (bannerActionBtn) bannerActionBtn.style.backgroundColor = cfg.theme_color;
      if (modalActionBtn) modalActionBtn.style.backgroundColor = cfg.theme_color;
    }

    // Proactive Opening Message / Callout Bubble
    const sessionSeenKey = `siexy_callout_seen_${BOT_ID || CTX_ID || 'default'}`;
    const alreadySeen = sessionStorage.getItem(sessionSeenKey) === 'true';

    if (!isOpen && (!alreadySeen || !showOncePerSession)) {
      const delayMs = Math.max(0, isNaN(openDelaySec) ? 3 : openDelaySec) * 1000;

      if (calloutOnly && openingMsg) {
        setTimeout(function () {
          if (isOpen) return;
          try {
            sessionStorage.setItem(sessionSeenKey, 'true');
          } catch (e) { }

          showCallout({
            id: 'opening_callout',
            tag: botTitle,
            message: openingMsg,
            cta_text: 'Chat with us',
            theme_color: cfg.theme_color || '#0433ff',
            auto_open_after: openAfterCallout ? 6 : 0
          });
        }, delayMs);
      } else if (!calloutOnly && cfg.auto_open) {
        setTimeout(function () {
          if (isOpen) return;
          try {
            sessionStorage.setItem(sessionSeenKey, 'true');
          } catch (e) { }
          setOpen(true);
        }, delayMs);
      }
    }

    // Sequential Timed Popups (e.g. 15s, 30s nudges)
    timedPopups.forEach(function (popup) {
      if (!popup || popup.enabled === false || !popup.message) return;
      const popupKey = `siexy_timed_popup_${popup.id || popup.delay_seconds}`;
      if (sessionStorage.getItem(popupKey) === 'true') return;

      const delayMs = Math.max(0, Number(popup.delay_seconds || 15)) * 1000;
      setTimeout(function () {
        if (isOpen) return;
        if (sessionStorage.getItem(popupKey) === 'true') return;
        try {
          sessionStorage.setItem(popupKey, 'true');
        } catch (e) { }

        const style = popup.popup_style || 'callout';
        const payload = {
          id: popup.id,
          tag: popup.tag || botTitle,
          message: popup.message,
          cta_text: popup.cta_text || 'Chat now',
          cta_url: popup.cta_url || '',
          theme_color: cfg.theme_color || '#0433ff',
          auto_dismiss_seconds: Number(popup.auto_dismiss_seconds || 0)
        };

        if (style === 'banner') {
          showBanner(payload);
        } else if (style === 'modal') {
          showModal(payload);
        } else {
          showCallout(payload);
        }
      }, delayMs);
    });
  }

  // Fetch bot config
  if (BOT_ID || CTX_ID) {
    const configUrl = `${API_BASE}/api/widget/config?ctx=${encodeURIComponent(CTX_ID)}&bot=${encodeURIComponent(BOT_ID)}`;
    fetch(configUrl)
      .then(function (res) {
        if (!res.ok) throw new Error('Config fetch returned ' + res.status);
        return res.json();
      })
      .then(function (cfg) {
        initTriggersAndPopups(cfg);
      })
      .catch(function (err) {
        console.warn('[SIEXY Widget] Config fetch note:', err);
      });
  }

  // 10. PostMessage Communication from Iframe and External Triggers
  window.addEventListener('message', function (event) {
    if (!event.data) return;
    const msgType = event.data.type;

    // Window controls from iframe
    if (msgType === 'rag_widget_close' || msgType === 'concierge_close') {
      setOpen(false);
    } else if (msgType === 'rag_widget_open' || msgType === 'concierge_open') {
      setOpen(true);
    } else if (msgType === 'rag_widget_new_session' || msgType === 'siexy_new_session') {
      if (event.data.sessionId) {
        SESSION_ID = event.data.sessionId;
        try {
          localStorage.setItem(sessionStoreKey, SESSION_ID);
          localStorage.setItem(sessionStartedStoreKey, String(Date.now()));
        } catch (e) { }
      }
    } else if (msgType === 'rag_widget_unread') {
      const count = Number(event.data.count || 0);
      if (count > 0 && !isOpen && unreadBadge) {
        unreadBadge.textContent = String(count);
        unreadBadge.style.display = 'flex';
      }
    }

    // External Trigger Engine (tracker.js / normalizer / events)
    if (msgType === 'vittain_trigger' || msgType === 'rag_widget_callout' || msgType === 'siexy_callout') {
      const payload = event.data.payload || event.data;
      const style = payload.popup_style || payload.displayType || 'callout';
      const targetPayload = {
        id: payload.rule_id || payload.id || 'trigger',
        tag: payload.name || payload.tag || (activeBotConfig?.widget_title || 'SIEXY'),
        message: payload.message || '',
        cta_text: payload.cta_text || (payload.coupon_code ? `Use ${payload.coupon_code}` : 'Chat now'),
        cta_url: payload.cta_url || '',
        theme_color: activeBotConfig?.theme_color || '#0433ff',
        auto_dismiss_seconds: Number(payload.auto_dismiss_seconds || 0)
      };

      if (style === 'full') {
        setOpen(true);
        try {
          iframe.contentWindow?.postMessage({
            type: 'rag_widget_trigger_message',
            payload: targetPayload
          }, '*');
        } catch (e) { }
      } else if (style === 'banner') {
        showBanner(targetPayload);
      } else if (style === 'modal') {
        showModal(targetPayload);
      } else {
        showCallout(targetPayload);
      }
    }
  });

  if (initialOpen) {
    setTimeout(function () {
      setOpen(true);
    }, 400);
  }

  // 11. Global JS API
  window.ConciergeWidget = {
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
    toggle: function () { setOpen(!isOpen); },
    isOpen: function () { return isOpen; },
    showCallout: function (payload) { showCallout(payload); },
    hideCallout: function () { hideCallout(); },
    showBanner: function (payload) { showBanner(payload); },
    hideBanner: function () { hideBanner(); },
    showModal: function (payload) { showModal(payload); },
    hideModal: function () { hideModal(); },
    hideAllPopups: function () { hideAllPopups(); }
  };
  window.RAGWidget = window.ConciergeWidget;

})();
