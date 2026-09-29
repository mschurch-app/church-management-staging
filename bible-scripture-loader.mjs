import { BIBLE_BOOKS_2027 } from './bible-metadata-2027.mjs';

// Chinese Union Version (Traditional) book IDs in the public Bible JSON source.
const sourceBookIds = [
  'gn','ex','lv','nm','dt','js','jud','rt','1sm','2sm','1kgs','2kgs','1ch','2ch','ezr','ne','et',
  'is','jr','lm','ez','dn','ho','jl','am','ob','jn','mi','na','hk','zp','hg','zc','ml','job','ps','prv','ec','so',
  'mt','mk','lk','jo','act','rm','1co','2co','gl','eph','ph','cl','1ts','2ts','1tm','2tm','tt','phm','hb','jm','1pe','2pe','1jo','2jo','3jo','jd','re'
];
const books = new Map(BIBLE_BOOKS_2027.map((book, index) => [book.traditionalChineseName, { ...book, sourceId: sourceBookIds[index] }]));
const bookLoads = new Map();

export function parseScheduledChapters(passage) {
  const match = String(passage || '').match(/🌳 根｜(.*?)　🌿 枝｜(.*?)　🍎 果｜(.*?)(?:（共 [^）]+）)?$/);
  if (!match) return [];
  const entries = [];
  for (const track of match.slice(1)) {
    if (!track || track.trim() === '—') continue;
    for (const source of track.split(/[、,，;；\n]+/).map((item) => item.trim()).filter(Boolean)) {
      const reference = source.match(/^(.+?)\s+(\d+)(?:\s*[–—~-]\s*(\d+))?\s*章?$/);
      if (!reference) throw new Error(`讀經範圍格式無法辨認：${source}`);
      const book = books.get(reference[1].trim());
      if (!book) throw new Error(`找不到書卷：${reference[1].trim()}`);
      const start = Number(reference[2]), end = Number(reference[3] || reference[2]);
      if (start < 1 || end < start || end > book.chapterCount) throw new Error(`${book.traditionalChineseName} ${start}–${end} 章超出範圍。`);
      for (let chapter = start; chapter <= end; chapter++) entries.push({ book, chapter });
    }
  }
  return entries;
}

function cleanVerse(value) {
  return String(value || '').replace(/[\s\u3000]+/g, '').trim();
}

async function loadBook(book) {
  if (!bookLoads.has(book.sourceId)) {
    const url = `https://raw.githubusercontent.com/MaatheusGois/bible/main/versions/zh/cuv/${book.sourceId}/${book.sourceId}.json`;
    const request = fetch(url).then(async (response) => {
      if (!response.ok) throw new Error(`經文來源暫時無法讀取（${response.status}）。`);
      const data = await response.json();
      if (!Array.isArray(data.chapters)) throw new Error('經文來源格式不正確。');
      return data.chapters;
    }).catch((error) => { bookLoads.delete(book.sourceId); throw error; });
    bookLoads.set(book.sourceId, request);
  }
  return bookLoads.get(book.sourceId);
}

export async function loadScheduledChapters(passage) {
  const schedule = parseScheduledChapters(passage);
  const chapterData = await Promise.all(schedule.map(async ({ book, chapter }) => {
    const chapters = await loadBook(book);
    const verses = chapters[chapter - 1];
    if (!Array.isArray(verses) || verses.length === 0) throw new Error(`${book.traditionalChineseName} ${chapter} 章目前沒有完整經文。`);
    const search = encodeURIComponent(`${book.traditionalChineseName} ${chapter}`);
    return {
      title: `${book.traditionalChineseName} ${chapter} 章`,
      source: `https://www.biblegateway.com/passage/?search=${search}&version=CUV`,
      verses: verses.map(cleanVerse)
    };
  }));
  return chapterData;
}
