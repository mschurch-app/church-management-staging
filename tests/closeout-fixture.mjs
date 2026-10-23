import {bootstrap as settingsBootstrap,stubs} from './settings-workspaces-fixture.mjs';
export {stubs};
export const pages=['media-publishing-settings','instagram-publishing-settings','youtube-settings','tree-reading-admin'];
export const bootstrap=settingsBootstrap+`<script>
t.settings=Object.fromEntries(['sermon_analysis_enabled','youtube_captions_enabled','instagram_sermon_enabled','instagram_weekly_reel_enabled','instagram_weekday_reel_enabled','instagram_holiday_reel_enabled'].map(k=>[k,true]));
t.connection={status:'expired',username:'synthetic_church',channel_id:'synthetic-channel',channel_title:'合成教會頻道'};
t.members=[{display_name:'合成同工甲',completed_count:5,on_time_count:4,expected_count:6,last_reading_date:'2026-10-22',reading_start_date:'2026-10-01'},{display_name:'=合成測試名稱',completed_count:0,on_time_count:0,expected_count:6,last_reading_date:null,reading_start_date:'2026-10-01'}];
window.fetch=async(url,options={})=>{
 const endpoint=String(url).split('/').pop();if(!['media-publishing-settings','instagram-publishing','youtube-oauth','tree-reading-admin'].includes(endpoint))throw Error('Unexpected fixture request');
 const body=JSON.parse(options.body||'{}'),read=['get','status'].includes(body.action)||endpoint==='tree-reading-admin';
 if(read)t.reads++;else t.calls.push({endpoint,action:body.action,settings:body.settings});
 await new Promise(r=>setTimeout(r,t.delay));
 if(!t.allowed)return Response.json({ok:false,error:'forbidden'},{status:403});
 if(read&&t.readFail)return Response.json({ok:false},{status:503});
 if(!read&&t.writeFail)return Response.json({ok:false,error:'invalid_token'},{status:400});
 if(t.malformed||(t.unknown&&!read))return Response.json({ok:true});
 if(endpoint==='media-publishing-settings'){if(!read)t.settings=body.settings;return Response.json({ok:true,settings:t.settings,connections:{instagram:t.connection,youtube:t.connection}});}
 if(endpoint==='tree-reading-admin')return Response.json({ok:true,members:t.members,active_challenges:1,challenge_count:2,resolved_challenges:1});
 if(body.action==='connect')t.connection={...t.connection,status:'connected',username:'synthetic_church'};
 if(body.action==='disconnect')t.connection=null;
 if(body.action==='authorize')return Response.json({ok:true,authorizationUrl:t.badUrl?'javascript:alert(1)':'https://accounts.google.com/o/oauth2/v2/auth?fixture=1'});
 return Response.json({ok:true,connection:t.connection});
};
</script>`;
