# ChatGPT Enhanced

A modular Chrome extension (Manifest V3) for `https://chatgpt.com/*`.

V0.2 adds **Project Colors**: right-click a recognized Project in ChatGPT's sidebar to choose Red, Orange, Yellow, Green, Blue, Purple, or Reset to default. Colors apply immediately and persist locally across page refreshes and browser restarts. **Chat Navigation remains a placeholder.** Both feature toggles retain V0.1's off-by-default behavior and existing saved values.

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

## Using Project Colors

1. Enable **Project Colors** in the extension popup once.
2. Open ChatGPT's native sidebar and right-click a Project's name/header.
3. Choose a preset color. Future color changes happen entirely in the sidebar; no popup interaction or CSS editing is needed.
4. Choose **Reset to default** to remove that Project's saved color.

Click outside or press Escape to dismiss the menu. The keyboard context-menu key / Shift+F10 can open it on a focused Project where supported by Chrome and the native row. Arrow Up/Down, Home, and End move between options; Enter/Space activates a focused option. Tab closes the menu and resumes normal focus navigation. The native three-dot menu and right-click behavior outside recognized Project headers are preserved.

Disabling Project Colors removes all extension highlights, styles, menu UI, listeners, observers, and timers. Saved colors remain and return when the feature is enabled again. A failed save restores the previous color and offers a retry in the menu.

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

`npm test` uses Node's built-in test runner and TypeScript stripping, a mock Chrome storage API, and jsdom fixtures. jsdom and its types are development-only dependencies and are not bundled into the extension. Tests cover URL identity, project/chat distinction, same-name projects, validated storage, reset, independent writes, startup races, menu behavior, viewport clamping, save failure, dynamic DOM replacement, and feature lifecycle isolation. They do not replace testing in Chrome.

## Manual Chrome smoke test

1. Load `dist/` and check the extension card for errors.
2. Open the popup: verify version `0.2.0`. Enable Project Colors, close/reopen, and verify the toggle persists. Existing V0.1 preferences should be retained.
3. Open ChatGPT, expand its sidebar, and right-click a Project header. Verify all six colors plus Reset are available. Select each color and confirm immediate subtle highlighting with readable text.
4. Give two different Projects the same visible name. Assign different colors, rename one, and check that the colors follow each Project's identity.
5. Switch conversations, navigate between Projects, collapse/expand the sidebar, resize to a mobile layout and back, and use browser back/forward. Confirm colors are restored after rows or the sidebar are re-rendered.
6. Refresh ChatGPT and restart Chrome. Confirm the saved colors remain. Test two ChatGPT tabs and verify changes propagate to the other tab.
7. Check both ChatGPT light and dark themes, hover, selected rows, keyboard focus, expansion, and RTL layout if available. Highlights should preserve text color and native background/focus behavior. Open the menu near viewport edges and in a short viewport; it should fit or scroll within the window.
8. Dismiss via outside click, Escape, Tab, scrolling the page, and resize. Test keyboard context-menu opening where supported, arrow keys, Home/End, and Enter/Space selection. Confirm ChatGPT's three-dot menu, ordinary chat right-clicks, and conversation typing/scrolling still work normally.
9. Reset one Project and confirm another stays colored. Disable Project Colors while a menu is open: the menu and all highlights must disappear, and normal context behavior must return. Re-enable and confirm saved colors return. Chat Navigation should remain unchanged.
10. Check DevTools and `chrome://extensions` for errors. In the **ChatGPT Enhanced** content-script execution context, inspect `chrome.storage.local.get(null)`. Colors use `projectColors.v1.<stable-project-id>` keys. `chrome.storage.local.clear()` removes all colors and toggle preferences (and returns both toggles to off).

## Compatibility limitations and verification status

- **Live ChatGPT/Chrome testing for V0.2 is unverified:** browser control timed out in the implementation environment. The checks above must still be run in a signed-in Chrome session. jsdom does not validate actual rendering, native focus behavior, Chrome CSP, or real-site DOM compatibility.
- Detection deliberately supports only known sidebar roots (`#stage-sidebar`, `#stage-slideover-sidebar`, `[data-testid="sidebar"]`, and `nav[aria-label="Chat history"]`). Project links must match `/g/g-p-<32-hex-or-UUID>[-slug]/project`; nested `/c/` chat routes and custom GPTs are excluded.
- Explicit `data-sidebar-project-container-id="project:g-p-…"` or `data-app-action-sidebar-project-id="g-p-…"` metadata can identify an interactive header. Metadata containers require a direct interactive header, and conflicting URL identities are rejected. Unknown layouts or IDs retain normal behavior rather than guessing from a name.
- If ChatGPT changes these DOM conventions, the adapter may need updating. Projects not rendered in the sidebar cannot be customized until rendered. When no sidebar is mounted, root discovery retries every 1.5 seconds; it stops polling once a supported root is found.
- SPA navigation is handled through DOM replacement observation without patching browser history or application state. Pure URL changes need no update while the sidebar DOM remains unchanged.
- Preferences are device-local, not synchronized between devices. Deleted Project preferences are retained until reset or extension removal. Colors are keyed by globally unique Project IDs, without storing account data or Project names. Concurrent writes to the same Project follow last-write behavior.

## Architecture and privacy

```text
public/manifest.json             MV3 manifest; copied to dist/
src/content/                    Content entry, page lifecycle, live settings
src/features/project-colors/    Detection, palette, rendering, menu, lifecycle
src/features/chat-navigation/   Independent lifecycle placeholder
src/popup/                      HTML, TypeScript, scoped popup CSS
src/storage/                    Validated feature toggles and per-Project color storage
src/shared/                     Settings types, defaults, feature contract/controller
scripts/build.mjs               Two sequential Vite builds (also watchable)
tests/                          Storage and lifecycle tests
docs/architecture.md            Extension boundaries and future feature guidelines
```

Only the `storage` permission is requested. The declarative content-script match is limited to ChatGPT. There is no service worker, backend, telemetry, OpenAI API integration, external asset, or runtime network request. Only boolean feature preferences and Project-ID-to-color preferences are stored locally. The content script reads sidebar navigation URLs/explicit Project metadata, adds namespaced highlight attributes and owned styles/menu nodes, and never reads conversation message content or changes underlying Project data.

See [architecture notes](docs/architecture.md). Build and storage behavior follow the [Vite build documentation](https://vite.dev/guide/build.html) and [Chrome storage API documentation](https://developer.chrome.com/docs/extensions/reference/api/storage).
