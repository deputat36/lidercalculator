(function(){
if(!window.db||!window.db.functions||window.db.functions.__leaderGuard)return;
var original=window.db.functions.invoke.bind(window.db.functions);
async function session(){var s=await window.db.auth.getSession();if(!s.data||!s.data.session)throw new Error('Сначала войдите в CRM')}
async function orderList(){await session();var r=await window.db.from('leader_orders').select('id,order_number,created_at,project_name,client_name,client_phone,status,payment_status,deadline,client_total,profit,balance,source,layout_status,layout_comment,production_status,data').order('created_at',{ascending:false}).limit(100);if(r.error)throw r.error;return{data:{ok:true,orders:r.data||[]},error:null}}
async function orderUpdate(body){await session();var id=body&&body.id;if(!id)throw new Error('Не указан id заказа');var p={};['status','payment_status','layout_status','production_status','layout_comment','deadline'].forEach(function(k){if(k in body)p[k]=body[k]||null});var r=await window.db.from('leader_orders').update(p).eq('id',id).select('*').single();if(r.error)throw r.error;return{data:{ok:true,order:r.data},error:null}}
window.db.functions.invoke=async function(name,opts){
  var body=(opts&&opts.body)||{};
  try{
    if(name==='leader-crm-leads'&&window.api){return{data:await window.api(body),error:null}}
    if(name==='leader-crm-orders'){
      if((body.action||'list')==='list')return await orderList();
      if(body.action==='update')return await orderUpdate(body);
    }
  }catch(e){return{data:null,error:e}}
  return original(name,opts);
};
window.db.functions.__leaderGuard=true;
})();