(function(){
if(!window.db||!window.db.functions||window.db.functions.__leaderGuard)return;
var original=window.db.functions.invoke.bind(window.db.functions);
async function session(){var s=await window.db.auth.getSession();if(!s.data||!s.data.session)throw new Error('Сначала войдите в CRM')}
function text(v){return String(v==null?'':v).trim()}
async function leadList(){await session();var r=await window.db.from('leader_leads').select('id,created_at,name,phone,source,service,message,status,lead_quality,estimated_amount,next_contact_at,page_url,utm_source,utm_medium,utm_campaign,utm_content,utm_term,payload,budget,city,converted_order_id,converted_client_id').order('created_at',{ascending:false}).limit(300);if(r.error)throw r.error;return{data:{ok:true,leads:r.data||[]},error:null}}
async function leadCreate(body){await session();var p={name:text(body.name),phone:text(body.phone),source:text(body.source||'Ручная заявка'),service:text(body.service),message:text(body.message),status:text(body.status||'Новая'),budget:body.budget?Number(body.budget):null,city:text(body.city),page_url:text(body.page_url||'manual://crm-v2')};if(!p.name&&!p.phone&&!p.message)throw new Error('Заполните имя, телефон или комментарий');var r=await window.db.from('leader_leads').insert(p).select('*').single();if(r.error)throw r.error;return{data:{ok:true,lead:r.data},error:null}}
async function leadUpdate(body){await session();var id=text(body.id);if(!id)throw new Error('Не указан id заявки');var p={};['status','lead_quality','message','reject_reason'].forEach(function(k){if(k in body)p[k]=text(body[k])});if('estimated_amount' in body)p.estimated_amount=body.estimated_amount?Number(body.estimated_amount):null;if('next_contact_at' in body)p.next_contact_at=text(body.next_contact_at)||null;var r=await window.db.from('leader_leads').update(p).eq('id',id).select('*').single();if(r.error)throw r.error;return{data:{ok:true,lead:r.data},error:null}}
async function orderList(){await session();var r=await window.db.from('leader_orders').select('id,order_number,created_at,project_name,client_name,client_phone,status,payment_status,deadline,client_total,profit,balance,source,layout_status,layout_comment,production_status,data').order('created_at',{ascending:false}).limit(100);if(r.error)throw r.error;return{data:{ok:true,orders:r.data||[]},error:null}}
async function orderUpdate(body){await session();var id=body&&body.id;if(!id)throw new Error('Не указан id заказа');var p={};['status','payment_status','layout_status','production_status','layout_comment','deadline'].forEach(function(k){if(k in body)p[k]=body[k]||null});var r=await window.db.from('leader_orders').update(p).eq('id',id).select('*').single();if(r.error)throw r.error;return{data:{ok:true,order:r.data},error:null}}
window.db.functions.invoke=async function(name,opts){
  var body=(opts&&opts.body)||{};
  try{
    if(name==='leader-crm-leads'){
      var a=body.action||'list';
      if(a==='list'||a==='dashboard')return await leadList();
      if(a==='create')return await leadCreate(body);
      if(a==='update')return await leadUpdate(body);
    }
    if(name==='leader-crm-orders'){
      if((body.action||'list')==='list')return await orderList();
      if(body.action==='update')return await orderUpdate(body);
    }
  }catch(e){return{data:null,error:e}}
  return original(name,opts);
};
window.db.functions.__leaderGuard=true;
})();