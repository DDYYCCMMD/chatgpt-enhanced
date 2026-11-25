# Navigation live verification — 2026-11-26

Tested in the user's installed Chrome extension on macOS against the real ChatGPT website, in one existing long conversation. No messages were sent or edited. This record contains no conversation text or message/conversation identifiers.

For reusable investigation steps, acceptance criteria and lessons from the repeated attempts, see [debugging workflow](debugging-workflow.md). This file records the observed results of this particular session.

## Reproduced failure

- A bare programmatic `scrollTo` could reach an older loaded window and then snap back to the bottom about 800ms later, even when bypassing the extension's failure-restoration code.
- Loading older turns changed both the native scroll height and coordinate origin. Sorting retained messages by pixels from different loaded windows corrupted directory order.
- A requested message could mount during top loading before the whole window settled. Waiting for global settling before checking it could miss that opportunity.
- Repeated waiting in long assistant-answer regions made the fallback traverse too slowly. No assistant body is needed to traverse those regions.

## Implemented response

The marked native timeline receives directional DOM wheel intent before instant moves, including at a rebased zero boundary. Managed intent events do not cancel their own operation; real wheel/touch/pointer/scrolling-key actions still take over. Mounted messages use their own native `scrollIntoView` anchor followed by header clearance. The destination must match its stable identity and captured preview, then remain aligned for 1.2 seconds after the last correction. A target found during top loading is anchored immediately.

Saved pixels remain hints. Missing targets are sought using overlapping native windows, guided by verified known order where available, with a shared search time budget. The index preserves merged DOM order rather than sorting mixed pixel offsets. Local backups retain previews/identifiers only when enabled; they do not load old message DOM themselves.

Follow-up edits distinguish exact reading-anchor restoration from an approximate return and preserve chronology when a backup read arrives after live tail messages. The scrolling logic described below is unchanged; the final build was reloaded in Chrome and checked again in the normal full-height layout.

## Observed results

| Scenario | Observed result |
| --- | --- |
| Refresh with local directory backup enabled | 17 known questions restored while only a few native user messages were initially mounted. |
| End of conversation → earliest cached question | Correct stable identity; user bubble at 72 CSS px below the viewport top in the test layout, still there at the delayed 2s/6s observations. |
| Earliest → latest cached question | Exact target mounted and aligned at 72px; subsequent observation reported idle and “已定位历史问题”, without returning to the old position. Loading this distant unmounted target took several seconds. |
| Latest → middle question that previously failed | Correct identity, 72px alignment, idle success at both 3s and 8s observations. |
| Manual history scan from that middle question | Completed with all 17 directory entries retained; restored the same message to the same 72px offset. A second observation 2s later confirmed no rollback. |
| Real wheel during an incomplete search | Automation stopped and yielded to manual scrolling. |
| Final build in normal browsing layout | DevTools closed, final extension build reloaded, 17-entry order restored, earliest cached question clicked from the later reading position and visibly aligned below the header. |

Verification used native Chrome clicks and bounded read-only DevTools checks of identifiers, geometry and the extension's own status. The temporary implementation probes were removed. No message text or identifiers are emitted by runtime diagnostics.

## Limits of this evidence

- This is one live conversation and the current ChatGPT DOM, not a guarantee for every account, browser version or future website update.
- Other conversations, Project/custom-GPT nested conversation views, active response streaming, edited branches and very slow network/history loading were not exhaustively verified live.
- Exact native scrolling is instant once the target is mounted. Relocating an unmounted target may take seconds and may visibly traverse history; no complete server-side history or instant cold-cache jump is promised.
- A bounded scan reaching the current native extent does not prove the server has rendered every historical message. Deleted/changed targets can fail safely.
- Clear-backup and toggle isolation are covered by automated tests; live stored user preferences were not deleted for testing.

The referenced [chatgpt-style content script](https://github.com/monmon0/chatgpt-style/blob/main/content.js) was inspected separately. Its current code implements sidebar colors/appearance; it provides no conversation-history navigation algorithm to reuse.

## Final automated checks

`npm run build` (including TypeScript checking), `npm test` (106 passing tests) and `git diff --check` passed. The loadable output is `dist/`. These observations were recorded before the local commit; use Git history for the commit identity. No push or merge was part of this verification.
