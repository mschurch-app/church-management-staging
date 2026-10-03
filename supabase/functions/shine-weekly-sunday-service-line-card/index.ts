import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.102.0';
import {notifyChurchApp} from '../_shared/app-push-notification.mjs';
import {notificationRoute} from '../_shared/dual-notification.mjs';
import {createServiceSchedulePng,uploadServiceSchedulePng} from '../_shared/service-schedule-image.mjs';

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});

function taipeiParts(now = new Date()) {
  const values = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
    weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  return Object.fromEntries(values.map(part => [part.type, part.value]));
}

function nextSundayTaipei(now = new Date()) {
  const p = taipeiParts(now);
  const today = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day)));
  const offset = (7 - today.getUTCDay()) % 7 || 7;
  today.setUTCDate(today.getUTCDate() + offset);
  return today.toISOString().slice(0, 10);
}

function normalizedDate(value: unknown): string | null {
  const text = String(value || '').trim().replaceAll('/', '-');
  const m = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!m) return null;
  return [m[1], m[2].padStart(2,'0'), m[3].padStart(2,'0')].join('-');
}

function serviceCell(label: string, value: string) {
  return {
    type: 'box', layout: 'vertical', flex: 1, paddingAll: '12px',
    backgroundColor: '#FBF5F8', cornerRadius: '12px', spacing: 'sm',
    contents: [
      { type: 'text', text: label, size: 'xs', color: '#9A718D', weight: 'bold', wrap: true },
      { type: 'text', text: value, size: 'sm', color: '#45263F', weight: 'bold', wrap: true },
    ],
  };
}

function flexCard(title: string, dateText: string, eventText: string, entries: Array<[string,string]>, page: string, total: string) {
  const rows = [];
  for (let i = 0; i < entries.length; i += 2) {
    const left = entries[i];
    const right = entries[i + 1];
    rows.push({
      type: 'box', layout: 'horizontal', spacing: 'md', margin: i ? 'md' : 'none',
      contents: [
        serviceCell(left[0], left[1]),
        right ? serviceCell(right[0], right[1]) : { type: 'box', layout: 'vertical', flex: 1, contents: [] },
      ],
    });
  }
  return {
    type: 'flex',
    altText: `主日服事表｜${dateText}｜${title}`,
    contents: {
      type: 'bubble', size: 'giga',
      header: {
        type: 'box', layout: 'vertical', paddingAll: '20px', backgroundColor: '#542748',
        contents: [
          {
            type: 'box', layout: 'horizontal', alignItems: 'center',
            contents: [
              { type: 'text', text: '火樂 SHiNE Church', size: 'md', color: '#FFFFFF', weight: 'bold', flex: 1 },
            ],
          },
          { type: 'text', text: '主日服事表', size: 'xxl', color: '#FFFFFF', weight: 'bold', margin: 'lg' },
          {
            type: 'box', layout: 'horizontal', margin: 'md', paddingAll: '10px',
            backgroundColor: '#76395F', cornerRadius: '12px',
            contents: [
              { type: 'text', text: dateText, size: 'sm', color: '#FFD29A', weight: 'bold', flex: 3, wrap: true },
              { type: 'text', text: eventText || '主日崇拜', size: 'sm', color: '#FFFFFF', align: 'end', flex: 2, wrap: true },
            ],
          },
        ],
      },
      body: {
        type: 'box', layout: 'vertical', paddingAll: '18px',
        backgroundColor: '#FFFEFB',
        contents: rows,
      },
      footer: {
        type: 'box', layout: 'horizontal', paddingAll: '14px', backgroundColor: '#F7EDF4',
        contents: [
          { type: 'text', text: '在愛裡同心服事', size: 'xs', color: '#79566E', weight: 'bold', flex: 4, wrap: true },
          { type: 'text', text: page + '/' + total, size: 'xs', color: '#9A718D', align: 'end', flex: 1 },
        ],
      },
      styles: { footer: { separator: false } },
    },
  };
}

