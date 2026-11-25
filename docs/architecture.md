# V0.3 architecture

## Existing runtime and settings

The MV3 manifest targets `https://chatgpt.com/*` with a single classic `content.js` at `document_idle` in the isolated world. Only `storage` permission is used. No background worker, new network request, page-world script injection, or message bus is needed.

The existing content entry subscribes to settings and applies them to the feature controller. `pagehide` disposes active features/subscriptions and `pageshow` resumes after back/forward caching. The popup renders the manifest version and uses the existing settings-driven toggle logic. Each feature remains independently enableable through the same synchronous setup/cleanup contract.

Boolean keys are `settings.v1.projectColors`, `settings.v1.chatColors`, and `settings.v1.chatNavigation`. Defaults remain off; old saved settings are unchanged. A missing Chat Colors value defaults to off. Chat Navigation now implements its existing independent feature contract; stored toggle keys and defaults are unchanged.

## Diagnosis boundary

V0.2 source registration and capture-listener attachment were present. Its root allowlist, mandatory `/project` suffix, direct-child metadata rule, anchor-only hit areas, and nested-control filtering could all prevent recognition of plausible real Project structures. Stale injected code and disabled/not-ready settings also leave the browser menu intact.

Those limitations are reproduced in variant fixtures and addressed in V0.2.1. The user supplied an Elements capture after the initial diagnosis. Its header is an explicit `div[role="button"][data-app-action-sidebar-project-row]`; the same ID repeats on its container and folder-icon span. Native popovers are nested in the row; nested Chats use `data-sidebar-archive-chatgpt-id` groups with deep navigation links. A sanitized structural fixture preserves these facts. A replay of the committed V0.2 detector identifies the header if given a root, but its old root selector matches nothing in this partial fragment. Since outer sidebar ancestors are omitted and browser inspection timed out, the complete live-page failure cause is still not proven. `docs/sidebar-diagnostic.js` provides a bounded, read-only structural report with no text/HTML/body access or network traffic. Variant fixtures are modeled compatibility cases; `sidebar-user-capture.html` additionally derives the Project/nested-chat shape from the supplied markup with anonymized IDs/titles. No live-browser result is claimed.

## Page connection diagnosis

The popup's **检查当前页** check queries only the active tab ID and sends a fixed message to the top-frame content script, with a bounded timeout. A same-extension sender check gates the synchronous reply. The response contains only version, booleans, detected-row counts, and a fixed last-context status; no IDs, titles, URLs, or message text leave the content script. There are no external requests or new browser permissions.

Navigation adds a document-scoped diagnostic snapshot: lifecycle phase, identified-question count, hidden-layout reason, viewport width, and gutter width. The popup can distinguish extraction failures from intentional layout hiding without accessing previews. Disabling navigation removes the snapshot. Protocol validation rejects stale content-script replies after an extension reload until the page is refreshed.

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

## V0.3 Chat Navigation

V0.3 starts from local `main` commit `34a5b95` (the latest V0.2.1), with a clean initial working tree. No remote V0.1 reset or unrelated rewrite was performed. Navigation has no source dependency on Sidebar Colors; the existing content entry already registers its Feature, so its placeholder is replaced in place.

### Responsibilities

- `chat-navigation/discovery.ts`: active conversation scope, rendered user-message discovery, stable-ID/DOM-reference keys, transition guards, and mutation relevance filtering.
- `preview.ts`: bounded user-only text extraction, whitespace/code normalization, attachment/blank/editing fallbacks, Unicode preview and tooltip truncation.
- `panel.ts`: escaped text-only Shadow DOM UI, search/clear, list order, collapse/expand, active state and focus management.
- `layout.ts`: safe left-gutter geometry, content-column adaptation, header/composer bounds and hide-when-insufficient behavior.
- `scroll.ts`: native scroll-container selection and explicit instant jumps with header clearance; no destination animation.
- `active.ts`: IntersectionObserver-based reading selection; a short visual hold during a click jump never initiates another scroll.
- `index.ts`: route/root lifecycle, observer ownership, reconciliation, layout/theme updates and complete cleanup.
- `question-index.ts`: bounded per-conversation page-memory summaries, ordering by observed scroll position, and retention without detached message DOM references.
- `history.ts`: user-initiated native-scroll scanning, cancellation/bounds, reading-position restoration and stable-key verification for cached-target relocation.

