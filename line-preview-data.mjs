export const CHURCHES=Object.freeze({
  'M+':{
    name:'M＋大雅教會',short:'M＋',logo:'assets/brands/mplus-logo-white.png',accent:'#b66a3c',accentSoft:'#f7e7d8',group:'M+大雅教會',
    meeting:{date:'9 月 27 日（日）',time:'上午 10:00',title:'主日崇拜｜在盼望中同行',speaker:'James 牧師',place:'M＋大雅教會主堂',address:'台中市大雅區測試路 100 號'}
  },
  SHiNE:{
    name:'火樂教會',short:'火樂',logo:'assets/brands/shine-logo.png',accent:'#b85c3c',accentSoft:'#f8e3d9',group:'火樂教會',
    meeting:{date:'9 月 27 日（日）',time:'下午 2:00',title:'主日崇拜｜成為祝福的人',speaker:'測試講員',place:'火樂教會主堂',address:'台中市測試區恩典路 20 號'}
  }
});

export const FEATURES=Object.freeze([
  {key:'today',icon:'🌅',title:'給今天的你',subtitle:'為你加油'},
  {key:'help',icon:'🕊️',title:'隨時的幫助',subtitle:'心靈情境卡'},
  {key:'prayer',icon:'🙏',title:'需要禱告時',subtitle:'我們為你禱告'},
  {key:'newcomer',icon:'☕',title:'歡迎新朋友',subtitle:'新朋友加入'},
  {key:'weekly',icon:'⛪',title:'不見不散喔',subtitle:'本週聚會指引'},
  {key:'love',icon:'💌',title:'把愛傳出去',subtitle:'發祝福卡給好友'}
]);

export const DEMO=Object.freeze({
  today:{
    greeting:'親愛的測試家人',reference:'約翰福音 14:1',
    scripture:'你們心裡不要憂愁；你們信神，也當信我。',
    reflection:'耶穌在風暴中對你說：把心安頓下來，定睛在愛你的救主身上，不要憂愁。',
    declaration:'阿們！我領受今天滿滿的恩典與信心。'
  },
  help:{
    moods:[
      {key:'anxious',label:'焦慮不安',icon:'🌧️',reference:'腓立比書 4:6-7',scripture:'應當一無掛慮，只要凡事藉著禱告、祈求和感謝，將你們所要的告訴神。',prayer:'主啊，求你用出人意外的平安保守我的心懷意念。'},
      {key:'tired',label:'疲憊無力',icon:'🌙',reference:'馬太福音 11:28',scripture:'凡勞苦擔重擔的人可以到我這裡來，我就使你們得安息。',prayer:'主啊，我把今天的重擔交給你，讓我的心在你裡面重新得力。'},
      {key:'grateful',label:'充滿感恩',icon:'☀️',reference:'詩篇 136:1',scripture:'你們要稱謝耶和華，因他本為善；他的慈愛永遠長存。',prayer:'謝謝主一路的保守，願我的生命也成為別人的祝福。'}
    ]
  },
  prayer:{
    days:[['日','晨曦盼望'],['一','安靜溪水'],['二','恩典細雨'],['三','聖靈微火'],['四','曠野清泉'],['五','葡萄樹下'],['六','星夜守望']],
    requests:[
      {id:1,name:'惠兒',title:'為新的工作機會',prayers:4,watching:1,halo:1,size:'small',x:9,y:8},
      {id:2,name:'雅園',title:'為家庭和睦',prayers:4,watching:1,halo:2,size:'medium',x:38,y:28},
      {id:3,name:'王張毓',title:'為新工作禱告',prayers:5,watching:2,halo:4,size:'medium',x:65,y:14},
      {id:4,name:'麗珠',title:'事業順利',prayers:3,watching:1,halo:0,size:'small',x:77,y:38},
      {id:5,name:'王靖承',title:'外公的身體',prayers:4,watching:1,halo:3,size:'medium',x:55,y:49},
      {id:6,name:'小喵',title:'為家庭經濟守望',prayers:7,watching:2,halo:5,size:'medium',x:8,y:62},
      {id:7,name:'淑真',title:'為事奉有平安',prayers:5,watching:1,halo:6,size:'small',x:43,y:71},
      {id:8,name:'測試家人',title:'需要智慧與方向',prayers:5,watching:1,halo:7,size:'medium',x:70,y:69}
    ]
  },
  newcomer:{name:'測試新朋友',phone:'0900-000-123',birthday:'1992-09-23',district:'大雅區',source:'朋友邀請',note:'第一次參加聚會，希望認識小組。'},
  love:{
    categories:['為你加油','生日祝福','平安守望'],
    cards:[
      {tone:'work',icon:'💼',title:'努力必有美好收穫',reference:'詩篇 90:17',caption:'願上帝堅立你手所做的工，賜你智慧與力量。'},
      {tone:'rain',icon:'🌧️',title:'低潮中仍有陪伴',reference:'詩篇 34:18',caption:'願你在安靜中重新得力，知道自己從不孤單。'},
      {tone:'family',icon:'🏡',title:'願愛住在你家',reference:'約書亞記 24:15',caption:'願平安、溫柔與喜樂充滿你和所愛的家人。'},
      {tone:'sunrise',icon:'☀️',title:'信心迎向新一天',reference:'耶利米哀歌 3:23',caption:'願新的早晨，帶給你新的力量與盼望。'},
      {tone:'birthday',icon:'🎂',title:'生日蒙福喜樂',reference:'民數記 6:24',caption:'願這嶄新的一歲滿有恩典、健康與喜樂。'},
      {tone:'olive',icon:'🕊️',title:'願平安住在你心裡',reference:'約翰福音 14:27',caption:'把心交託，願從天而來的平安陪伴你。'}
    ]
  }
});
