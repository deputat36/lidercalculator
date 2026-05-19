// Role based interface guard for RA Lider CRM.
(function(){
  const DEFAULTS={
    owner:{label:'Владелец',allowed_tabs:['workdesk','calc','leads','clients','orders','production','finance','catalog','templates','tasks','analytics','exports','useradmin','users','settings','diagnostics'],hide_finance:false,hide_costs:false,can_manage_users:true,can_edit_catalog:true,can_manage_settings:true},
    admin:{label:'Администратор',allowed_tabs:['workdesk','calc','leads','clients','orders','production','finance','catalog','templates','tasks','analytics','exports','useradmin','users','settings','diagnostics'],hide_finance:false,hide_costs:false,can_manage_users:true,can_edit_catalog:true,can_manage_settings:true},
    manager:{label:'Менеджер',allowed_tabs:['workdesk','calc','leads','clients','orders','production','templates','tasks','exports','diagnostics'],hide_finance:true,hide_costs:false,can_manage_users:false,can_edit_catalog:false,can_manage_settings:false},
    designer:{label:'Дизайнер',allowed_tabs:['workdesk','production','tasks','templates','diagnostics'],hide_finance:true,hide_costs:true,can_manage_users:false,can_edit_catalog:false,can_manage_settings:false},
    installer:{label:'Монтажник',allowed_tabs:['workdesk','production','tasks','diagnostics'],hide_finance:true,hide_costs:true,can_manage_users:false,can_edit_catalog:false,can_manage_settings:false},
    contractor:{label:'Подрядчик',allowed_tabs:['production','tasks','diagnostics'],hide_finance:true,hide_costs:true,can_manage_users:false,can_edit_catalog:false,can_manage_settings:false},
    accountant:{label:'Финансы',allowed_tabs:['workdesk','orders','finance','clients','exports','diagnostics'],hide_finance:false,hide_costs:false,can_manage_users:false,can_edit_catalog:false,can_manage_settings:false}
  };
  function read(key, fallback){ try { return JSON.parse(localStorage.getItem('lc_'+key)) || fallback; } catch(e){ return fallback; } }
  function write(key, value){ localStorage.setItem('lc_'+key, JSON.stringify(value)); }
  function db(){ return window.db || null; }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]}) }
  function profile(){ return read('current_profile', null); }
  function currentPerm(){ var p=profile(); var r=(p&&p.role)||'guest'; return Object.assign({role:r,label:r,allowed_tabs:['diagnostics'],hide_finance:true,hide_costs:true}, DEFAULTS[r]||{}); }
  async function loadProfile(){
    var client=db(); if(!client) return null;
    var u=await client.auth.getUser(); if(!u.data.user) return null;
    var pr=await client.from('leader_user_profiles').select('*').eq('user_id',u.data.user.id).single();
    if(!pr.error && pr.data){ write('current_profile', pr.data); return pr.data; }
    return null;
  }
  async function loadPerms(){
    var client=db(); if(!client) return;
    try{
      var r=await client.from('leader_role_permissions').select('*');
      if(!r.error && r.data){
        var map={};
        r.data.forEach(function(x){ map[x.role]={label:x.label,allowed_tabs:x.allowed_tabs||[],hide_finance:x.hide_finance,hide_costs:x.hide_costs,can_edit_catalog:x.can_edit_catalog,can_manage_users:x.can_manage_users,can_manage_settings:x.can_manage_settings}; });
        write('role_permissions', map);
        Object.assign(DEFAULTS,map);
      }
    }catch(e){ console.warn(e); }
  }
  function addRoleBar(){
    var wrap=document.querySelector('.wrap'); if(!wrap || document.getElementById('rgRolebar')) return;
    var p=profile(), perm=currentPerm();
    var div=document.createElement('div'); div.id='rgRolebar'; div.className='rg-rolebar no-print';
    div.innerHTML='<div><b>Роль: '+esc(perm.label||perm.role)+'</b><span> • '+esc((p&&p.email)||'вход не выполнен')+'</span></div><button onclick="LeaderRoleGuard.apply()">Обновить доступы</button>';
    var tabs=document.querySelector('.tabs');
    wrap.insertBefore(div, tabs || wrap.firstChild);
  }
  function updateRoleBar(){ var el=document.getElementById('rgRolebar'); if(el) el.remove(); addRoleBar(); }
  function protectTabs(){
    var perm=currentPerm(); var allowed=perm.allowed_tabs||[];
    document.querySelectorAll('.tab').forEach(function(t){
      var id=t.dataset.tab; if(!id) return;
      if(allowed.indexOf(id)===-1) t.classList.add('rg-hidden'); else t.classList.remove('rg-hidden');
    });
    document.querySelectorAll('.page').forEach(function(p){
      var id=p.id; if(!id) return;
      if(allowed.indexOf(id)===-1){
        p.classList.add('rg-hidden');
        if(!p.querySelector('.rg-denied')) p.insertAdjacentHTML('afterbegin','<div class="rg-denied">Нет доступа к этому разделу для вашей роли.</div>');
      } else p.classList.remove('rg-hidden');
    });
    var active=document.querySelector('.tab.active');
    if(active && active.classList.contains('rg-hidden')){
      var first=[].slice.call(document.querySelectorAll('.tab')).find(function(x){return !x.classList.contains('rg-hidden')});
      if(first) first.click();
    }
  }
  function protectData(){
    var perm=currentPerm();
    document.body.classList.toggle('rg-no-cost', !!perm.hide_costs);
    document.body.classList.toggle('rg-no-finance', !!perm.hide_finance);
    if(perm.hide_finance){
      ['finance','analytics'].forEach(function(id){ var tab=document.querySelector('[data-tab="'+id+'"]'); if(tab) tab.classList.add('rg-hidden'); });
      document.querySelectorAll('#sumProfit,#sumCost,#sumBefore').forEach(function(x){ x.closest('.sum') ? x.closest('.sum').classList.add('rg-hidden') : x.classList.add('rg-hidden'); });
      document.querySelectorAll('button').forEach(function(b){ var tx=(b.textContent||'').toLowerCase(); if(tx.includes('для себя')||tx.includes('внутрен')) b.classList.add('rg-hidden'); });
    }
    if(perm.hide_costs){
      document.querySelectorAll('#sumCost,#sumProfit,#price,#mk').forEach(function(x){ x.classList.add('rg-hidden'); });
      document.querySelectorAll('label').forEach(function(l){ var tx=(l.textContent||'').toLowerCase(); if(tx.includes('нацен')||tx.includes('цена')){ var n=l.parentElement; if(n) n.classList.add('rg-hidden'); }});
    }
    if(!perm.can_manage_users){
      var ua=document.querySelector('[data-tab="useradmin"]'); if(ua) ua.classList.add('rg-hidden');
      var us=document.querySelector('[data-tab="users"]'); if(us) us.classList.add('rg-hidden');
    }
    if(!perm.can_edit_catalog){
      document.querySelectorAll('#catalog button').forEach(function(b){ var tx=(b.textContent||'').toLowerCase(); if(tx.includes('добавить')||tx.includes('отправить')||tx.includes('удал')) b.classList.add('rg-hidden'); });
    }
    if(!perm.can_manage_settings){ var st=document.querySelector('[data-tab="settings"]'); if(st) st.classList.add('rg-hidden'); }
  }
  function warnIfInactive(){
    var p=profile();
    if(!p || p.is_active!==false) return;
    if(!document.getElementById('rgInactiveWarn')){
      var w=document.createElement('div'); w.id='rgInactiveWarn'; w.className='rg-warning'; w.textContent='Ваш пользователь отключён. Доступ к данным может быть ограничен.';
      var wrap=document.querySelector('.wrap'); if(wrap) wrap.insertBefore(w, wrap.firstChild);
    }
  }
  window.LeaderRoleGuard={
    apply:function(){ updateRoleBar(); protectTabs(); protectData(); warnIfInactive(); },
    refresh:async function(){ await loadProfile(); await loadPerms(); this.apply(); },
    current:currentPerm
  };
  document.addEventListener('DOMContentLoaded',function(){ setTimeout(function(){ LeaderRoleGuard.refresh(); },1500); setInterval(function(){ LeaderRoleGuard.apply(); },2500); });
})();
