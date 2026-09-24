import {LINE_LOGIN_CHANNEL_ID} from '../line-config.mjs';
export {LINE_LOGIN_CHANNEL_ID};
// Add a dedicated LIFF app under the existing LINE Login channel.
// Endpoint must cover this directory (e.g. https://your-host/pastoral/).
// Do not reuse or change a member-facing LIFF endpoint.
export const PASTORAL_LIFF_ID = '';
// Public HTTPS backend origin, not a secret. Never read it from query parameters.
export const PASTORAL_API_BASE = '';
