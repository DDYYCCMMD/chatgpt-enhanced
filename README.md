# ChatGPT Enhanced

A modular Chrome extension (Manifest V3) for `https://chatgpt.com/*`.

V0.3.1 stabilizes **Chat Navigation**: a searchable, collapsible list of user questions discovered in the active conversation, with manual history scanning, page-memory retention, instant mounted-target jumps and best-effort active-question tracking. **Project Colors** and **Chat Colors** retain direct sidebar right-click selection, six preset colors, reset, local persistence, and independent toggles. All features default to off; existing V0.1/V0.2 settings are preserved.

Navigation starts as a frameless rail of small gray ticks, with a darker tick for the current question. Hover or keyboard-focus a tick for a bounded preview; click to jump. Hover/focus the rail to reveal the list button at its top. The expanded list uses a compact history-style layout with search, single-line previews, neutral selection, icon controls, and matching light/dark themes. Navigation inherits the active page font family; icon controls use styled hints instead of browser-native titles. Short lists shrink to their content; long lists/rails scroll within the available space.

## Install and develop

Requirements: Node.js 22.18+ and npm, Chrome 111+ with Developer mode available.

```sh
npm install
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select this repository's `dist/` directory. Pin the extension if desired. For an existing installation, click **Reload** on its extension card, then **refresh the actual ChatGPT tab** so it receives the new content script. Reopening the popup alone does not update already-injected code.

```sh
npm run dev        # Vite build watchers writing dist/; no dev server or HMR
npm run typecheck
npm test
npm run build
```

Wait for both watch builds to finish before reloading. Reload the extension, reopen the popup, and refresh ChatGPT after changes. Stop watch mode before a production build. `dist/` and `node_modules/` are generated; the lockfile supports reproducible `npm ci` installs. jsdom and types are test-only dependencies and are not shipped in the extension.

Developer references: [architecture](docs/architecture.md), [debugging lessons and verification workflow](docs/debugging-workflow.md), and [dated navigation live-verification results](docs/navigation-live-verification.md). Keep automated results and observed live behavior separate when reporting a fix.

The [navigation performance follow-up](docs/navigation-performance-verification.md) records locator optimizations, native-input measurements and remaining loading limits. See the [V0.3.1 release notes](docs/release-0.3.1.md) and [manual acceptance matrix](docs/navigation-acceptance.md) for this patch and outstanding checks.

## Using Chat Navigation

1. Reload the unpacked extension, refresh ChatGPT, and enable **Chat Navigation** in the popup (version `0.3.1`).
2. Open an existing conversation at a `/c/<conversation-id>` URL, including Project/custom-GPT nested conversation routes. New-chat pages stay idle until ChatGPT assigns a conversation URL.
3. When enough space exists, the tick rail appears in the empty gutter to the left of the message column, beyond the native sidebar. Hover/focus for a preview; Escape or leaving/blur dismisses it. Click a tick to scroll its original user turn below the header. Duplicate question text remains separate when the messages have different IDs or DOM references.
4. Hover or keyboard-focus the rail to reveal **展开问题导航** at the top, then click it for the full list. Use **搜索问题** to filter case-insensitively; the × icon clears the search. Tooltips show a bounded longer preview. Newlines/code are normalized; image/attachment-only and blank messages have generic fallback labels. Text is inserted as text, not HTML.
5. Use **收起问题导航** to return to ticks. The rail includes all questions identified during this page session, even after virtualization removes them from the DOM or the full list has a search filter. Reading-state highlighting uses IntersectionObserver for mounted questions and does not drive conversation scrolling.
6. Disable the toggle to remove the panel and dispose its observers, listeners, pending work, and message references. Project/Chat Colors continue independently.

Navigation never reserves space or moves ChatGPT's existing layout. It hides on viewports below 960 CSS pixels or when vertical space is insufficient. The rail needs 60px of clear left gutter; the list needs 200px. Expansion is disabled when only the rail fits. Previews are controlled, text-only cards with a single-line original-question heading and at most three preview lines, not browser-native message titles. Tick cards open to the right, up to 340px wide within the viewport, and may temporarily overlay messages while hovered. Their bold title shows the original question; muted text shows a bounded longer version of the same question. The card itself is clickable. Expanded-list cards stay within the navigation width. Widen the window or collapse ChatGPT's sidebar to create room.

### Scan and retain history

Click **扫描历史问题** at the bottom of the expanded list, or the history icon revealed when hovering/focusing the tick rail. Scanning jumps to the native conversation top, waits for older-message loading to settle, then uses overlapping instant jumps of 80% of the viewport with a 120ms base render wait. It restores the reading position without scroll animation; very long or slow-rendering conversations still take time to scan. Progress and a **停止并返回原位置** action are provided. On completion or explicit stop, the extension restores the original question anchor and viewport offset where possible, otherwise the saved scroll position. The status distinguishes an exact anchor restore from an approximate return. A wheel, touch, page pointer action or scrolling key cancels automation and leaves control at the user's new position. Switching conversations or disabling navigation cancels without scrolling the new page.

Already discovered question summaries stay in page memory after their DOM nodes unmount, including same-conversation remounts. Clicking a cached entry prefers any surviving keyed DOM anchor, then uses the previous position as a hint. It allows React to mount the destination and reconciles an older turn key with a newly available message ID using explicit aliases plus the preview. Conflicting message IDs are never reconciled by text. Clicks also re-discover mounted targets, validate their original text snapshot and reject a message moved out of its recorded turn. When the position hint is stale, it first searches in the direction suggested by verified known order, then can load from the top and search overlapping rendered windows for that exact identity and preview, bounded to 240 steps per traversal and a shared 30-second search budget. This fallback can take time and briefly move through history; it uses instant moves rather than a smooth animation. Both mounted and cached clicks verify that the destination remains aligned for 1.2 seconds after the last correction, accommodating native history rebasing. On the current timeline scroller, a standard DOM wheel-intent event releases native bottom-following before an instant move; managed events do not cancel the extension operation, while a real user gesture takes over immediately. If the target still cannot be verified, it returns to the prior position and gives a specific failure status instead of selecting a different message. The retained list is searchable; the count tooltip distinguishes identified questions from currently mounted ones. Refreshing the page, changing conversation URL or disabling navigation clears the in-memory index. Optional local backups can restore known summaries when the same conversation is opened again; they do not make old coordinates authoritative. The index merges overlapping DOM order and retains it across coordinate changes, instead of globally sorting pixels from different loaded windows.

Each scan is bounded to 240 traversal steps / 60 seconds (plus bounded top settling and reading-position restoration) and 2,000 retained summaries. A stopped/limited scan keeps partial discoveries and can be rerun. Completion means this scan reached the current scrollable extent; it does not prove all server-side history has loaded. The extension only reads user messages rendered by the page and makes no backend/API requests. Unidentifiable recycled nodes, unstable layout coordinates, deleted messages or alternate branches can prevent reliable relocation; old cached summaries may remain until the index is cleared, but are never matched by title or jumped to by an unchecked coordinate.

By default the index/previews remain in page memory. With the separate local-backup toggle enabled, bounded question previews, identifiers and coordinate hints are written to chrome.storage.local. Full extracted search text, assistant responses, search queries and collapse state are not backed up. No conversation content is sent through extension messages, logged or transmitted. Extraction is bounded to 2,048 text code units per visible user message; previews use up to 88 Unicode characters and tooltips up to 360. Search covers the extracted text, not the unbounded original message.

During a seek, questions remain selectable while loading and stability confirmation continue. A new choice cancels the old operation without pulling back to its saved position; only the latest queued choice starts. Manual scrolling or disabling navigation cancels queued choices too. Scans still block question buttons. Target-specific readiness can wake a seek before its timed poll; session-only height/width samples improve some stale-coordinate hints. These samples are not backed up. Exact identity and the full stability check remain required.

## Optional local question-directory backups

In the extension popup, enable **本地备份问题目录** under **历史导航备份** (off by default). The current directory is saved locally and merged with freshly discovered questions after a page refresh or when reopening the same conversation. A local backup is a directory of previously seen questions, not a transcript or a replacement for loading/rendering history. Saved entries are only relocation hints; a live matching identity and preview are required before precise jumping.

Up to eight conversations and the first 300 valid entries per conversation are backed up. Old conversations are evicted when this limit is exceeded. DOM-reference-only keys and positional test IDs are not backed up. Turning the toggle off stops backup reads/writes but retains existing backups. **关闭并清除所有目录备份** turns it off and removes all backup records; live in-memory navigation and Project/Chat Colors remain independent. After enabling, the current known directory is saved automatically. Settings, previews and identifiers stay inside this extension's local Chrome profile storage; no backend is used.

## Use Project Colors and Chat Colors

1. Enable **Project Colors**, **Chat Colors**, or both in the popup. Chat Navigation is independent.
2. In ChatGPT's native sidebar, right-click a Project header or a conversation row. A Project color or Chat color menu opens, according to item identity.
3. Select a preset to apply immediately. Choose **Reset to default** to remove only that item's preference. Normal chats and conversations rendered inside Projects are supported when stable conversation URLs are present.
4. Color changes happen in the sidebar, without popup interaction or CSS editing. Disabling either feature removes its highlights and context behavior but keeps saved colors. Re-enabling restores them without changing the other feature.

Direct right-click opens the color menu on a reliably identified Project/Chat whose color feature is enabled. No modifier key is required. Native three-dot controls, unrecognized items, disabled features, and other page areas keep their original behavior. Click outside or press Escape to dismiss. Keyboard context-menu opening depends on Chrome and the native row; inside the menu, arrows/Home/End navigate and Enter/Space selects. Tab closes it. The menu fits or scrolls inside the viewport and closes on page scrolling, resize, or window blur. A failed save rolls back the highlight and displays a retry message.

Sidebar Colors does not handle host left-click events, so normal sidebar navigation stays native. Chat Navigation handles only its own panel controls. Nested three-dot/menu controls and unrecognized items keep native context behavior. There is one shared context listener, one menu, and one sidebar watcher across the color features.

## Use Codex Cloud Colors

Enable **Codex Cloud Colors** in the extension popup, then right-click a Codex cloud task in the `chatgpt.com` sidebar. Choose one of six colors or **Reset to default**. The extension stores colors on this device by task ID, so renaming the task keeps its color. This toggle is independent of Project Colors and Chat Colors.

The adapter recognizes task links under `/codex/cloud/tasks/` and `/codex/tasks/` with a stable task ID. **检查当前页** shows how many tasks were recognized. If a cloud row shows the native menu with the toggle enabled, share its redacted link path and row attributes so its layout can be identified. Signed-in compatibility remains to be verified.

## V0.2 failure diagnosis

Code inspection confirmed that the manifest registers a bundled classic `content.js` for ChatGPT at `document_idle`, the Project Colors toggle reaches its lifecycle, and V0.2 attaches its `contextmenu` listener with capture enabled. Registration was not missing in source.

V0.2's detection was too narrow for several plausible sidebar variants: it required a small root allowlist, required `/project` at the end of Project URLs, and required a direct interactive child of metadata containers. It also recognized anchors rather than surrounding row padding and rejected nested controls. Any mismatch left the event unhandled, producing the browser menu. An off toggle, a failed settings read, or stale injected V0.2 code can produce the same symptom.

V0.2.1 adds semantic/sidebar-metadata fallback roots, stable-ID routes with an optional Project-home suffix, nested header support, guarded row wrappers, interaction-time rediscovery, and a single window-capture event delegate.

The user supplied an Elements capture showing an actual `div[role="button"][data-app-action-sidebar-project-id][data-app-action-sidebar-project-row]` header. The same container ID repeats on its folder icon; native popovers live inside the header. Nested Chats use `data-sidebar-archive-chatgpt-id` groups with deep links. These shapes now have a sanitized structural regression fixture.

Replaying the committed V0.2 detector identifies this header when a root is explicitly provided, while its old root selector finds no root in the partial supplied fragment. **The fragment omits outer sidebar ancestors, so a root mismatch on the complete page remains a hypothesis, not a confirmed sole cause.** This replay verifies the supplied structure, not the running page; other fixtures remain modeled variants.

## Reference comparison

Compared the source of [monmon0/chatgpt-style at commit 69f4ee0](https://github.com/monmon0/chatgpt-style/tree/69f4ee0418bda7232dd0ac95d795c68f7f347864). Its selection controls are in its extension popup; it does not implement a `contextmenu` listener. Its UI appearing therefore does not establish native right-click interception.

The comparison exposed two compatibility gaps now covered here: explicit sidebar scopes can exist within a generic `main` application shell, and stable navigation URLs can be exposed through `data-project-url`/`data-href`. Known sidebar roots and explicit sidebar-ID markers now take priority over the generic shell boundary; actual message `article`/message-author/turn regions remain excluded, even if they contain copied sidebar-like markup. App-wide wrappers containing messages cannot become deep-observation roots. Navigation metadata must agree when multiple URL fields are present.

The reference's title-derived identity fallback is intentionally not adopted because same-name Projects can collide and renaming changes the key. Its global appearance controls and forced text/background styles are outside this feature's scope. These are independently implemented compatibility adjustments, not a claim that the user's running page has been verified.

## Safe sidebar diagnosis

### Check without DevTools

Open the extension popup while the failing ChatGPT tab is active. The new **检查当前页** button checks a same-extension message connection to the top-frame content script. It reports the page script version, settings state, independent feature readiness, detected Project/Chat counts, and whether the latest context event stayed native, opened a color menu, or was unrecognized. The popup also runs this check when opened. After changing a toggle, click the button to refresh the report.

For a missing question panel, read the **问题导航** line. It distinguishes an unrecognized conversation address/container, zero discovered user messages, and a panel hidden by layout constraints. Layout diagnostics include only viewport width and measured gutter width, plus an identified-question count; they never include question text or conversation identifiers. Reload the extension and refresh ChatGPT after rebuilding so both sides use the current diagnostic protocol.

If it reports zero user messages despite visible questions, select one of your message bubbles using DevTools' element picker, review and run [docs/navigation-diagnostic.js](docs/navigation-diagnostic.js) in the page Console. This reports a bounded ancestor chain and candidate-container counts to distinguish a wrong scope from unsupported author markers or visibility filtering. It includes attribute names and fixed role labels, never attribute identifiers/values or message text. It makes no changes or network requests.

If it reports no connection or an unsupported old script, reload the extension at `chrome://extensions` and refresh the ChatGPT tab. If a feature is off, its native context behavior is intentional. If connected/enabled with zero detected rows, collect the structural report below. If rows are detected but a sidebar right-click remains unrecognized, share the status text and selected item's structural attributes. This separates loading, settings, detection, and event problems rather than assuming one cause from the browser menu screenshot.

