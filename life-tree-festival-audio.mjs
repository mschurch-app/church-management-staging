// Shared media selection. Holy Week day one has its own user-provided recording.
// Keep calendar/reading plans and the server's theme identifiers unchanged.
export function festivalMusicURL(theme = {}, version = '20261012-hosanna1') {
  const palmSunday = theme.id === 'easter' && Number(theme.day) === 1;
  const file = palmSunday ? 'hosanna-palm-sunday.mp3' : `${theme.music || theme.id}.wav`;
  return new URL(`assets/audio/life-tree/festivals/${file}?v=${palmSunday ? '20261012-hosanna1' : version}`, import.meta.url).href;
}
