# V0.2.1 architecture

## Existing runtime and settings

The MV3 manifest targets `https://chatgpt.com/*` with a single classic `content.js` at `document_idle` in the isolated world. Only `storage` permission is used. No background worker, new network request, page-world script injection, or message bus is needed.

The existing content entry subscribes to settings and applies them to the feature controller. `pagehide` disposes active features/subscriptions and `pageshow` resumes after back/forward caching. The popup renders the manifest version and uses the existing settings-driven toggle logic. Each feature remains independently enableable through the same synchronous setup/cleanup contract.

Boolean keys are `settings.v1.projectColors`, `settings.v1.chatColors`, and `settings.v1.chatNavigation`. Defaults remain off; old saved settings are unchanged. A missing Chat Colors value defaults to off. Chat Navigation remains a no-op.

## Diagnosis boundary

V0.2 source registration and capture-listener attachment were present. Its root allowlist, mandatory `/project` suffix, direct-child metadata rule, anchor-only hit areas, and nested-control filtering could all prevent recognition of plausible real Project structures. Stale injected code and disabled/not-ready settings also leave the browser menu intact.

Those limitations are reproduced in variant fixtures and addressed in V0.2.1. The user supplied an Elements capture after the initial diagnosis. Its header is an explicit `div[role="button"][data-app-action-sidebar-project-row]`; the same ID repeats on its container and folder-icon span. Native popovers are nested in the row; nested Chats use `data-sidebar-archive-chatgpt-id` groups with deep navigation links. A sanitized structural fixture preserves these facts. A replay of the committed V0.2 detector identifies the header if given a root, but its old root selector matches nothing in this partial fragment. Since outer sidebar ancestors are omitted and browser inspection timed out, the complete live-page failure cause is still not proven. `docs/sidebar-diagnostic.js` provides a bounded, read-only structural report with no text/HTML/body access or network traffic. Variant fixtures are modeled compatibility cases; `sidebar-user-capture.html` additionally derives the Project/nested-chat shape from the supplied markup with anonymized IDs/titles. No live-browser result is claimed.

## Page connection diagnosis

The popup's **检查当前页** check queries only the active tab ID and sends a fixed message to the top-frame content script, with a bounded timeout. A same-extension sender check gates the synchronous reply. The response contains only version, booleans, detected-row counts, and a fixed last-context status; no IDs, titles, URLs, or message text leave the content script. There are no external requests or new browser permissions.

The existing settings lifecycle records its load phase. The shared host records whether the latest context event claimed a Project/Chat or remained unrecognized/not-ready/ambiguous. On-demand detection can count rows even if features are off, without adding watchers or changing their enable/disable behavior. The popup distinguishes no receiver/old protocol, disabled features, no detected sidebar/items, intentional native right-click, and unrecognized events. The protocol revision changes with the modifier-trigger behavior to identify stale injected scripts. It never treats a count or connection as proof of successful live rendering.

Native surface exclusion targets actual menu/tooltip roles and native menu markers, plus hint popovers. It deliberately does not reject every `[popover]` ancestor: a sidebar drawer itself may be popover-hosted, and the old broad exclusion suppressed every row within such a host. A regression fixture tests this case while retaining native menu/pin/new-chat exclusions. The user's active page still needs the connection check to establish whether this is the observed failure.

## Separate detection adapters

`features/project-colors/detection.ts` owns Project ID parsing and metadata rules. Navigation attributes may be `href`, `data-project-url`, or `data-href`; if multiple are present they must resolve to the same same-origin path before an identity can be used. `features/chat-colors/detection.ts` owns conversation URL/ID parsing. Neither reads titles or message bodies.

Project IDs remain canonical lower-case `g-p-` plus 32 hex digits or a UUID. The human URL slug is ignored, and the Project-home suffix is optional. Explicit project metadata accepts canonical IDs, `project:g-p-…` container keys, or bare stable IDs under project-specific attributes. Multiple metadata fields must agree. URLs and metadata must agree, or the row is skipped. Conversation paths are never promoted to Projects.

Project metadata headers can be nested interactive wrappers/buttons. Candidates must belong to that metadata marker, exclude native popup controls, and contain no unrelated/conversation URLs. A guarded first header branch supports plain div-based headers. Expanded child-chat containers cannot become Project highlight rows. A separately tracked primary header lets nested genuine header buttons be handled while nested three-dot controls stay native. Explicit action rows own the identity over their outer containers; duplicated folder-icon metadata is not a row. Candidate lookup is limited to the header branch and excludes native popovers/tooltips and their focusable menu surfaces.

Chat identity is the stable conversation ID in a same-origin `/c/<id>` or gizmo/project-nested `/g/<stable-id>[-slug]/c/<id>` path. The same Chat receives the same ID regardless of where rendered. When `data-sidebar-archive-chatgpt-id` is present, its complete row group is used only if its ID agrees with every contained conversation link. This supports the real captured deep-link/pseudo-element row layout without painting only the title cell. Bare titles, unknown ID formats, other origins, credentials in URLs, and trailing unrelated paths are rejected.

`shared/sidebar-colors/dom.ts` provides URL-origin checks, stable-ID grammar, guarded row hit areas, and event-target exclusion. A link can expand to its nearest small row wrapper only if every navigation link in that wrapper identifies the same item. It never expands into an unrelated navigation section. Ordinary left-clicks are not intercepted.

## Shared sidebar host

`shared/sidebar-colors/lifecycle.ts` maintains one document-scoped host in a WeakMap. Each enabled kind registers its own detector, color store, ready state, row map, and renderer. Duplicate setup references do not create duplicate listeners; each cleanup is idempotent. Unregistering a kind removes only its subscription, styles, highlights, and owned menu. The last unregister tears down the shared resources and removes the host.