The check sends only a fixed internal message and returns booleans/counts/status labels. It does not transmit IDs, URLs, titles, message bodies, or other content. It adds no permission: basic active-tab ID querying and content-script messaging do not require access to sensitive tab properties. See [Chrome Tabs permissions](https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions).

### Structural inspection if needed

1. Ensure DevTools belongs to the actual Chrome tab at `https://chatgpt.com`, not Codex, the extension popup, or another app.
2. In Elements, select the problematic sidebar label/row (right-click it, choose **Inspect**).
3. Review [docs/sidebar-diagnostic.js](docs/sidebar-diagnostic.js), then run its contents in Console if you are comfortable doing so. It uses `$0` for the selected element. It reports a bounded ancestor chain, up to 12 relevant descendants, tag/role/attribute names, and sanitized stable IDs/route flags. It omits names, titles, HTML, URL slugs/queries, and message bodies; makes no writes or network requests; and refuses a message-pane selection.
4. Share only the resulting JSON, not an entire HTML export. It can still contain Project/conversation IDs, so redact those consistently if desired.

If Chrome blocks pasting, you can instead read the selected element and its ancestor attributes in **Elements** and share only `href` route shape, `role`, and `data-*` attributes containing `project`/`sidebar`. No code execution is needed. Remove title slugs and query strings first.

