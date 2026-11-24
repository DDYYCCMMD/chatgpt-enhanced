# ChatGPT Enhanced

A modular Chrome extension (Manifest V3) for `https://chatgpt.com/*`.

V0.1 provides a working popup, independent persistent feature preferences, and a content-script lifecycle. **Project Colors and Chat Navigation are placeholders:** enabling their preferences does not change ChatGPT yet. Both default to off.

## Requirements

- Node.js 22.18+ (a current LTS release is recommended) and npm.
- Google Chrome 111+ with extension Developer mode available.

## Install and build

```sh
npm install
npm run build
```

The build type-checks the project and produces `dist/`, the unpacked extension directory. Dependencies are development-only; the extension bundles everything locally.

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select this repository's `dist/` directory.
4. Open the extension from Chrome's extensions menu (pin it if desired).
5. Visit or refresh a tab at `https://chatgpt.com/` to load the content script.

## Development

```sh
npm run dev
```

This runs both Vite builds in watch mode and writes to `dist/`. It does not start a web server or inject HMR. Wait for both builds to finish before loading the extension. After editing, reload the extension in `chrome://extensions`, reopen the popup, and refresh any ChatGPT tabs. Manifest changes also require an extension reload. Stop watch mode before a production build.

```sh
npm run typecheck
npm test
npm run build
```

`npm test` uses Node's built-in test runner and TypeScript stripping, with a mock Chrome storage API. It covers defaults, malformed data, persistence, concurrent independent writes, startup change races, subscription cleanup, storage errors, and feature lifecycle isolation. It does not replace testing in Chrome.

## Manual Chrome smoke test

1. Load `dist/` and check the extension card for errors.
2. Open the popup: verify the name, version `0.1.0`, and two unchecked checkboxes on a fresh install.
3. Enable Project Colors, close and reopen the popup, and verify only that preference is enabled.
4. Enable Chat Navigation, disable Project Colors, reopen, and verify the independent values persist. Restart Chrome and check again.
5. Open ChatGPT. Confirm the page still renders, conversation scrolling and typing work, and no extension errors appear in DevTools or `chrome://extensions`.
6. In DevTools, select the **ChatGPT Enhanced** content-script execution context. Evaluate `chrome.storage.local.get(null)` to inspect preferences. Use `chrome.storage.local.clear()` to reset them; an open popup should return to the defaults.
7. Change toggles with a ChatGPT tab open. No visual changes are expected in V0.1. Check that there are no new errors. Navigate within ChatGPT and use browser back/forward as well.

## Architecture and privacy

```text
public/manifest.json             MV3 manifest; copied to dist/
src/content/                    Content entry, page lifecycle, live settings
src/features/project-colors/    Independent lifecycle placeholder
src/features/chat-navigation/   Independent lifecycle placeholder
src/popup/                      HTML, TypeScript, scoped popup CSS
src/storage/                    Validated chrome.storage.local access and events
src/shared/                     Settings types, defaults, feature contract/controller
scripts/build.mjs               Two sequential Vite builds (also watchable)
tests/                          Storage and lifecycle tests
docs/architecture.md            Extension boundaries and future feature guidelines
```

Only the `storage` permission is requested. The declarative content-script match is limited to ChatGPT. There is no service worker, backend, telemetry, OpenAI API integration, external asset, or runtime network request. Only boolean feature preferences are stored locally. The content script does not read conversation content or mutate ChatGPT's DOM.

See [architecture notes](docs/architecture.md). Build and storage behavior follow the [Vite build documentation](https://vite.dev/guide/build.html) and [Chrome storage API documentation](https://developer.chrome.com/docs/extensions/reference/api/storage).
