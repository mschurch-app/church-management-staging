// Canonical Traditional Chinese Bible metadata for validating the 2027 reading plan.
// Track assignment follows the agreed plan: ROOTS (OT history/prophets),
// BRANCHES (New Testament), FRUIT (Job, Psalms, Proverbs, Ecclesiastes, Song of Songs).
const rows = [
  ['創世記',50,'roots'],['出埃及記',40,'roots'],['利未記',27,'roots'],['民數記',36,'roots'],['申命記',34,'roots'],
  ['約書亞記',24,'roots'],['士師記',21,'roots'],['路得記',4,'roots'],['撒母耳記上',31,'roots'],['撒母耳記下',24,'roots'],
  ['列王紀上',22,'roots'],['列王紀下',25,'roots'],['歷代志上',29,'roots'],['歷代志下',36,'roots'],['以斯拉記',10,'roots'],
  ['尼希米記',13,'roots'],['以斯帖記',10,'roots'],['以賽亞書',66,'roots'],['耶利米書',52,'roots'],['耶利米哀歌',5,'roots'],
  ['以西結書',48,'roots'],['但以理書',12,'roots'],['何西阿書',14,'roots'],['約珥書',3,'roots'],['阿摩司書',9,'roots'],
  ['俄巴底亞書',1,'roots'],['約拿書',4,'roots'],['彌迦書',7,'roots'],['那鴻書',3,'roots'],['哈巴谷書',3,'roots'],
  ['西番雅書',3,'roots'],['哈該書',2,'roots'],['撒迦利亞書',14,'roots'],['瑪拉基書',4,'roots'],
  ['約伯記',42,'fruit'],['詩篇',150,'fruit'],['箴言',31,'fruit'],['傳道書',12,'fruit'],['雅歌',8,'fruit'],
  ['馬太福音',28,'branches'],['馬可福音',16,'branches'],['路加福音',24,'branches'],['約翰福音',21,'branches'],
  ['使徒行傳',28,'branches'],['羅馬書',16,'branches'],['哥林多前書',16,'branches'],['哥林多後書',13,'branches'],
  ['加拉太書',6,'branches'],['以弗所書',6,'branches'],['腓立比書',4,'branches'],['歌羅西書',4,'branches'],
  ['帖撒羅尼迦前書',5,'branches'],['帖撒羅尼迦後書',3,'branches'],['提摩太前書',6,'branches'],['提摩太後書',4,'branches'],
  ['提多書',3,'branches'],['腓利門書',1,'branches'],['希伯來書',13,'branches'],['雅各書',5,'branches'],
  ['彼得前書',5,'branches'],['彼得後書',3,'branches'],['約翰一書',5,'branches'],['約翰二書',1,'branches'],
  ['約翰三書',1,'branches'],['猶大書',1,'branches'],['啟示錄',22,'branches']
];

export const BIBLE_BOOKS_2027 = rows.map(([name, chapters, track], index) => ({
  bookId: `book-${String(index + 1).padStart(2, '0')}`,
  canonicalOrder: index + 1,
  traditionalChineseName: name,
  testament: index < 39 ? 'old' : 'new',
  category: track === 'fruit' ? 'poetry-wisdom' : index < 39 ? 'history-prophecy' : 'new-testament',
  track,
  chapterCount: chapters
}));

export const BIBLE_PLAN_EXPECTATIONS_2027 = Object.freeze({ books: 66, chapters: 1189, days: 365, tracks: { roots: 686, branches: 260, fruit: 243 } });

export function auditBibleMetadata(books = BIBLE_BOOKS_2027) {
  const tracks = Object.fromEntries(Object.keys(BIBLE_PLAN_EXPECTATIONS_2027.tracks).map((key) => [key, 0]));
  for (const book of books) tracks[book.track] += book.chapterCount;
  const chapters = Object.values(tracks).reduce((sum, count) => sum + count, 0);
  return { books: books.length, chapters, tracks, valid: books.length === 66 && chapters === 1189 && tracks.roots === 686 && tracks.branches === 260 && tracks.fruit === 243 };
}
