export const MESSAGE_TEMPLATES=Object.freeze([
 {key:'blank',title:'自行撰寫',body:''},
 {key:'welcome',title:'新朋友歡迎',body:'{name}你好，歡迎你來到 M+！\n\n很高興有機會認識你。最近過得怎麼樣？如果有什麼想聊聊的，或需要我們為你禱告的事，隨時可以回覆這則訊息。\n\n期待有機會再見面，也慢慢認識你。願你這一週平安。'},
 {key:'care',title:'近況關心',body:'{name}你好，想跟你問聲好。\n\n最近生活還順利嗎？有沒有什麼讓你開心，或讓你掛心的事？如果你願意，我們很樂意聽你說，也為你禱告。\n\n不用急著回覆，方便的時候聊聊就好。'},
 {key:'sunday',title:'主日聚會邀請',body:'{name}你好，這個主日歡迎你一起來 M+ 聚會。\n\n一起敬拜、聽信息，聚會後也可以留下來聊聊天、認識大家。若你想先了解聚會時間或交通方式，回覆我們就好。\n\n期待見到你！'},
 {key:'thanksgiving',title:'感恩節聚會與餐敘',body:'{name}你好，想邀請你參加我們的感恩節主日，也一起享用感恩節大餐。\n\n坐下來吃頓飯、聊聊天，認識一些朋友，一起分享生活裡值得感謝的事。輕鬆來就好，我們很期待見到你。\n\n請先確認本次活動日期、時間與餐敘安排，再把這一行換成實際資訊。'},
 {key:'birthday',title:'生日祝福',body:'{name}，生日快樂！\n\n願你在新的一歲，心裡有平安，生活裡有可以分享喜悅、也能彼此扶持的人。願神帶領你的每一天。\n\n很高興能與你一起走這段路，祝福你！'},
 {key:'followup',title:'聚會後關懷',body:'{name}你好，謝謝你來參加聚會。\n\n不知道你對聚會的感受如何？有沒有想進一步了解，或希望我們協助的地方？都很歡迎跟我們說。\n\n也期待下次再見，祝福你這一週平安。'}
]);
export function templateMessage(key,name){const template=MESSAGE_TEMPLATES.find(t=>t.key===key);if(!template)throw Error('請選擇有效的情境範本。');return template.body.replaceAll('{name}',String(name||'').trim()||'你好');}
export function validMessage(value){return typeof value==='string'&&value.trim().length>0&&value.length<=5000&&!/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value);}
