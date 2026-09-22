const values=new URLSearchParams(location.search).getAll('church'),church=values.length===1&&['M+','SHiNE'].includes(values[0])?values[0]:null;
const form=document.querySelector('#registration'),button=document.querySelector('#submit'),status=document.querySelector('#status');
let pending=null,busy=false,completed=false;
if(church){document.querySelector('#title').textContent=(church==='M+'?'M+':'火樂')+'新朋友登記';button.disabled=false;}
else status.textContent='請先選擇上方堂會入口。';
form.addEventListener('submit',async event=>{
 event.preventDefault();if(!church||busy||completed)return;
 if(!pending)pending={kind:'newcomer',church,request_id:crypto.randomUUID(),...Object.fromEntries(new FormData(form))};
 busy=true;for(const input of form.elements)input.disabled=true;
 status.textContent='正在送出…';
 try{
  const response=await fetch('https://aqanuwilmvdtlzuqlrau.supabase.co/functions/v1/newcomer-register',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'omit',cache:'no-store',body:JSON.stringify(pending),signal:AbortSignal.timeout(15000)});
  if(response.status===400){pending=null;for(const input of form.elements)input.disabled=false;throw new Error('資料格式不正確，請檢查姓名、生日與欄位長度。');}
  if(response.status===429)throw new Error('目前登記較多，請稍後按重試。');
  if(!response.ok||(await response.json()).accepted!==true)throw new Error('尚未確認送出結果，請按重試；不會重複新增同一筆登記。');
  completed=true;status.textContent='登記已收到，謝謝您！';form.hidden=true;
 }catch(error){status.textContent=error.name==='TimeoutError'?'連線逾時，請按重試確認同一筆登記。':error.message;button.textContent=pending?'重試同一筆登記':'送出登記';button.disabled=false;}
 finally{busy=false;}
});
