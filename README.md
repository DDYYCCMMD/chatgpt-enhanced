# ChatGPT Enhanced

A modular Chrome extension (Manifest V3) for `https://chatgpt.com/*`.

V0.2.1 supports independent **Project Colors** and **Chat Colors**: right-click a recognized sidebar row to choose Red, Orange, Yellow, Green, Blue, Purple, or Reset to default. Preferences persist locally. **Chat Navigation remains a placeholder.** All toggles default to off; existing V0.1/V0.2 preferences are preserved.

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

## Use Project Colors and Chat Colors

1. Enable **Project Colors**, **Chat Colors**, or both in the popup. Chat Navigation is independent.
2. In ChatGPT's native sidebar, right-click a Project header or a conversation row. A Project color or Chat color menu opens, according to item identity.
3. Select a preset to apply immediately. Choose **Reset to default** to remove only that item's preference. Normal chats and conversations rendered inside Projects are supported when stable conversation URLs are present.
4. Color changes happen in the sidebar, without popup interaction or CSS editing. Disabling either feature removes its highlights and context behavior but keeps saved colors. Re-enabling restores them without changing the other feature.

Direct right-click opens the color menu on a reliably identified Project/Chat whose color feature is enabled. No modifier key is required. Native three-dot controls, unrecognized items, disabled features, and other page areas keep their original behavior. Click outside or press Escape to dismiss. Keyboard context-menu opening depends on Chrome and the native row; inside the menu, arrows/Home/End navigate and Enter/Space selects. Tab closes it. The menu fits or scrolls inside the viewport and closes on page scrolling, resize, or window blur. A failed save rolls back the highlight and displays a retry message.

The extension does not handle left-click events, so normal navigation stays native. Nested three-dot/menu controls and unrecognized items keep native context behavior. There is one shared context listener, one menu, and one sidebar watcher even when both color features are enabled.

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

If it reports no connection or an unsupported old script, reload the extension at `chrome://extensions` and refresh the ChatGPT tab. If a feature is off, its native context behavior is intentional. If connected/enabled with zero detected rows, collect the structural report below. If rows are detected but a sidebar right-click remains unrecognized, share the status text and selected item's structural attributes. This separates loading, settings, detection, and event problems rather than assuming one cause from the browser menu screenshot.

