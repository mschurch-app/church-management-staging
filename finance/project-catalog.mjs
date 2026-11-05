export const classificationLabel=r=>r.classification_snapshot?`${r.classification_snapshot.projectName}／${r.classification_snapshot.ministryName}`:r.project||'';
export function mountProjectPicker(form,catalog,record=null){
 const project=form.elements.projectId,ministry=form.elements.ministryItemId,hidden=form.elements.project;
 const option=(value,label)=>Object.assign(document.createElement('option'),{value,textContent:label});
 const snap=record?.classification_snapshot,oldId=record?.ministry_item_id||'',oldProject=snap?.projectId;
 project.replaceChildren(option('','請選擇專案'));ministry.replaceChildren(option('','請先選擇專案'));
 for(const p of catalog.projects.filter(p=>p.active||p.id===oldProject))project.append(option(p.id,p.name+(p.active?'':'（已停用）')));
 const legacy=!!record&&!oldId;
 if(legacy){project.append(option('legacy',`原紀錄：${record.project}`));project.value='legacy';}
 else project.value=oldProject||'';
 const update=()=>{const p=catalog.projects.find(p=>p.id===project.value);ministry.replaceChildren(option('','請選擇事工項目'));ministry.required=project.value!=='legacy';if(project.value==='legacy'){ministry.append(option('legacy','保留原紀錄'));ministry.value='legacy';hidden.value=record.project;return;}hidden.value=p?.name||'';for(const m of catalog.ministries.filter(m=>m.project_id===project.value&&(m.active||m.id===oldId)))ministry.append(option(m.id,m.name+(m.active?'':'（已停用）')));};
 project.onchange=update;update();if(oldId)ministry.value=oldId;
}
