// background.js — MV3 service worker
// Performs the actual network call to the OpenAI-compatible API.
// Doing the fetch here (instead of in the content script) avoids page CSP
// and most CORS headaches, since extension background requests with
// host_permissions granted aren't subject to the page's origin restrictions.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === 'PAI_ASK') {
    handleAsk(msg.payload)
      .then((result) => sendResponse({ ok: true, ...result }))
      .catch((err) => sendResponse({ ok: false, error: String(err && err.message ? err.message : err) }));
    return true; // keep the message channel open for the async response
  }
  return false;
});

async function handleAsk(payload) {
  const { baseUrl, apiKey, model, temperature, messages } = payload;
  const url = baseUrl.replace(/\/+$/, '') + '/chat/completions';

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model,
      temperature: Number(temperature) || 0.4,
      messages,
    }),
  });

  const data = await res.json();

  if (data.error) {
    throw new Error(data.error.message || 'API error');
  }

  const content =
    data.choices && data.choices[0] && data.choices[0].message
      ? data.choices[0].message.content
      : '(empty response)';

  return { content };
}