The Console's “Don't paste code…” message is Chrome's [self-XSS protection](https://developer.chrome.com/blog/self-xss); it is not evidence that the snippet ran. An inline-script CSP violation is a separate blocked execution and needs its source link/stack to attribute. This extension and the diagnostic do not inject script tags, use inline event-handler attributes, or change CSP. Do not disable CSP for this extension. See [Chrome content-script isolation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) and [script-src documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src).

To check registration without console code, open DevTools **Sources → Content scripts → ChatGPT Enhanced**, and verify `content.js` appears. Also inspect errors on the extension card at `chrome://extensions`. In the popup, verify version `0.3.1` and that the relevant feature toggle is on.

## Manual Chrome testing

Use ordinary secondary click for all color-menu tests below: on a Mac trackpad, use a two-finger secondary click; with a mouse, use its right button. No Option, Shift, or other modifier is required. Reload the extension and refresh ChatGPT after updating so an older modifier-based script is not left running. Verify that native three-dot controls and unrelated page areas keep their existing menus.

1. Build, reload the unpacked extension, and refresh ChatGPT. Verify popup version `0.3.1`, four independent toggles, and retained V0.2 settings.
2. Enable Project Colors alone. Right-click actual project label text, its header button, and surrounding row padding. Test all six colors and Reset. Try duplicate Project names and renaming; colors must follow IDs. Confirm three-dot controls and ordinary chats keep native behavior.
3. Disable Project Colors, enable Chat Colors. Color two ordinary chats with the same title differently. Color a rendered conversation nested in a Project; the conversation ID must keep its color when rendered as a normal history entry. Confirm Project headers keep native behavior.
4. Enable both. Alternate between Project and Chat menus; only one menu should be present. Reset one item and verify all others remain colored. Test cross-tab changes, including reset.
5. Disable each feature separately while its menu is open. Its menu/highlights must disappear while the other feature still works. Re-enable and confirm saved values return. The Chat Navigation panel must remain independent when either color feature is toggled.
6. Rename items, switch chats/Projects, collapse/expand the sidebar, resize desktop/mobile layouts, navigate back/forward, and refresh. Restart Chrome. Verify restored colors and no duplicate menus/listeners or stale row colors.
7. Confirm left-click navigation, expansion, hover/selection/focus, and native three-dot menus still work. Test light/dark themes, RTL if available, viewport edges/short windows, Escape/outside dismissal, keyboard navigation/selection, and page scrolling.
8. Confirm typing and conversation scrolling work normally, and inspect both page/extension errors. Do not assume passing fixtures establish real DOM compatibility. If a native menu still appears, collect the bounded structural diagnostic above.

