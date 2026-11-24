# V0.1 architecture

## Runtime boundaries

The popup renders the extension version from `chrome.runtime.getManifest()`. Its native labeled checkboxes load saved settings before accepting input, report read/write failures, and write one feature preference at a time. Styling is bundled with the popup and never injected into ChatGPT.

The content script runs at `document_idle` in Chrome's default isolated world on `https://chatgpt.com/*` (top frame only). It subscribes to storage, applies preferences to the feature controller, and cleans up on `pagehide`. `pageshow` resumes it after a back/forward cache restoration. No background process or message bus is needed for V0.1.

Each feature exports a `Feature` with an ID and synchronous `enable()` method returning a cleanup function. The controller starts an enabled feature once, stops only the disabled feature, and disposes all active features on page exit. The two current implementations intentionally perform no DOM work.

## Settings

`src/shared/settings.ts` owns IDs, types, labels, and off-by-default values. The storage adapter uses separate versioned keys:

- `settings.v1.projectColors`: boolean
- `settings.v1.chatNavigation`: boolean

Absent, deleted, or malformed values fall back to defaults. Reads do not write defaults. Independent writes avoid a shared-object read/modify/write race; writes to the same preference follow Chrome's last-write behavior. Observers attach before reading and merge events received during the initial read, so a stale snapshot cannot undo a new toggle. Observers ignore other storage areas and return an unsubscribe function. Future incompatible schemas need an explicit migration.

## Build

The first Vite configuration builds the popup HTML/module/CSS and copies the public manifest. The second emits a single `content.js` IIFE without imports, because declarative content scripts are classic scripts. It preserves the first build's output and disables public-directory copying. Watch mode clears `dist/` once at startup and disables output cleaning for both watchers so a popup rebuild cannot delete the content bundle. This avoids an extension framework/plugin dependency and prevents content scripts from requesting extension module chunks. The only dependencies are build tooling and types.

`public/manifest.json` is the runtime version source. Keep its version aligned with `package.json` when releasing. `dist/` and `node_modules/` are generated and ignored; commit `package-lock.json` for reproducible installs (`npm ci`).

## Future DOM work

- Keep ChatGPT DOM discovery in a small adapter owned by each feature; avoid undocumented application APIs, internal state, and generated class-name assumptions.
- Prefer stable semantic elements where available. If the expected structure is absent, exit safely without blocking the host interface.
- ChatGPT is a single-page application: handle route/content replacement without relying only on full page loads. Add narrowly scoped, batched observation only when the feature needs it.
- Scope inserted elements and styles to extension-owned roots; avoid global selectors and intercepting host events unnecessarily.
- Return cleanup that removes owned nodes, event handlers, observers, timers, and references. Keep each feature independently removable.
- Keep conversation processing ephemeral and local. Never transmit conversation content or store it as part of preference settings.

## Verification boundaries

Automated tests exercise storage and feature lifecycle behavior with fake browser APIs. Production builds validate TypeScript and produce Chrome-compatible entry points. Chrome's actual extension loader, popup rendering, persistence across browser restarts, and compatibility with the current ChatGPT site still require the manual smoke test in the README.
