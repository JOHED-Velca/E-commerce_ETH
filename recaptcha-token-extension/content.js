function loadRecaptcha(siteKey) {
  return new Promise((resolve, reject) => {
    if (window.grecaptcha) return resolve();
    if (!siteKey) return reject(new Error('siteKey not provided'));
    const script = document.createElement('script');
    script.src = `https://www.google.com/recaptcha/api.js?render=${siteKey}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('recaptcha script failed to load'));
    document.head.appendChild(script);
  });
}

function detectSiteKey() {
  const script = document.querySelector('script[src*="recaptcha/api.js"]');
  if (script) {
    const match = script.src.match(/render=([^&]+)/);
    if (match) return match[1];
  }
  const el = document.querySelector('[data-sitekey]');
  if (el) return el.getAttribute('data-sitekey');
  if (window.___grecaptcha_cfg && window.___grecaptcha_cfg.clients) {
    const clients = window.___grecaptcha_cfg.clients;
    for (const c of Object.values(clients)) {
      if (c && c.sitekey) return c.sitekey;
      if (c && c.H && c.H.sitekey) return c.H.sitekey;
    }
  }
  return null;
}

async function getToken(siteKey) {
  const finalKey = siteKey || detectSiteKey();
  if (!finalKey) throw new Error('Unable to detect sitekey');
  await loadRecaptcha(finalKey);
  return new Promise((resolve, reject) => {
    grecaptcha.ready(() => {
      grecaptcha.execute(finalKey, { action: 'submit' }).then(resolve).catch(reject);
    });
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getToken') {
    getToken(request.siteKey).then(token => {
      sendResponse({ token });
    }).catch(err => {
      sendResponse({ error: true, message: err.message });
    });
    return true; // keep channel open
  }
});
