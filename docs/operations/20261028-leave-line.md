# Leave notification channel policy

M+ deputy confirmation, manager review, and leave results now use LINE only. SHiNE leave notifications remain disabled. The deputy-before-manager workflow, authorization checks, private reason handling, and calendar sync are unchanged.

The shared notification router enforces this policy even with a legacy dual-channel route or an unavailable route lookup. A successful LINE send alone confirms delivery; a failed LINE send remains unconfirmed without App fallback. Existing successful LINE receipts prevent duplicate sends. The settings UI saves App=false and LINE=true, and the generic leave UI acknowledges deliberately disabled notifications for SHiNE.

## Rollout

1. Deploy `pastoral-coworker-tools` with its existing four-file dependency bundle and existing `verify_jwt=false` (authentication remains enforced by the handler).
2. Apply the adjacent data-only SQL configuration to the six leave route rows.
3. Publish frontend changes and the updated service worker.
4. Read back the deployed bundle and route settings, then verify published asset versions.

No historical notifications are resent, no test leave requests are created, and no real staff messages are sent during validation. No schema, grant, payroll, or leave-record changes are included.

## Validation

- 20 synthetic leave/calendar/channel tests: approvals, deputy decline, privacy, LINE-only success, quota/network failures, missing LINE identity, idempotency, legacy routes, SHiNE silence, and unrelated App event preservation.
- 23 service-worker checks, 18 catalog checks, and 20 definition checks.
- Local UI: each of the three leave cards saves `p_app_enabled=false,p_line_enabled=true` and acknowledges LINE. Synthetic screenshot and RPC receipts remain outside the public repository.
- Native iPhone and real multi-person leave delivery remain subject to the next genuine leave workflow; no synthetic result is presented as that acceptance.
