# Navigation performance follow-up — 2026-11-26

This follow-up optimizes the locator documented in [the original live verification](navigation-live-verification.md). It preserves stable-ID/preview checks, header clearance, the 1.2-second stability period after the last correction, and safe failure/restoration. It adds no dependency, permission or network request.

## Changes

- **Target readiness:** a temporary, scoped MutationObserver wakes the locator on the next animation frame when the requested user-message anchor mounts. Unrelated/assistant mutations do not accelerate traversal. The timed poll remains a fallback. The observer and frame are removed on completion and synchronously on disposal.
- **Session geometry:** each position carries its observed native scroll height and width. At a matching width, a height change can supply an end-relative hint for prefix rebasing. Appending below a message can invalidate this prediction; original coordinates and identity-based traversal remain fallbacks. Cold or width-invalidated directory edges can also probe native boundaries. Layout samples are omitted from backups and discarded on restore. Hints never prove identity.
- **Immediate handoff:** questions remain selectable during seeking and confirmation. A new choice cancels the old operation without restoring its old location, waits for cleanup, and runs only the latest queued choice. Manual takeover, route changes and disposal invalidate queued choices. A fresh DOM discovery precedes scroll-container selection, and the queued click retains its original preview snapshot. Scans still block question buttons.
- **Already aligned targets:** a validated message at the requested line avoids redundant native anchoring and wheel intent, while retaining stability verification.

## Live method and observations

Tested in Chrome on macOS, in the same existing 17-question conversation. The measured viewport was 1512 × 469 CSS pixels with DevTools below the page. Diagnostics retained only timings, booleans, counts, geometry and fixed extension status; no conversation text or identifiers are stored here.

Early trials mixed native clicks and Console-generated button clicks. These are not interchangeable performance inputs: scripted clicks have a different trusted-input state and can leave the page unfocused. One early cold attempt safely failed after about 20.4s. Scripted middle/latest trials completed in about 2.7/1.6s before the change and 3.1/1.7s in the initial optimized trial. These samples **do not establish a general latency improvement** or a controlled comparison with identical cache state.

Final acceptance used actual native mouse input, recording trusted input and page focus as true:

| Scenario | First correct alignment | Completed | Observed result |
| --- | --- | --- | --- |
| Cold earliest question | 5.701s | 6.951s | Correct target; native scroll height expanded from about 18k to 39k pixels as history loaded. No scroll-host replacement was observed. |
| Rapid middle → latest choice | 0.545s for latest | 1.802s for latest | Old request superseded after about 0.310s; controls remained usable. Latest stayed aligned 2s and 8s after completion. |
| Latest → middle | 0.325s | 2.801s | Correct target, usable controls, stable alignment at both 2s and 8s after completion. |

The concrete responsiveness gain is that a new selection can take effect during verification, rather than waiting for the previous confirmation. The guard was not shortened. Cold history loading still depends on the website and can take several seconds. No universal speedup percentage or instant cold-cache jump is claimed.

## Final normal-window cold-load correction

A subsequent full-height cold attempt still missed the earliest target and restored the reading position. The remaining issue was modeled as a quiet *local* loaded-window top containing only known questions later than the requested entry. Treating that as fully settled could start downward traversal before older history mounted.

The final change keeps such a seek at the top within its existing overall budget, checking exact identity as history mounts. It does not extend manual scans indefinitely or assume a directory edge is the server's true history boundary. The added regression delays the older target beyond the local settling interval while a later known message remains at local zero.

After rebuilding/reloading and refreshing without DevTools, an actual click on the earliest entry completed with “已定位历史问题 · 已识别 17 条”. This normal-window check is separate from the earlier numeric timings; no new timing comparison is inferred from it.

Full scanning and explicit Stop were also retested: the original middle-message anchor and reading offset were restored, and all 17 entries remained. Native accessibility state confirmed question buttons were disabled during scanning. An initial capture-phase microtask probe had reported their pre-handler state; it was not used as evidence of the final disabled state.

## Automated regression coverage

Tests cover one-probe prefix rebasing, incorrect end-relative hints falling back to original coordinates, width invalidation, non-persistence of geometry, target readiness before a timed poll, and a simulated snap-back at 800ms. Handoff tests cover coalescing, no old-guard scrolling after replacement, manual/disposal cancellation, intervening edits, and observer cleanup. The DOM integration test keeps controls usable while the stability check continues.

The full suite has 116 passing tests; build/type checking and diff checks pass. Evidence covers one live conversation and website version. Other accounts, nested layouts, streaming/edited branches and slow-network extremes remain unverified live.
