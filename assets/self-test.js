(function(){
  function el(id){return document.getElementById(id)}
  function toast(s){var t=el('toast'); if(t){t.textContent=s;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2600)}else alert(s)}
  function addBtn(){
    var host=document.querySelector('.top .row.no-print')||document.querySelector('#auth .row .row');
    if(!host||el('crmSelfTestBtn'))return;
    var b=document.createElement('button');
    b.id='crmSelfTestBtn';
    b.textContent='Тест CRM';
    b.onclick=run;
    host.appendChild(b);
  }
  function row(name,ok,detail){return '<tr><td>'+name+'</td><td class="'+(ok?'good':'bad')+'">'+(ok?'OK':'Ошибка')+'</td><td>'+String(detail||'')+'</td></tr>'}
  async function run(){
    var out=[];
    try{
      if(!window.db) throw new Error('Supabase client не найден');
      out.push(row('Supabase client',true,'подключён'));
      var session=await window.db.auth.getSession();
      var user=session&&session.data&&session.data.session?session.data.session.user:null;
      out.push(row('Авторизация',!!user,user?user.email:'вход не выполнен'));
      if(!user) throw new Error('Сначала войдите в CRM');
      var p=await window.db.from('leader_user_profiles').select('role,is_active,email').eq('user_id',user.id).maybeSingle();
      out.push(row('Профиль пользователя',!!p.data,p.data?(p.data.email+' / '+p.data.role+' / active='+p.data.is_active):(p.error?p.error.message:'не найден')));
      var fn=await window.db.functions.invoke('leader-crm-leads',{body:{action:'list'}});
      var leads=(fn.data&&fn.data.leads)||[];
      out.push(row('Edge Function leader-crm-leads',!fn.error,fn.error?fn.error.message:'заявок получено: '+leads.length));
      var testLead=leads.find(function(x){return x.name==='Тест CRM 2'});
      out.push(row('Тестовая заявка Тест CRM 2',!!testLead,testLead?('найдена, статус: '+testLead.status):'не найдена'));
      if(window.LeaderSiteLeads&&window.LeaderSiteLeads.load){
        await window.LeaderSiteLeads.load();
        out.push(row('Вывод заявок в таблицу',true,'модуль LeaderSiteLeads.load() выполнен'));
      }else{
        out.push(row('Вывод заявок в таблицу',false,'модуль LeaderSiteLeads не найден'));
      }
    }catch(e){out.push(row('Итог',false,e.message))}
    show(out.join(''));
  }
  function show(html){
    var old=el('crmSelfTestBox'); if(old)old.remove();
    var box=document.createElement('div');
    box.id='crmSelfTestBox';
    box.className='card no-print';
    box.style.margin='12px 0';
    box.innerHTML='<div class="row" style="justify-content:space-between"><b>Самотест CRM</b><button onclick="document.getElementById(\'crmSelfTestBox\').remove()">Закрыть</button></div><div class="table" style="margin-top:10px"><table><thead><tr><th>Проверка</th><th>Статус</th><th>Подробности</th></tr></thead><tbody>'+html+'</tbody></table></div>';
    var wrap=document.querySelector('.wrap');
    if(wrap)wrap.insertBefore(box,wrap.children[1]||wrap.firstChild); else document.body.prepend(box);
    toast('Самотест CRM выполнен');
  }
  window.LeaderSelfTest={run:run};
  document.addEventListener('DOMContentLoaded',function(){setTimeout(addBtn,700);setInterval(addBtn,2500)});
})();