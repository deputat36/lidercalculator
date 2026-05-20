(function(){
function e(id){return document.getElementById(id)}
function h(s){return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]})}
function note(x){var t=e('toast');if(t){t.textContent=x;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2200)}}
var clients=[];
function ensure(){
  if(e('calcClientPicker'))return;
  var name=e('calcClientName');
  if(!name)return;
  var card=name.closest('.card');
  if(!card)return;
  var box=document.createElement('div');
  box.id='calcClientPicker';
  box.className='notice';
  box.innerHTML='<b>Клиент из базы</b><div class="form-grid compact" style="margin-top:8px"><label class="wide">Выбрать клиента<select id="calcClientSelect"><option value="">Не выбран</option></select></label></div>';
  card.insertBefore(box,card.querySelector('.form-grid'));
  e('calcClientSelect').onchange=function(){apply(this.value)};
}
async function load(){
  ensure();
  if(!window.db||!e('calcClientSelect'))return [];
  var r=await window.db.from('leader_clients').select('id,name,phone,source,comment').order('created_at',{ascending:false}).limit(300);
  if(r.error)throw new Error(r.error.message);
  clients=r.data||[];
  var sel=e('calcClientSelect');
  sel.innerHTML='<option value="">Не выбран</option>'+clients.map(function(c){return '<option value="'+h(c.id)+'">'+h((c.name||'Без имени')+' • '+(c.phone||'без телефона'))+'</option>'}).join('');
  return clients;
}
function apply(id){
  var c=clients.find(function(x){return x.id===id});
  if(!c)return;
  if(e('calcClientName'))e('calcClientName').value=c.name||'';
  if(e('calcClientPhone'))e('calcClientPhone').value=c.phone||'';
  if(e('calcSource')&&c.source){
    var ok=[].slice.call(e('calcSource').options).some(function(o){return o.value===c.source||o.text===c.source});
    e('calcSource').value=ok?c.source:'Другое';
  }
  if(e('calcComment')&&!e('calcComment').value&&c.comment)e('calcComment').value=c.comment;
  note('Клиент подставлен в расчёт');
}
function bind(){ensure();document.querySelectorAll('[data-page="calc"]').forEach(function(n){if(!n.dataset.clientPicker){n.dataset.clientPicker='1';n.addEventListener('click',function(){setTimeout(function(){load().catch(function(){})},250)})}})}
window.LeaderV2ClientPicker={load:load,apply:apply};
if(document.readyState==='loading'){document.addEventListener('DOMContentLoaded',function(){bind();setTimeout(function(){load().catch(function(){})},1200)})}else{bind();setTimeout(function(){load().catch(function(){})},800)}
})();