function serviceDetails(row: Record<string,unknown>, sunday: string) {
  const date = new Date(sunday + 'T00:00:00Z').toLocaleDateString('zh-TW', {
    timeZone: 'UTC', year: 'numeric', month: 'long', day: 'numeric', weekday: 'long',
  });
  const roles: Array<[string,string]> = [
    ['講員', 'speaker'], ['敬拜帶領', 'worship_leader'], ['司會', 'presider'], ['禱告', 'prayer'],
    ['歌手', 'singers'], ['鍵盤', 'keyboard'], ['吉他', 'guitar'], ['貝斯', 'bass'], ['鼓手', 'drums'],
    ['音控', 'tech_sound'], ['投影', 'tech_video'], ['招待一', 'usher1'], ['招待二', 'usher2'],
    ['兒童主日學', 'sunday_school'], ['兒主助教', 'sunday_school_ta'], ['交通', 'transport'],
    ['插花', 'flower'], ['聖餐', 'communion'], ['餅', 'communion_bread'], ['杯', 'communion_cup'],
    ['愛宴', 'love_feast'], ['週三禱告', 'wed_prayer'],
  ];
  const entries = roles.flatMap(([label,key]) => {
    const value = String(row[key] ?? '').trim();
    return value && value !== '－' && value !== '-' ? [[label,value] as [string,string]] : [];
  });
  return {date,entries,eventText:String(row.event || '主日崇拜')};
}