The host owns one `window`-capture context listener, preceding native document/root handlers. It uses the event's composed path and refreshes roots/identities synchronously at interaction time. Ordinary context events with exactly one ready, reliably identified enabled kind open the color menu without any modifier-key condition. Native controls, unknown/ambiguous items, and disabled features retain host/browser behavior. Recognized events prevent the browser menu; other events keep native behavior. The shared menu uses Project/Chat labels and one set of six preset colors.

Selections revalidate identity before applying and saving, protecting against row recycling while a menu is open. Styling is optimistic, failures roll back and show a retry message, and disposal suppresses late UI effects. Saved preferences survive disabling. A feature can be re-enabled without affecting the other kind or Chat Navigation.

## Scoped mutation handling

`shared/sidebar-colors/sidebar.ts` discovers known sidebar roots (including `data-sidebar`), then unlabelled semantic navigation roots with sidebar evidence outside generic `main`. Explicit sidebar roots and sidebar-specific ID markers are allowed within a generic main app shell. Hard article/message-author/message-ID/conversation-turn boundaries always exclude candidates; roots containing message regions are rejected to avoid deep observation of the message pane. Explicitly sidebar-named project markers and Chat archive-ID groups can form bounded fallback roots when no outer known navigation exists. This supports more layouts without treating arbitrary message links as sidebar items.

Deep observation is limited to sidebar roots, with child-list changes and an identity/role/test-ID attribute allowlist. Main-pane descendants are not observed. Work is debounced by 60 ms, preserving a pending row-update signal when shell-only mutations occur in the same batch. Extension highlight attributes are excluded to avoid loops.

A separate shallow child-list observer watches the sidebar ancestor chain for layout/root replacement. Resize/focus and each context interaction rediscover roots. Root-only polling runs every 1.5 seconds only while no supported root exists. Root queries inspect selectors/attributes, not conversation text. Reconciliation clears detached/reused rows and restores new ones. No browser-history patch or internal ChatGPT router dependency exists.

## Palette, menu, and rendering

`shared/sidebar-colors/palette.ts` defines the validated palette. The former Project Colors palette/menu/style entry points re-export or wrap shared modules to preserve existing regression-test boundaries.

`menu.ts` uses a Shadow DOM host, native buttons with menuitemradio roles, selected-state announcements, arrow/Home/End navigation, browser Enter/Space activation, and viewport-clamped scrolling. It closes on outside click, Escape, Tab, page scrolling, resize, blur, or sidebar reconciliation. Selection/Escape return focus where possible.

`highlights.ts` creates a per-kind renderer: `data-cge-project-color` or `data-cge-chat-color`, with an owned corresponding style node. Layered translucent background images and a direction-aware accent preserve native text color, background color, dimensions, outline, and box shadow. Light/dark markers have a system fallback. Cleanup removes owned attributes/nodes only.

## Namespaced storage

`storage/color-store.ts` factors the existing validation, initialization-race merging, subscriptions, no-op-write avoidance, and reset behavior into a store factory. Each kind supplies its prefix and strict ID validator:

- `projectColors.v1.<g-p-project-id>` preserves V0.2's existing keys without migration.
- `chatColors.v1.<conversation-id>` is independent and newly introduced.

Only six preset strings are accepted. Reset removes one key; unchanged selections and absent resets do not write. Per-item keys avoid whole-map overwrites when different tabs/items are updated concurrently. Same-item writes have Chrome's last-write behavior. Subscriptions attach before the initial local snapshot and merge intervening updates/removals, then ignore other areas/prefixes. No titles, account information, or message contents are stored.

## Build and verification

Vite builds popup HTML/module/CSS first and a single self-contained content IIFE second. Watch mode cleans `dist/` once, then preserves shared output for both watchers. New shared code stays bundled locally; no framework, runtime dependency, or permission has been added in V0.2.1. Keep package/lockfile/manifest versions aligned.

Node's built-in tests, mock Chrome storage, and jsdom exercise the existing Project regressions plus Chat IDs, duplicate titles, wrapper/header variants, isolation, dynamic replacement, reset, independent toggles, cleanup, and diagnostic redaction. Passing tests demonstrate behavior for modeled inputs, not the actual site.

Live Project/Chat recognition, current native event ordering, sidebar/mobile variants, visual/focus behavior, Chrome loader/CSP, actual browser-restart persistence, and two real tabs remain unverified because browser control timed out. Run the README's manual test in signed-in Chrome and obtain the safe structural report if recognition still fails. No test result should be presented as proof of current ChatGPT DOM compatibility.

## Reference review

Reviewed [chatgpt-style commit 69f4ee0](https://github.com/monmon0/chatgpt-style/tree/69f4ee0418bda7232dd0ac95d795c68f7f347864) read-only. Its popup provides selection controls, and its content script does not listen for contextmenu. Its explicit-sidebar-first filtering informed the correction of our overly broad main-ancestor exclusion. Stable URL metadata support was also added independently. Its title hashing, broad message-adjacent discovery, and global appearance overrides were not incorporated.

Regression tests model a trusted sidebar within a main shell, explicit per-item fallback roots within that shell, exclusion of quoted sidebar markers in actual message subtrees, refusal of an app-wide root containing messages, and URL metadata with conflicting-identity rejection. These source-level checks supplement the user's sanitized capture; they do not verify the live site's event path or loaded extension state.

The final interaction is direct right-click. Experimental Option/Alt and Shift gates were removed following browser shortcut conflicts and user feedback. No primary-click handler or modifier tracking is installed. The page-status protocol was incremented so stale modifier-based scripts can be detected. Regression tests exercise unmodified right-click activation, native-control propagation, unrelated page menus, and unchanged saved colors.
