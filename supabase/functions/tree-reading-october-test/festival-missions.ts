// Curated questions for the accelerated October coworker preview. Answers stay
// on the server; the client receives only the current day's public mission.
export const FESTIVAL_MISSIONS: Record<string, {question:string; choices:string[]; answer:number; action:string; result:string}> = {
 'newyear:1': {question:'詩篇 65:11 說，神以什麼作為年歲的冠冕？',choices:['恩典','財富','名聲'],answer:0,action:'點亮新歲煙火',result:'煙火亮起，帶著感恩迎接新的一年。'},
 'spring:7': {question:'詩篇 65:11 用哪一個詞形容神所賜的一年？',choices:['荒涼','恩典','懼怕'],answer:1,action:'點亮春節祝福燈',result:'祝福燈亮起，願平安進入每個家。'},
 'anniversary:7': {question:'馬太福音 28:20 中，耶穌應許與門徒同在直到何時？',choices:['一天結束','世界的末了','下次聚會'],answer:1,action:'點亮週年感恩燈',result:'感恩燈亮起，記念主一路的同在。'},
 'easter:1': {question:'馬可福音 11:1–11 中，耶穌騎什麼進入耶路撒冷？',choices:['驢駒','馬','駱駝'],answer:0,action:'鋪上迎接主的棕樹枝',result:'道路已預備好，帶著盼望迎接主。'},
 'easter:2': {question:'馬可福音 11:17 中，耶穌稱神的殿是什麼？',choices:['市場','禱告的殿','王宮'],answer:1,action:'為禱告的殿點燈',result:'留一點安靜，讓禱告在心裡亮起。'},
 'easter:3': {question:'馬可福音 12:31 中，耶穌說要怎樣愛人？',choices:['只愛熟悉的人','愛人如己','等別人先愛我'],answer:1,action:'把愛心送進花園',result:'把愛神、愛人的話帶進今天。'},
 'easter:4': {question:'馬可福音 14:10–11 中，是誰去見祭司長商議出賣耶穌？',choices:['彼得','約翰','猶大'],answer:2,action:'點亮省察的微光',result:'在安靜中把心交託給主。'},
 'easter:5': {question:'路加福音 22:19 中，耶穌拿起餅後說要如此行，為的是什麼？',choices:['記念祂','慶祝收成','開始旅程'],answer:0,action:'預備記念主的桌子',result:'安靜記念主的愛，帶著感謝同行。'},
 'easter:6': {question:'路加福音 23:34 中，耶穌為釘祂的人向父求什麼？',choices:['責備','赦免','獎賞'],answer:1,action:'在十字架前安靜片刻',result:'在十字架前停留，思想主的愛。'},
 'easter:7': {question:'路加福音 23:56 中，婦女按誡命在安息日做了什麼？',choices:['休息','趕路','擺設筵席'],answer:0,action:'點亮等候的燭光',result:'在等候裡安息，把明天交託給主。'},
 'easter:8': {question:'馬太福音 28:6 中，天使宣告耶穌怎麼了？',choices:['仍在墳墓','已經復活','去了加利利後才復活'],answer:1,action:'迎接復活晨光',result:'晨光亮起，基督復活的盼望與我們同行。'},
 'pentecost:7': {question:'使徒行傳 2:4 中，門徒被什麼充滿？',choices:['聖靈','恐懼','雨水'],answer:0,action:'點亮聖靈的光',result:'帶著從神而來的勇氣，與家人同行。'},
 'dragon:7': {question:'以賽亞書 40:31 說，等候耶和華的人必重新得到什麼？',choices:['力氣','財富','掌聲'],answer:0,action:'與家人一起划向盼望',result:'同舟向前，彼此扶持。'},
 'moon:7': {question:'歌羅西書 3:14 說，在這一切之外要存著什麼？',choices:['比較','愛心','驕傲'],answer:1,action:'點亮團聚的小燈',result:'願愛讓遠近的家人都感到溫暖。'},
 'light:7': {question:'以弗所書 6:17 中，聖靈的寶劍是什麼？',choices:['神的道','人的怒氣','金屬刀劍'],answer:0,action:'讓經文之光照亮花園',result:'帶著神的話，站立得穩。'},
 'thanksgiving:7': {question:'希伯來書 13:16 提醒我們不可忘記行善和什麼？',choices:['分享','爭競','隱藏'],answer:0,action:'擺上感恩餐桌',result:'把感謝化為分享，溫暖身邊的人。'},
 'christmas:7': {question:'約翰福音 1:14 說，道成了什麼，住在我們中間？',choices:['星光','肉身','宮殿'],answer:1,action:'點亮通往馬槽的星光',result:'記念主來到我們中間，把愛分享出去。'},
};
