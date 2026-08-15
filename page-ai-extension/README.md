# Page AI Assistant — Chrome/Edge Extension

## Install (unpacked, dev mode)

1. Unzip this folder somewhere permanent (don't delete it after installing — Chrome loads the files live from disk).
2. Go to `chrome://extensions` (or `edge://extensions` in Edge).
3. Turn on **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the `page-ai-extension` folder.
5. Visit any page — a small purple **✦** button appears on the right edge.
6. Click it, go to **Settings**, and enter:
   - **API Base URL** — e.g. `https://api.openai.com/v1`
   - **API Key**
   - **Model** — e.g. `gpt-4o-mini`
   - **Temperature**
7. Click **Save**, switch to the **Chat** tab, and ask about the page.

## What changed from the userscript version

- **Manifest V3 extension** instead of a Tampermonkey/Violentmonkey userscript — no userscript manager needed, just Chrome/Edge itself.
- **API calls now run in `background.js`** (the service worker) instead of directly in the page. This is what fixes most CORS failures: a background script with `host_permissions` isn't bound by the page's origin the way an in-page `fetch()` is.
- **Settings are stored with `chrome.storage.local`** instead of `localStorage`, since that's the standard, sandboxed storage API for extensions.
- The floating button/panel UI, page-context extraction, and chat logic are otherwise unchanged from your script.

## Notes

- This loads on every page (`<all_urls>`) and reads page text to answer questions about it — same behavior as before.
- Your API key is stored locally in the browser via the extension's storage; it isn't sent anywhere except the API `baseUrl` you configure.
- If you'd rather publish this to the Chrome Web Store instead of side-loading it, you'd need a Google developer account, a listing, and (typically) real icons — happy to help with that if you want to go that route.
