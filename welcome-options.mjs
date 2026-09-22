export const GROUPS={gender:'性別',age:'年齡區間',district:'生活區域',source:'認識管道',faith:'信仰近況',feelings:'今天想感受的',interests:'生活興趣'};
export async function getOptions(db,church){
 if(!['M+','SHiNE'].includes(church))throw Error('堂會連結不正確。');
 const {data,error}=await db.from('welcome_form_options').select('options,version').eq('church_id',church).single();
 if(error||!data)throw Error('無法載入表單選項，請稍後重試。');
 return data;
}
