# Button stability audit

Last reviewed: 2026-10-07

## Scope

- 45 HTML pages containing buttons
- 180 static button elements, including nested pastoral pages
- 18 HTML forms
- 229 explicit click or submit handlers
- Shared mobile interaction feedback, service worker cache, authentication pages, review pages, settings pages, and administrative editors

## Root causes found

1. The shared feedback module replaced native `focus()` and `scrollIntoView()` methods on mobile. That changed browser behavior for every page and could prevent an editor from focusing or moving into view after a button tap.
2. User initiated network requests without their own abort signal could wait indefinitely. The page handler then kept its button disabled, which looked like a frozen page.
3. Some pages disabled a group of controls during a request and later enabled every control. That could override controls which had already been disabled by permissions, paging state, or business rules.
4. The member binding review cleared the visible list before the server confirmed success. A delayed request therefore left a blank page with no useful recovery action.
5. Installed App mode can continue using an old script until the service worker updates its cache.

## Corrections

- Native browser focus and scrolling behavior is no longer replaced.
- Tracked user initiated fetch requests that do not already define a timeout now stop after 45 seconds and return a clear timeout error.
- Heat Camp filters and welcome form settings restore each control's previous disabled state.
- Member binding review keeps the current card visible while processing and restores its prior control states if the request fails.
- The service worker cache version is advanced so installed App mode receives the corrected shared script.

## Regression rules

- A form action must use `try` / `catch` / `finally` when it disables a control.
- Restore the control state captured before the request; do not enable an entire page unconditionally.
- Do not replace browser prototypes for UI behavior.
- Destructive or publishing actions must show an in progress state and a terminal success or failure message.
- Long network operations must provide an abort signal or use the shared 45 second safety timeout.
- Keep a visible page or dialog while the request is pending; remove it only after confirmed success.

## Verification limitations

The repository has no browser automation suite or CI workflow. This audit includes static handler coverage and JavaScript syntax checks. Authenticated production actions such as approving content, changing member data, publishing, or charging payments require account based smoke testing after deployment.