Live signed-in verification of a 17-question conversation, with remaining limits, is recorded in [navigation live verification](docs/navigation-live-verification.md).

## Manual Chat Navigation checklist

1. Verify `0.3.1` in the popup and enable Chat Navigation on a long signed-in conversation with a wide viewport. Confirm a frameless tick rail appears between the native sidebar and message column and above the composer. Hover/focus ticks to preview; test Escape and pointer-leave dismissal. Expand using the top button; the rail/list should stay in the gutter without covering sidebar, messages or composer. Tick previews may temporarily overlay messages within the viewport while hovered.
2. Compare list order with rendered user turns, including two identical prompts. Confirm assistant answers, hidden templates, unsent composer text, and other conversations do not appear.
3. Test multiline/code prompts, long Unicode text, image/attachment-only messages, and edited prompts. Confirm readable previews, generic attachment labels, and bounded tooltips.
4. Search with different letter cases, clear the search, and verify original order/numbers. Test a query with angle brackets; no HTML should execute.
5. Click early/middle/late entries or the preview card. Mounted targets should jump instantly below sticky headers; unmounted cached targets may need several seconds of bounded history loading before exact alignment. Even if the native scroller uses CSS smooth scrolling, no animated traversal or destination flashing should occur. The URL must not change. Try a target just removed by a branch/edit or virtualized history; it should fail safely.
6. Scroll manually through user/assistant turns; the highlighted question should follow reading position without causing any scrolling. Click an entry during manual scrolling and verify no repeated forced jumps.
7. Send a new user prompt and wait through assistant streaming: the new entry should appear once and the existing question list/search focus should remain stable during the answer. Edit/regenerate/change branches and verify stale entries cannot select a different message; entries whose deletion cannot be distinguished from unmounting may remain as safely failing hints.
8. Switch conversations using the native sidebar, including Project chats, and browser back/forward. Old question text/search/targets must clear and only the new conversation should populate the list. Same-conversation remounts should retain known summaries without retaining detached message nodes.
9. Collapse/expand the navigation and use Tab/Enter to operate its controls. Change light/dark theme, collapse/expand ChatGPT's native sidebar, resize the browser, and grow the composer. At narrow widths or insufficient left gutter the panel should hide safely; restoring space should show it again.
10. Toggle Chat Navigation off while a jump or answer is in progress; panel/highlight work should stop. Re-enable and verify a single panel. Independently test Project Colors and Chat Colors, right-click menus, reset, and normal typing/left-click navigation.
11. Inspect Chrome storage and extension diagnostics if desired: with backups disabled by default, only preferences/color IDs should be written. With backups enabled, only bounded local question-directory records should be added, never assistant bodies, full extracted search text or search queries. Diagnostics must still contain no previews. Check page/extension consoles for errors without sharing conversation content.
12. Start a history scan halfway through a long virtualized conversation. Confirm the count grows, cached questions remain after returning, and your original reading offset is restored. Stop midway; then repeat and use the wheel to take over. Switch conversation or disable during a scan and verify no subsequent automated scrolling. Click a cached old question and verify exact identity relocation or a clear failure message. Test a long preview: no large browser-native text box should appear.

