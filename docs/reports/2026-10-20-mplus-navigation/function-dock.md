# M+ functional page navigation

Replaced the dedicated attendance/photos page's legacy three-entry mobile dock with the approved five entries: 教會、課輔、行政、服事、網站. Static HTML contains these links from first paint. Links return directly to the matching permission-filtered hub on the standalone M+ home. Invalid hub query values fall back to home.

The shared management-page branding mounts the same dock only after selecting verified M+ access. SHiNE does not mount it. Attendance highlights 行政; photos highlights 網站. Scoped CSS reserves bottom safe-area space and does not replace functional form styles.

Validation: 29 navigation, shell, permissions, calendar and preserved-tools tests passed. Browser checked at 393×852: all five links are >44px, no horizontal overflow, attendance/photos switch updates the active hub, and the admin deep link opens approved category cards. Synthetic data only; no real attendance, leave, photo, account or calendar records were written.