### Discovery and ownership

The adapter recognizes `/c/<id>` routes, including nested Project/custom-GPT paths. New-chat/landing pages stay idle until a conversation URL exists. A single visible `main`/`role=main` is required, preferring matching `data-conversation-id` and known thread/conversation containers. Mismatched metadata and ambiguous roots fail closed. Sidebar/navigation regions, hidden/inert/aria-hidden/CSS-hidden templates are excluded.

Only explicit user subtrees (`[data-message-author-role="user"]` or `[data-user-message-bubble]`) are read for previews. Explicit author roles take precedence over bubble markers; mixed nested markers are deduplicated and assistant-owned markers are excluded. Assistant bodies, draft composer values, other conversation roots, and message HTML are not read. Source-specific message/turn IDs take precedence; `data-turn-key` is supported as an in-page identity stamp and jump boundary for virtualized turns. Duplicate IDs collapse responsive copies, while duplicate text with distinct IDs/references stays distinct. Missing IDs use a per-route WeakMap key, never text identity. Only mounted visible user nodes are read; their bounded summaries may remain in the page-memory index after unmounting.

The user's 2026-11-25 structural diagnostic showed a single main with zero legacy author nodes, but a selected message ancestor carrying `data-user-message-bubble`/`data-user-message-has-prompt` inside `data-turn-key` and `data-virtualized-turn` wrappers. This established an unsupported selector as a concrete failure, rather than a narrow-window issue. `conversation-user-bubbles.html` models those attribute names with synthetic keys/text and simulated layout classes; class values and real browser geometry were not captured. Tests cover detection, mixed markers, edits, insertion/removal, node recycling and native scrolling. Actual display and placement still require user verification after reloading the extension and refreshing the page.

On route change, the old list/search and strong message references are cleared immediately when the change is observed. Weak metadata stamps from the previous route prevent unchanged stale nodes from being read as the new conversation, including when the root's metadata changes before its URL. New nodes or changed stable IDs can be indexed. Without ownership evidence, reused unidentifiable nodes are omitted. Clicks recheck URL, scope, visibility, stable identity and connectivity before jumping.

### Scoped updates and performance

A debounced (80 ms) observer watches the active conversation root. It reads mutation roles/structure first and ignores assistant-only streaming before preview extraction. It rebuilds panel entries and IntersectionObserver targets only when question keys/targets/extracted text change, keeping search input and focus stable during streaming.

Shallow child-list observers on the root's ancestor chain handle remounts without a document-wide subtree watcher. A separate shallow layout attribute observer watches main ancestors and native sidebar roots, with transition-end reconciliation, without reading sidebar text. ResizeObserver reacts to column/main width and composer size, ignoring answer-driven height growth. Layout writes are animation-frame batched. An HTML-theme observer and system-theme change listener update the owned host only.

Navigation API `currententrychange`, popstate and focus checks detect routes where available. A 500 ms fallback reads only `location.pathname` during a healthy session; main/root selector discovery repeats only after changes or while no supported scope is mounted. It does not monkey-patch history or use private routing state. No global scroll handler is installed; IntersectionObserver updates reading selection. Selection is held for 80ms while native intersection delivery catches up after an instant jump, without overriding user scrolling.

### Geometry and accessibility

