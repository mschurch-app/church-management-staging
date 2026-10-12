// Shared media selection for user-provided Holy Week recordings.
// Keep calendar/reading plans and the server's theme identifiers unchanged.
export function festivalMusicURL(theme = {}, version = '20261012-hosanna1') {
  const day = theme.id === 'easter' ? Number(theme.day) : 0;
  const recording = day === 1
    ? ['hosanna-palm-sunday.mp3', '20261012-hosanna1']
    : day === 6 ? ['via-dolorosa-good-friday.mp3', '20261012-goodfriday1']
    : day === 8 ? ['because-he-lives-easter.mp3', '20261012-easter1'] : null;
  const [file, mediaVersion] = recording || [`${theme.music || theme.id}.wav`, version];
  return new URL(`assets/audio/life-tree/festivals/${file}?v=${mediaVersion}`, import.meta.url).href;
}