The check sends only a fixed internal message and returns booleans/counts/status labels. It does not transmit IDs, URLs, titles, message bodies, or other content. It adds no permission: basic active-tab ID querying and content-script messaging do not require access to sensitive tab properties. See [Chrome Tabs permissions](https://developer.chrome.com/docs/extensions/reference/api/tabs#permissions).

### Structural inspection if needed

1. Ensure DevTools belongs to the actual Chrome tab at `https://chatgpt.com`, not Codex, the extension popup, or another app.
2. In Elements, select the problematic sidebar label/row (right-click it, choose **Inspect**).
3. Review [docs/sidebar-diagnostic.js](docs/sidebar-diagnostic.js), then run its contents in Console if you are comfortable doing so. It uses `$0` for the selected element. It reports a bounded ancestor chain, up to 12 relevant descendants, tag/role/attribute names, and sanitized stable IDs/route flags. It omits names, titles, HTML, URL slugs/queries, and message bodies; makes no writes or network requests; and refuses a message-pane selection.
4. Share only the resulting JSON, not an entire HTML export. It can still contain Project/conversation IDs, so redact those consistently if desired.

If Chrome blocks pasting, you can instead read the selected element and its ancestor attributes in **Elements** and share only `href` route shape, `role`, and `data-*` attributes containing `project`/`sidebar`. No code execution is needed. Remove title slugs and query strings first.

The Console's “Don't paste code…” message is Chrome's [self-XSS protection](https://developer.chrome.com/blog/self-xss); it is not evidence that the snippet ran. An inline-script CSP violation is a separate blocked execution and needs its source link/stack to attribute. This extension and the diagnostic do not inject script tags, use inline event-handler attributes, or change CSP. Do not disable CSP for this extension. See [Chrome content-script isolation](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts) and [script-src documentation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/script-src).

To check registration without console code, open DevTools **Sources → Content scripts → ChatGPT Enhanced**, and verify `content.js` appears. Also inspect errors on the extension card at `chrome://extensions`. In the popup, verify version `0.2.1` and that the relevant feature toggle is on.

## Manual Chrome testing

Use ordinary secondary click for all color-menu tests below: on a Mac trackpad, use a two-finger secondary click; with a mouse, use its right button. No Option, Shift, or other modifier is required. Reload the extension and refresh ChatGPT after updating so an older modifier-based script is not left running. Verify that native three-dot controls and unrelated page areas keep their existing menus.

1. Build, reload the unpacked extension, and refresh ChatGPT. Verify popup version `0.2.1`, three independent toggles, and retained V0.2 settings.
2. Enable Project Colors alone. Right-click actual project label text, its header button, and surrounding row padding. Test all six colors and Reset. Try duplicate Project names and renaming; colors must follow IDs. Confirm three-dot controls and ordinary chats keep native behavior.
3. Disable Project Colors, enable Chat Colors. Color two ordinary chats with the same title differently. Color a rendered conversation nested in a Project; the conversation ID must keep its color when rendered as a normal history entry. Confirm Project headers keep native behavior.
4. Enable both. Alternate between Project and Chat menus; only one menu should be present. Reset one item and verify all others remain colored. Test cross-tab changes, including reset.
5. Disable each feature separately while its menu is open. Its menu/highlights must disappear while the other feature still works. Re-enable and confirm saved values return. Chat Navigation must stay unaffected and inert.
6. Rename items, switch chats/Projects, collapse/expand the sidebar, resize desktop/mobile layouts, navigate back/forward, and refresh. Restart Chrome. Verify restored colors and no duplicate menus/listeners or stale row colors.
7. Confirm left-click navigation, expansion, hover/selection/focus, and native three-dot menus still work. Test light/dark themes, RTL if available, viewport edges/short windows, Escape/outside dismissal, keyboard navigation/selection, and page scrolling.
8. Confirm typing and conversation scrolling work normally, and inspect both page/extension errors. Do not assume passing fixtures establish real DOM compatibility. If a native menu still appears, collect the bounded structural diagnostic above.

## Compatibility and unverified behaviors

**Live Chrome/ChatGPT testing for V0.2.1 was unavailable: browser control timed out.** The following remain explicitly unverified on the current site: additional Project metadata/header variants beyond the supplied capture, ordinary and Project-nested Chat hit areas on the running site, competing native context handlers, mobile/sidebar replacement layouts, visual themes/focus/viewport placement, extension loading/CSP in Chrome, persistence across a real browser restart, and two-tab interaction. jsdom covers logic and modeled DOM behavior, not these live guarantees.

Detection uses exact canonical IDs, never titles. Supported Project routes include `/g/g-p-<32-hex-or-UUID>[-slug]` with optional `/project`, and `/project(s)/g-p-<id>`. Explicit project metadata may use canonical `g-p-` IDs or bare stable IDs, normalized to `g-p-…`. Chat routes use `/c/<stable-id>` or `/g/<stable-gizmo-id>[-slug]/c/<stable-id>`; arbitrary title-like segments are rejected. Unsupported formats fail closed.

Known sidebar IDs/test IDs are preferred. Unlabelled semantic `aside`/`nav`/navigation fallback roots require sidebar-item evidence and must be outside generic `main`. Explicit sidebar IDs/test IDs/`data-sidebar` and sidebar-specific metadata can sit inside a `main` app shell, while actual message boundaries are always excluded. Explicitly sidebar-named project metadata and `data-sidebar-archive-chatgpt-id` groups can bootstrap their own bounded roots. A Chat group is used only when its ID agrees with its conversation URL. Native popovers, tooltips, pin/new-chat buttons, and menu controls are excluded. Completely unlabelled layouts without such evidence remain unsupported. When no root is mounted, root-only discovery polls every 1.5 seconds; it stops once mounted. Dynamic DOM changes and interaction-time rediscovery handle SPA updates without intercepting history APIs.

Preferences are device-local and keyed by stable IDs. Separate keys prevent Project/Chat collision and cross-item write races. Same-item concurrent writes use last-write behavior. Deleted-item preferences are retained until reset or uninstall. Future undocumented DOM changes may require adapter updates; rendering fewer uncertain rows is preferable to coloring the wrong item.

## Architecture and privacy

```text
public/manifest.json             MV3; storage permission only
src/content/                    Content entry and existing lifecycle
src/features/project-colors/    Project-specific identity/detection and adapter
src/features/chat-colors/       Chat-specific identity/detection and adapter
src/features/chat-navigation/   Inert placeholder
src/shared/sidebar-colors/      Palette, menu, rendering, sidebar watcher, shared lifecycle
src/storage/                    Toggle settings and generic namespaced color store
src/popup/                      Independent feature toggles
scripts/                        Vite build orchestration
tests/                          Storage/DOM regression fixtures and diagnostics tests
docs/                           Architecture and safe diagnosis
```

Only `storage` permission is requested. No backend, telemetry, OpenAI API, external assets, runtime network requests, or application-internal APIs/state access are added. Stored data consists of booleans, stable item IDs, and six preset color names; no titles or message bodies. The content script reads navigation attributes, adds namespaced row attributes and owned style/menu nodes, and never modifies underlying Project or conversation data.

See [architecture](docs/architecture.md), [Vite build documentation](https://vite.dev/guide/build.html), and [Chrome storage API documentation](https://developer.chrome.com/docs/extensions/reference/api/storage).