Navigation occupies only a measured free left gutter beyond the native sidebar and before the message column. It defaults to a frameless 36px tick rail needing 60px total gutter; expanded width is 176–220px with 200px total gutter required. Both modes have header/composer margins and internally scroll long lists. Expansion/history controls appear on rail hover/keyboard focus; expansion is disabled if the full list would not fit. Tick previews open to the right, up to 340px wide within the viewport, matching the supplied reference; they can temporarily overlay the message column. List previews stay within navigation width. A bold single-line original-question title and muted three-line original-question preview are clickable. They do not read assistant responses. A short pointer bridge lets the cursor reach the card, and Escape/outside-click dismisses it. All message-native `title` attributes are removed in favor of text-only, three-line cards. The current tick is kept within the rail's own scroll viewport without scrolling the conversation. It never modifies native content padding or reserves space. Width below 960 CSS px, insufficient height, absent questions or uncertain column geometry hides the host safely. Column adaptation uses bounded max-width ancestors/thread class hints and can require updates for new ChatGPT layouts.

### Manual history traversal

Mounted `Question` objects and retained `IndexedQuestion` summaries are separate. The latter stores keys, bounded text, chronological order and an observed local scroll-coordinate hint, never message/target nodes. The index merges by key and overlapping DOM windows, preserving established logical order across virtualized unmounts and same-URL root replacement. Disjoint new windows are inserted relative to the preceding window and traversal direction. Mixed cached pixel offsets are never globally sorted: the native timeline can rebase its scroll range while loading older turns. Zero-width inactive panes cannot overwrite valid hints. It is capped at 2,000 entries and cleared on route changes, feature disable and page teardown. Connected nodes explicitly losing their user identity invalidate the corresponding entry; unmounted/deleted nodes cannot always be distinguished, so stale cached entries can remain but fail closed on relocation.

Manual scanning snapshots an immutable reading identity/preview/viewport offset plus a numeric fallback. It uses instant native-scroll jumps of 80% of the viewport, 120ms base waits. A requested target is anchored immediately when it mounts, including during top loading. For a full scan the top must settle for 800ms; older-turn prepending restarts that wait (8-second top bound). A 240-step/60-second traversal bound retains partial results. Completion/explicit Stop relocates and verifies the original message using the same identity-based search as a click, then falls back to the saved position. Wheel/touch/page-pointer/scrolling-key takeover cancels without restoring; route/root replacement and disable dispose the operation without scrolling another scope. Temporary timers/listeners are removed on completion/cancel. No private API or automatic startup scan is used.

Cached clicks first use a currently mounted exact match, then a surviving explicit DOM anchor or saved pixel hint. A failed hint falls back to overlapping rendered-window traversal, first in the direction suggested by known order and then from the native top (each traversal at most 240 steps, with a shared 30-second search budget); stale-pixel bisection was removed. Only the exact identity plus captured bounded preview can reach the precise jumper. Both mounted and cached destinations must remain aligned for 1.2 seconds after the last correction; a later prepend/reflow triggers fresh geometry and re-alignment. The jumper validates the live user marker, turn boundary, root and original snapshot and uses the actual user message scrollIntoView anchor before applying header clearance, rather than an outer virtual slot. A single unambiguous UUID from data-chatgpt-search-message-ids takes precedence over a recyclable turn key; conflicting strong IDs and ambiguous multi-ID metadata fail closed. Unresolved targets attempt reading-anchor restoration rather than selecting a nearby message.

Real-page debugging reproduced native bottom-following undoing a bare isolated-world scrollTo after about 800ms. The current [data-app-action-timeline-scroll] host responds to a standard bubbling WheelEvent by releasing that following state. moveConversation sends this directional intent before an actual instant native move on that explicitly marked host only, including upward intent at an already-zero rebased boundary. Its own events are tracked in a WeakSet and ignored by the operation's takeover listener; unrelated wheel input still cancels. No React state, private controller, global scroll behavior, message DOM or backend API is modified. This DOM behavior may change with ChatGPT updates; tests model bottom-following, delayed mounts, prepended content and coordinate rebasing, and live verification must be recorded separately from automated checks.

Re-inspection of chatgpt-style's main content script confirmed it implements sidebar appearance rather than question navigation. The tick rail is independently implemented from the user's visual reference; no conversation-navigation algorithm was copied from that repository. Existing source separation and DOM lifecycle ownership remain in place.