13. Enable local backups, scan, refresh and confirm known summaries restore alongside newly mounted questions. Disable backup reads/writes; then clear all backups and confirm colors are unaffected. Test a recycled row whose question text changes before clicking: it must update the directory without jumping to the replacement. At the top and bottom, transient zero-width virtualized columns should retain navigation using the last measured geometry.

If the panel is absent on a wide window, first ensure a conversation URL and mounted user turns exist and there is actual space left of the content column. The compatibility adapter requires visible `main`/`role=main` and either `[data-message-author-role="user"]` or `[data-user-message-bubble]` nodes. The latter was added after the user's diagnostic showed zero legacy author markers on the real page. If these differ, report only structural attributes and measurements; a screenshot or question text is not required.


## Compatibility and unverified behaviors

The 2026-11-26 signed-in Chrome records cover one 17-question conversation: earliest/middle/latest relocation, rapid selection, scan/explicit-stop reading-position restoration, and directory restoration after refresh. Some successful targets were checked again after 2s and 8s. These observations belong to the recorded V0.3.0 baseline, not a new live test of V0.3.1. Other accounts, Project/custom-GPT conversations, streaming, edited branches, slow networks, window layouts and actual Chrome-restart persistence still need broader live verification. Local headless previews and automated fixtures do not establish those results. Use the [acceptance matrix](docs/navigation-acceptance.md); cold history may take seconds, bounded scans may miss server-side history, and deleted/edited targets or timeouts may fail safely. No controlled evidence establishes a universal speedup percentage.