Deno.serve(async request => {
  if (request.method !== 'POST') return json({ok:false,error:'method_not_allowed'},405);
  const cronSecret = request.headers.get('x-cron-secret') || '';
  const url = Deno.env.get('SUPABASE_URL') || '';
  const key = Deno.env.get('SUPABASE_SECRET_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const lineToken = Deno.env.get('LINE_SHINE_MESSAGING_CHANNEL_ACCESS_TOKEN') || '';
  if (!cronSecret || !url || !key) return json({ok:false,error:'sender_not_configured',missing:{cronSecret:!cronSecret,supabaseUrl:!url,supabaseAdminKey:!key}},503);

  const db = createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:valid,error:authError} = await db.rpc('validate_weekly_service_line_cron_secret',{candidate:cronSecret});
  if (authError || valid !== true) return json({ok:false,error:'unauthorized'},401);
  const route=await notificationRoute(db,'SHiNE','sunday_service_card');
  const {data:groupId,error:groupError} = route.line?await db.rpc('get_shine_weekly_service_line_group_id'):{data:'',error:null};
  if (route.line && (groupError || typeof groupId !== 'string' || !groupId || !lineToken)) return json({ok:false,error:'line_not_configured'},409);

  const payload = await request.json().catch(() => ({}));
  const manualTest = payload?.source === 'manual-test';
  const diagnostic = payload?.source === 'diagnostic';
  const local = taipeiParts();
  if (!manualTest && !diagnostic && (local.weekday !== 'Thu' || Number(local.hour) !== 9 || Number(local.minute) > 10)) {
    return json({ok:false,error:'outside_scheduled_window'},403);
  }

  if (diagnostic) {
    if(!lineToken||!groupId)return json({ok:false,error:'line_not_configured'},409);
    const botResponse = await fetch('https://api.line.me/v2/bot/info',{headers:{authorization:`Bearer ${lineToken}`},signal:AbortSignal.timeout(10000)});
    const botDetails = await botResponse.json().catch(() => ({}));
    const groupResponse = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`,{headers:{authorization:`Bearer ${lineToken}`},signal:AbortSignal.timeout(10000)});
    return json({ok:botResponse.ok && groupResponse.ok,botStatus:botResponse.status,bot:botResponse.ok?{displayName:botDetails.displayName,userId:botDetails.userId}:null,groupStatus:groupResponse.status});
  }

  const sunday = nextSundayTaipei();
  const {data:rows,error:queryError} = await db.from('service_schedules').select('*').eq('church_id','SHiNE');
  if (queryError) return json({ok:false,error:'schedule_unavailable'},503);
  const row = (rows || []).find(item => normalizedDate(item.service_date) === sunday);
  if (!row) return json({ok:false,error:'no_schedule_for_upcoming_sunday',sunday},404);

  const service = serviceDetails(row,sunday);
  if (!service.entries.length) return json({ok:false,error:'schedule_has_no_assignments',sunday},422);
  const {data:claimed,error:claimError} = await db.rpc('claim_shine_weekly_service_line_delivery',{target_sunday:sunday});
  if (claimError || claimed !== true) return json({ok:true,skipped:'already_sent_or_processing',sunday});

  const app=route.app?await notifyChurchApp({db,churchId:'SHiNE',permission:'schedules',eventKey:'sunday_service_card',sourceKey:`shine-service-card:${sunday}`,title:`火樂主日服事表｜${sunday}`,body:'本週服事安排已更新，請開啟 App 查看。',url:'/schedules.html?church=SHiNE'}):{status:'disabled',sent:0,recipients:0};
  if(!route.line){
    const succeeded=['sent','stored'].includes(app.status);
    await db.rpc('finish_shine_weekly_service_line_delivery',{target_sunday:sunday,succeeded,delivery_details:`App ${app.status}; LINE disabled`});
    return json({ok:succeeded,sunday,cardCount:messages.length,channels:{app:app.status,line:'disabled'}},succeeded?200:503);
  }

  try {
    const png=await createServiceSchedulePng({churchName:'火樂教會',mark:'SHiNE',dateText:service.date,eventText:service.eventText,entries:service.entries,accent:'#D85E62'});
    const imageUrl=await uploadServiceSchedulePng(db,`service-schedules/shine/${sunday}.png`,png);
    const messages=[{type:'image',originalContentUrl:imageUrl,previewImageUrl:imageUrl},{type:'text',text:`火樂主日服事表｜${service.date}\n可長按圖片儲存或直接轉傳。`}];
    const botInfo = await fetch('https://api.line.me/v2/bot/info',{headers:{authorization:`Bearer ${lineToken}`},signal:AbortSignal.timeout(10000)});
    if (!botInfo.ok) {
      const details = await botInfo.text();
      await db.rpc('finish_shine_weekly_service_line_delivery',{target_sunday:sunday,succeeded:false,delivery_details:`LINE bot info ${botInfo.status}: ${details.slice(0,250)}`});
      return json({ok:false,error:'line_bot_auth_failed',status:botInfo.status},502);
    }
    const groupInfo = await fetch(`https://api.line.me/v2/bot/group/${encodeURIComponent(groupId)}/summary`,{headers:{authorization:`Bearer ${lineToken}`},signal:AbortSignal.timeout(10000)});
    if (!groupInfo.ok) {
      const details = await groupInfo.text();
      await db.rpc('finish_shine_weekly_service_line_delivery',{target_sunday:sunday,succeeded:false,delivery_details:`LINE group summary ${groupInfo.status}: ${details.slice(0,250)}`});
      return json({ok:false,error:'line_group_not_available',status:groupInfo.status},502);
    }
    const validation = await fetch('https://api.line.me/v2/bot/message/validate/push',{
      method:'POST',signal:AbortSignal.timeout(10000),
      headers:{authorization:`Bearer ${lineToken}`,'content-type':'application/json'},
      body:JSON.stringify({to:groupId,messages}),
    });
    if (!validation.ok) {
      const details = await validation.text();
      await db.rpc('finish_shine_weekly_service_line_delivery',{target_sunday:sunday,succeeded:false,delivery_details:`LINE image validation ${validation.status}: ${details.slice(0,250)}`});
      return json({ok:false,error:'line_card_invalid',status:validation.status},502);
    }
    const response = await fetch('https://api.line.me/v2/bot/message/push',{
      method:'POST', signal:AbortSignal.timeout(10000),
      headers:{authorization:`Bearer ${lineToken}`,'content-type':'application/json'},
      body:JSON.stringify({to:groupId,messages}),
    });
    const details = await response.text();
    if (!response.ok) {
      await db.rpc('finish_shine_weekly_service_line_delivery',{target_sunday:sunday,succeeded:false,delivery_details:`LINE ${response.status}: ${details.slice(0,250)}`});
      console.error('LINE schedule push failed',response.status);
      return json({ok:false,error:'line_delivery_failed'},502);
    }
    await db.rpc('finish_shine_weekly_service_line_delivery',{target_sunday:sunday,succeeded:true,delivery_details:`App ${app.status}; sent LINE PNG service schedule image`});
    return json({ok:true,sunday,cardCount:messages.length,channels:{app:app.status,line:'sent'}});
  } catch (error) {
    await db.rpc('finish_shine_weekly_service_line_delivery',{target_sunday:sunday,succeeded:false,delivery_details:'LINE request failed'});
    console.error('LINE schedule push failed',error instanceof Error ? error.message : 'unknown');
    return json({ok:false,error:'line_delivery_failed'},502);
  }
});
