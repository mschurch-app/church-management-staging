import {createClient} from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {notifyChurchDual} from '../_shared/dual-notification.mjs';

const TZ='Asia/Taipei';
const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store'};
function json(status:number,body:unknown){return new Response(JSON.stringify(body),{status,headers});}
function db(){
  const url=Deno.env.get('SUPABASE_URL')||'';
  const key=Deno.env.get('SUPABASE_SECRET_KEY')||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(!url||!key)throw new Error('supabase_config_missing');
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
}
function taipeiDate(offsetDays=0){
  const now=new Date(Date.now()+offsetDays*86400000);
  return new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
function rangeUtc(date:string){
  const start=new Date(date+'T00:00:00+08:00');
  return [start.toISOString(),new Date(start.getTime()+86400000).toISOString()];
}
async function summarize(lines:string[]){
  const prompt=`你是 M+ 青年教會的行政整理助理。請用繁體中文整理今天 LINE 群組討論。
規則：
1. 僅根據對話內容，不猜測。
2. 忽略寒暄、貼圖通知、重複內容與邀請碼。
3. 用以下固定格式：
【今日討論摘要】
一、重點事項
• 每個項目獨立一行
二、已決定事項
• 每個項目獨立一行
三、待辦事項（列出負責人與期限；未提及就寫「未指定」）
• 事項｜負責人：姓名或未指定｜期限：日期或未指定
四、需要追蹤
• 每個項目獨立一行
五、重要日期與提醒
• 每個項目獨立一行
4. 每個標題必須獨立一行，每個項目都以「• 」開頭，禁止把多個項目合併成一段。
5. 若某區沒有內容，下一行寫「• 無」。
6. 控制在 3500 個中文字以內。

今日對話：
${lines.join('\\n')}`;
  const geminiKey=Deno.env.get('GEMINI_API_KEY')||'';
  if(geminiKey){
    const model=Deno.env.get('GEMINI_SUMMARY_MODEL')||'gemini-3.5-flash-lite';
    const response=await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,{
      method:'POST',signal:AbortSignal.timeout(60000),
      headers:{'x-goog-api-key':geminiKey,'content-type':'application/json'},
      body:JSON.stringify({
        contents:[{role:'user',parts:[{text:prompt}]}],
        generationConfig:{maxOutputTokens:1800,temperature:0.2}
      })
    });
    if(!response.ok)throw new Error('gemini_http_'+response.status);
    const data=await response.json();
    const text=String(data?.candidates?.[0]?.content?.parts?.map((p:any)=>p.text||'').join('')||'').trim();
    if(!text)throw new Error('gemini_empty');
    return {text,model};
  }
  const key=Deno.env.get('OPENAI_API_KEY')||'';
  if(!key)throw new Error('ai_key_missing');
  const model=Deno.env.get('OPENAI_SUMMARY_MODEL')||'gpt-4.1-mini';
  const response=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',signal:AbortSignal.timeout(60000),
    headers:{authorization:'Bearer '+key,'content-type':'application/json'},
    body:JSON.stringify({model,input:prompt,max_output_tokens:1800})
  });
  if(!response.ok)throw new Error('openai_http_'+response.status);
  const data=await response.json();
  const text=String(data.output_text||'').trim() ||
    (Array.isArray(data.output)?data.output.flatMap((o:any)=>o.content||[]).map((c:any)=>c.text||'').join('').trim():'');
  if(!text)throw new Error('openai_empty');
  return {text,model};
}
Deno.serve(async request=>{
  if(request.method!=='POST')return json(405,{ok:false,error:'method_not_allowed'});
  const secret=request.headers.get('x-cron-secret')||'';
  if(!secret)return json(401,{ok:false,error:'unauthorized'});
  const client=db();
  const allowed=await client.rpc('pastoral_validate_care_cron_secret',{p_secret:secret});
  if(allowed.error||allowed.data!==true)return json(401,{ok:false,error:'unauthorized'});
  const setting=await client.from('line_group_summary_settings').select('group_id,enabled').eq('id',true).maybeSingle();
  const groupId=setting.data?.enabled?String(setting.data.group_id||''):'';
  if(setting.error||!groupId)return json(503,{ok:false,error:'group_not_configured'});
  let requestedDate='',manualSummary='';
  try {
    const body=await request.json();
    requestedDate=String(body?.summary_date||'');
    manualSummary=String(body?.manual_summary||'').trim().slice(0,4500);
  } catch {}
  const validDate=requestedDate.length===10 && requestedDate[4]==='-' && requestedDate[7]==='-' &&
    !Number.isNaN(Date.parse(requestedDate+'T00:00:00+08:00'));
  const date=validDate?requestedDate:taipeiDate();
  const [start,end]=rangeUtc(date);
  const found=await client.from('line_group_discussion_messages')
    .select('sender_name,message_type,message_text,occurred_at')
    .eq('group_id',groupId).gte('occurred_at',start).lt('occurred_at',end)
    .order('occurred_at',{ascending:true}).limit(1000);
  if(found.error)return json(503,{ok:false,error:'message_query_failed'});
  const rows=found.data||[];
  let report='',model:string|null=null,status='generated';
  try{
    if(rows.length===0){
      report=`【M+ 青年教會群組日報｜${date}】\n今日沒有可整理的文字討論。`;
      status='no_messages';
    }else{
      const lines=rows.map((r:any)=>{
        const time=new Intl.DateTimeFormat('zh-TW',{timeZone:TZ,hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(r.occurred_at));
        const content=r.message_type==='text'?String(r.message_text||'').slice(0,800):`[${r.message_type}]`;
        return `[${time}] ${r.sender_name||'群組成員'}：${content}`;
      });
      if(manualSummary){
        report=`【M+ 青年教會群組日報｜${date}｜測試】\n\n${manualSummary}`;
        model='chatgpt-manual-test';
      }else{
        const result=await summarize(lines);
        report=`【M+ 青年教會群組日報｜${date}】\n\n${result.text}`;
        model=result.model;
      }
    }
    const delivered=await notifyChurchDual({db:client,churchId:'M+',eventKey:'line_group_summary',sourceKey:`line-group-summary:${date}`,title:`M+ 群組討論日報｜${date}`,body:report.slice(0,900),url:'/admin-dashboard.html?church=M%2B',lineGroupId:groupId,lineMessage:report.slice(0,4900),permission:'notification_settings'});
    if(delivered.status!=='sent')throw new Error(`app:${delivered.appStatus};line:${delivered.lineStatus}`);
    status='sent';
    await client.from('line_group_daily_summaries').upsert({
      group_id:groupId,summary_date:date,message_count:rows.length,summary_text:report,
      model,status,sent_at:new Date().toISOString(),error_code:null,updated_at:new Date().toISOString()
    },{onConflict:'group_id,summary_date'});
    return json(200,{ok:true,date,message_count:rows.length,status,channels:delivered});
  }catch(error){
    const code=error instanceof Error?error.message:'unknown';
    await client.from('line_group_daily_summaries').upsert({
      group_id:groupId,summary_date:date,message_count:rows.length,
      summary_text:report||'摘要產生失敗',model,status:'failed',error_code:code,updated_at:new Date().toISOString()
    },{onConflict:'group_id,summary_date'});
    return json(503,{ok:false,error:code});
  }
});