Detection uses exact canonical IDs, never titles. Supported Project routes include `/g/g-p-<32-hex-or-UUID>[-slug]` with optional `/project`, and `/project(s)/g-p-<id>`. Explicit project metadata may use canonical `g-p-` IDs or bare stable IDs, normalized to `g-p-…`. Chat routes use `/c/<stable-id>` or `/g/<stable-gizmo-id>[-slug]/c/<stable-id>`; arbitrary title-like segments are rejected. Unsupported formats fail closed.

Known sidebar IDs/test IDs are preferred. Unlabelled semantic `aside`/`nav`/navigation fallback roots require sidebar-item evidence and must be outside generic `main`. Explicit sidebar IDs/test IDs/`data-sidebar` and sidebar-specific metadata can sit inside a `main` app shell, while actual message boundaries are always excluded. Explicitly sidebar-named project metadata and `data-sidebar-archive-chatgpt-id` groups can bootstrap their own bounded roots. A Chat group is used only when its ID agrees with its conversation URL. Native popovers, tooltips, pin/new-chat buttons, and menu controls are excluded. Completely unlabelled layouts without such evidence remain unsupported. When no root is mounted, root-only discovery polls every 1.5 seconds; it stops once mounted. Dynamic DOM changes and interaction-time rediscovery handle SPA updates without intercepting history APIs.

