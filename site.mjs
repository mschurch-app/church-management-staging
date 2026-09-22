import {mountMemberPanel} from './member-welcome-ui.mjs';
const values=new URLSearchParams(location.search).getAll('church');
if(values.length===1&&['M+','SHiNE'].includes(values[0])){
 document.querySelector('#church-label').textContent=(values[0]==='M+'?'M+':'火樂')+' · 測試資料';mountMemberPanel();
}else if(values.length){document.querySelector('#church-label').textContent='堂會連結無效，請使用上方按鈕重新選擇。';}
