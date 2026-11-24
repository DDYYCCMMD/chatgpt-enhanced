# V0.2 architecture

## Runtime boundaries

The popup renders the extension version from `chrome.runtime.getManifest()`. Its native labeled checkboxes load saved settings before accepting input, report read/write failures, and write one feature preference at a time. Styling is bundled with the popup and never injected into ChatGPT.

The content script runs at `document_idle` in Chrome's default isolated world on `https://chatgpt.com/*` (top frame only). It subscribes to storage, applies preferences to the feature controller, and cleans up on `pagehide`. `pageshow` resumes it after a back/forward cache restoration. V0.2 reuses this lifecycle unchanged; no background process or message bus is needed.

Each feature exports a `Feature` with an ID and synchronous `enable()` method returning a cleanup function. The controller starts an enabled feature once, stops only the disabled feature, and disposes all active features on page exit. Project Colors now implements this contract; Chat Navigation remains an inert placeholder.

## Settings

`src/shared/settings.ts` owns IDs, types, labels, and off-by-default values. The storage adapter uses separate versioned keys:

- `settings.v1.projectColors`: boolean
- `settings.v1.chatNavigation`: boolean

Absent, deleted, or malformed values fall back to defaults. Reads do not write defaults. Independent writes avoid a shared-object read/modify/write race; writes to the same preference follow Chrome's last-write behavior. Observers attach before reading and merge events received during the initial read, so a stale snapshot cannot undo a new toggle. Observers ignore other storage areas and return an unsubscribe function. Future incompatible schemas need an explicit migration.

## Project Colors

Responsibilities are separated into:

- `features/project-colors/detection.ts`: sidebar selectors, canonical IDs, strict project-home URL parsing, metadata guards, and nested-control exclusions.
- `features/project-colors/colors.ts`: the six allowed color names and the logical mapping type.
- `storage/project-colors.ts`: Chrome persistence, validation, reset, and live change subscriptions.
- `features/project-colors/styles.ts`: owned stylesheet and namespaced row attributes.
- `features/project-colors/menu.ts`: Shadow DOM menu, focus, keyboard behavior, viewport bounds, dismissal, and save error UI.
- `features/project-colors/index.ts`: lifecycle, discovery, observers, reconciliation, and optimistic selection/rollback.

### Identity and DOM compatibility

Only supported sidebar roots are queried for project rows. Known project-home URLs supply a canonical lower-case `g-p-` ID with either 32 hexadecimal digits or a UUID. A human-readable URL slug is discarded; a rename cannot change the stored identity. Project conversation URLs (`/c/…`), other origins, custom GPTs, unknown formats, and conflicting header metadata are rejected. Explicit project metadata supports direct interactive headers only; it never promotes a nested conversation into a Project. No visible text, message content, internal React state, or backend API is used.

Selectors and URL conventions are a conservative compatibility adapter, not a guaranteed ChatGPT API. Public project URL examples corroborate the route shape, but the current signed-in DOM has not been inspected live. Fixture coverage cannot establish current real-site compatibility. See the README for supported roots/routes and manual verification.

### Scoped observation

When mounted, only supported sidebar subtrees get deep observation: child-list changes and an allowlist of identity attributes (`href` and the two project metadata attributes). Processing is debounced by 60 ms. Highlight attributes are excluded to avoid feedback loops. Rename-only text updates need no identity recalculation; replacing a label or row triggers reconciliation.

A separate observer watches the sidebar's ancestors with **shallow child-list observation**, also debounced, to discover sidebar or layout replacement. It does not observe descendants of the main conversation pane. Whole-document queries select sidebar roots only, never messages. While no supported sidebar exists, a 1.5-second timer looks for roots; it stops once a root is found. Interaction also rechecks current row identities, preventing stale assignments when a node is recycled immediately before right-click.

Reconciliation drops highlights from old/detached rows and restores colors on newly discovered rows. Pending menus close on sidebar reconciliation, resize, page scrolling, blur, outside click, Escape, or Tab. Disabling disconnects observers/subscriptions, cancels both debounce timers and discovery polling, removes the context listener, closes the menu, strips highlight attributes, and removes owned styles. Late initialization callbacks are ignored. Saved preferences survive disable/re-enable.

### Color persistence

The logical `Record<ProjectId, ProjectColor>` map is serialized as separate `projectColors.v1.<canonical-project-id>` keys. Each value is one of `red`, `orange`, `yellow`, `green`, `blue`, or `purple`. This representation lets two tabs update different Projects without overwriting the whole map. Reset removes just that key. Unchanged selections and resetting an absent key do not write. Invalid IDs/values are ignored on restoration and rejected on save; defaults are not written on discovery or rendering.

Observers subscribe before reading the local snapshot and merge changes received during initialization, including removals. Subsequent storage events keep all enabled tabs up to date. The initial read obtains the local store to discover prefixed keys; only matching, validated preferences leave the adapter. The popup's boolean preferences remain separate and unchanged.

Selections update the row immediately, then await persistence. Failure restores the prior local color and leaves a readable retry message in the menu. Same-Project concurrent writes use Chrome's last-write behavior; no cross-device synchronization is provided. No Project names, account identifiers, or conversation contents are stored.

### Safe UI integration

The row receives only `data-cge-project-color`. Background-image layers provide an inset accent and translucent tint while retaining the native background color, text color, dimensions, outline, and box shadow. CSS handles explicit `.dark`/`.light` and `data-theme` markers with a system-theme fallback; the accent follows RTL direction. Existing native row styles are not rewritten.

The menu is a viewport-clamped, scrollable fixed overlay under a namespaced host with Shadow DOM isolation. Native buttons with `menuitemradio` roles announce the selected preset, support browser Enter/Space activation, and use arrow/Home/End navigation. Focus returns to the anchor after selection or Escape; outside clicks retain normal focus behavior. The custom context event is intercepted only for recognized headers, excluding nested native buttons/menus. It requires no Chrome `contextMenus` or `scripting` permission.

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

Automated tests exercise settings, project identity, stored-data validation, color persistence/reset, same-name isolation, startup races, errors, menu interactions, theme selection, viewport clamping, dynamic sidebar replacement/recycling, delayed mounting, and feature enable/disable using mock Chrome storage and jsdom fixtures. jsdom is a dev dependency only. Production builds validate TypeScript and produce Chrome-compatible entry points. Chrome's actual extension loader, visual/focus behavior, persistence across browser restarts, and compatibility with the current ChatGPT site still require the README's manual smoke test. Live Chrome/ChatGPT verification for V0.2 is explicitly unverified because browser control timed out.