Preferences are device-local and keyed by stable IDs. Separate keys prevent Project/Chat collision and cross-item write races. Same-item concurrent writes use last-write behavior. Deleted-item preferences are retained until reset or uninstall. Future undocumented DOM changes may require adapter updates; rendering fewer uncertain rows is preferable to coloring the wrong item.

## Architecture and privacy

```text
public/manifest.json             MV3; storage permission only
src/content/                    Content entry and existing lifecycle
src/features/project-colors/    Project-specific identity/detection and adapter
src/features/chat-colors/       Chat-specific identity/detection and adapter
src/features/chat-navigation/   Discovery, previews, panel/layout, scrolling, active tracking, lifecycle
src/shared/sidebar-colors/      Palette, menu, rendering, sidebar watcher, shared lifecycle
src/storage/                    Toggle settings and generic namespaced color store
src/popup/                      Independent feature toggles
scripts/                        Vite build orchestration
tests/                          Storage/DOM regression fixtures and diagnostics tests
docs/                           Architecture and safe diagnosis
```

Only `storage` permission is requested. No backend, telemetry, OpenAI API, external assets, runtime network requests, or application-internal APIs/state access are added. Default persistent data consists of feature booleans, stable item IDs and preset color names. With the separate, off-by-default local directory backup enabled, bounded user-question previews, identifiers and position hints are also saved to `chrome.storage.local` (up to eight conversations, 300 entries each). This is a question directory, not a full conversation backup; session layout samples are never persisted. Sidebar Colors reads navigation attributes and adds namespaced row attributes and owned style/menu nodes. When enabled, Chat Navigation additionally reads only visible user-message text in the active rendered conversation and builds an ephemeral Shadow DOM panel. It never reads assistant bodies, saves full transcripts, requests backend history, or changes underlying Project/conversation data. With backups off, question summaries remain in page memory. Disabling backup stops reads/writes but keeps existing records; the separate clear action disables backup and removes those records.

See [architecture](docs/architecture.md), [Vite build documentation](https://vite.dev/guide/build.html), and [Chrome storage API documentation](https://developer.chrome.com/docs/extensions/reference/api/storage).

Chat Navigation currently recognizes a single visible conversation main, preferring matching `data-conversation-id` and known conversation/thread containers. Stable message/turn metadata is preferred; DOM reference keys are scoped to the current route when absent. Hidden/inert messages and assistant subtrees are excluded. Ambiguous or mismatched roots remain idle. Reused message nodes with unchanged old metadata are withheld during conversation transitions until ownership can be established; if a future layout reuses unidentifiable nodes without changing metadata, the panel may temporarily omit those questions rather than expose stale content.

The positioning adapter measures bounded-width ancestors/known thread utility classes and falls back conservatively to turn bounds. Unknown column layouts, RTL variants, unusual fixed headers, or compact/sidebar-heavy windows may hide the panel. Active tracking is best-effort for the mounted user turns; it is unavailable without IntersectionObserver. All of these real-site behaviors remain part of manual verification.

If a history click returns to the start, the history icon remains visible: hover it or expand the list to read the failure status. Counts distinguish mounted messages, identity candidates and preview matches without exposing message text or identifiers. Regression cases cover identity promotion, shifted coordinate estimates, delayed remounts, live keyed placeholders and conflicting message IDs. The dated live records cover one conversation; V0.3.1 and other scenarios require the acceptance checks linked above.
