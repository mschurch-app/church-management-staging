// One completion per authenticated participant and opening release, never a daily reset.
export const OPENING_VERSION = '20261014-storyvoice-v1';
export function needsOpening(state) { return state.openingStory?.version !== OPENING_VERSION; }
export function completeOpening(state, version, completedAt = new Date().toISOString()) {
  if (version !== OPENING_VERSION || !/^(male|female)-[123]$/.test(state.avatarId || '')) throw Error('invalid_action');
  if (needsOpening(state)) state.openingStory = { version, completedAt };
}
