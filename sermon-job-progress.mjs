import {createMediaProgress} from './weekly-media-progress.mjs?v=20261022-experience1';

const names={media:'影片文字素材',search:'搜尋素材',detail:'讀取素材',guide:'AI 引導問答',outline:'信息大綱',manuscript:'講章',slides:'投影片內容'};
const seconds={media:900,search:30,detail:30,guide:90,outline:180,manuscript:600,slides:180};
// Keep the panel and its timer alive across polling renders. No extra generation requests.
export function createSermonJobProgress(host){
  const entries=new Map();
  let projectId='',request=null;
  function clear(){for(const entry of entries.values())entry.progress.reset();entries.clear();request?.reset();request=null;host.replaceChildren();}
  function sync(id,jobs){
    if(projectId!==id){clear();projectId=id;}
    const current=new Set(jobs.map(job=>job.id));
    for(const [key,entry] of entries)if(!current.has(key)){entry.progress.reset();entry.host.remove();entries.delete(key);}
    for(const job of jobs){
      if(!names[job.kind])continue;
      const pending=['queued','running'].includes(job.status);
      if(!pending&&!entries.has(job.id))continue;
      let entry=entries.get(job.id);
      if(!entry){const node=document.createElement('div');node.dataset.jobProgress=job.id;host.append(node);entry={host:node,progress:createMediaProgress(node),state:null};entries.set(job.id,entry);}
      const label=names[job.kind],progress=entry.progress;
      if(pending){
        if(!progress.active)progress.start({history:'sermon:'+job.kind,workId:job.id,baselineSeconds:seconds[job.kind],recordHistory:false});
        progress.update({label:job.status==='queued'?`${label}已排隊，請稍候…`:`${label}產生中，請稍候…`,description:job.progress|| (job.status==='queued'?'等待本機接續處理；可以繼續編輯，不必重複送出。':'正在等待 AI 回應，完成後會顯示在下方「預備中的工作」。'),estimateProgress:job.status==='running',hint:job.status==='queued'?'等待本機接續，無須重複送出。':'正在查詢同一筆工作；收到完整結果後顯示完成。'});
      }else if(entry.state!==job.status){
        if(job.status==='completed')progress.finish(`${label}已完成，請到下方「預備中的工作」查看結果。`);
        else progress.fail(job.error||`${label}未完成。原有內容保留，請先查看工作紀錄再重試。`);
      }
      entry.state=job.status;
    }
  }
  return {sync,
    begin(kind){request?.reset();host.querySelector('[data-request-progress]')?.remove();const node=document.createElement('div');node.dataset.requestProgress='';host.prepend(node);request=createMediaProgress(node);request.start({history:'sermon:enqueue',recordHistory:false,label:`正在送出${names[kind]||'工作'}，請稍候…`,description:'正在保存輸入並確認工作，請勿重複點擊。',baselineSeconds:20});host.scrollIntoView({block:'nearest',behavior:'instant'});},
    submitted(){request?.reset();host.querySelector('[data-request-progress]')?.remove();request=null;},
    failed(message){request?.fail(message);},
    disconnected(){for(const entry of entries.values())if(['queued','running'].includes(entry.state))entry.progress.pause('暫時無法取得最新狀態，稍後會自動查詢同一筆工作。請勿重新產生。');},
    stop(){for(const entry of entries.values())if(entry.progress.active)entry.progress.pause('已保留工作；返回頁面會接續查詢。');request?.reset();},
  };
}