The Shadow DOM contains a named navigation landmark, native buttons, labeled search, bounded text-only tooltips and an aria-current reading marker. Collapse/expand preserve focus. Keyboard activation follows native buttons. Jumps choose the actual scrollable ancestor, offset below sticky headers, always request instant behavior (including with CSS smooth scrolling) and create no destination animation. No conversation URL, message editing or selection state is changed.

### Privacy, lifecycle and limitations

Question previews remain in page memory by default. An independent, off-by-default local-backup setting permits bounded question previews, identifiers and position hints in chrome.storage.local; the user explicitly opted to add this capability. Assistant bodies, full extracted search text, queries and collapse state are not backed up. No conversation text is emitted in extension messages, logged or sent over a network. Extraction is bounded to 2,048 code units; previews/tooltips are bounded further. Version changes to 0.3.0 across package/lockfile/manifest; no dependency or permission is added.

Disabling disconnects content/shell/layout/theme/resize/intersection observers, removes route/resize/focus/theme/transition listeners, clears timers/animation frames and the preview-dismiss timer, empties the panel/search, drops strong question references and resets WeakMaps. Sidebar Colors retains its independent subscriptions and UI. Existing global content pagehide/pageshow handling continues to own feature teardown/resume.

Automated fixtures cover supported DOM shapes, duplicate questions, fallbacks, search, scrolling/offsets, recycled/detached targets, both URL/metadata transition orders, DOM replacement, streaming isolation, active state, safe layout, cleanup and simultaneous real color features. A separate isolated headless Chrome test with a local virtualized renderer discovered all 24 simulated questions while only three were mounted at the restored viewport, retained them, and restored the initial scroll position of 2100px. Local preview inspection also checked the bounded three-line card. Subsequent signed-in Chrome verification covered earliest/middle/latest relocation, backup restoration and reading-anchor recovery after a scan in one 17-question conversation. See [live verification and remaining limits](navigation-live-verification.md); the README checklist still applies to other page variants.

Navigation reads only the active main element's computed font family for typography. Its shadow host applies that family to text and controls; short styled control hints replace native title popups. This style read does not read message bodies or install global CSS.

### Local backup and virtualization corrections

`storage/navigation-backup.ts` owns the separate opt-in setting, validation, per-conversation records, restore/save scheduling and clearing. Records are capped at 300 entries across eight conversation slots. Only message/turn identifiers are eligible; DOM-only and positional test-ID keys are rejected. Live entries take precedence when merging restored records. Restore reads are generation-checked to prevent a late response being applied to another route. Queued saves capture their owner route and backup epoch. Clear disables backup and rotates the epoch before deletion; old queued/in-flight writes cannot become valid new backups or restore cleared data. Existing feature booleans and color records are separate.

Transient zero-width virtualized columns no longer immediately hide the navigation: layout samples prefer nearby mounted questions and remember only the last valid column geometry. The geometry can be reused at the same viewport width while sidebar/composer/header bounds are still remeasured. No detached message node is retained as a layout anchor. A viewport width change requires a new valid measurement. Directory data survives same-route root replacement; diagnostics count both freshly mounted and retained summaries.

### Returning-to-start diagnosis

The reusable [debugging workflow](debugging-workflow.md) documents failure classification, bounded observations and the live acceptance sequence. Keep it alongside the dated [verification evidence](navigation-live-verification.md) when changing the navigation adapters.

The former seek implementation performed one saved-pixel jump and ten 50ms exact-key checks, then explicitly restored the original position on any miss. Its rigid fixture covered neither coordinate drift nor a turn-key becoming a message ID after remount. Those omissions can produce a return even with the correct message near the new viewport. The revised matcher retains explicit identity aliases, permits weak-to-strong promotion only with a matching preview, rejects conflicting strong message IDs and requires a unique candidate. The index and local backups retain the aliases and avoid duplicate weak/strong records. Coordinates and keyed placeholders are hints; only a current mounted user message passing snapshot/target checks marks success. Failure diagnostics expose counts only, and remain accessible from the visible history control. These initial modeled corrections did not establish the live cause. Later signed-in testing reproduced native bottom-following and coordinate rebasing; the live-derived changes and verification above replace the earlier saved-pixel/bisection approach.
