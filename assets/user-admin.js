// User administration module for RA Lider CRM.
(function(){
  const ROLES=[
    ['owner','Владелец'],['admin','Администратор'],['manager','Менеджер'],['designer','Дизайнер'],['installer','Монтажник'],['contractor','Подрядчик'],['accountant','Финансы']
  ];
  function read(key, fallback){ try { return JSON.parse(localStorage.getItem('lc_'+key)) || fallback; } catch(e){ return fallback; } }
  function write(key, value){ localStorage.setItem('lc_'+key, JSON.stringify(value)); }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]}) }
  function fmt(v){ if(!v) return '—'; try{return new Date(v).toLocaleString('ru-RU')}catch(e){return v} }
  function toast(msg){ var t=document.getElementById('toast'); if(!t){ alert(msg); return; } t.textContent=msg; t.classList.add('show'); setTimeout(function(){t.classList.remove('show')},2300); }
  function db(){ return window.db || null; }
  function roleLabel(r){ var x=ROLES.find(function(v){return v[0]===r}); return x?x[1]:r; }
  function roleOptions(current){ return ROLES.map(function(r){return '<option value="'+r[0]+'" '+(r[0]===current?'selected':'')+'>'+r[1]+'</option>';}).join(''); }
  function isAdmin(){ var p=read('current_profile', null); return p && ['owner','admin'].includes(p.role); }
  async function getProfile(){
    var client=db(); if(!client) return null;
    var u=await client.auth.getUser(); if(!u.data.user) return null;
    var r=await client.from('leader_user_profiles').select('*').eq('user_id',u.data.user.id).single();
    if(r.error) return null;
    write('current_profile', r.data);
    return r.data;
  }
  function addTab(){
    if(document.querySelector('[data-tab="useradmin"]')) return;
    var tabs=document.querySelector('.tabs'), wrap=document.querySelector('.wrap'); if(!tabs||!wrap) return;
    var tab=document.createElement('div'); tab.className='tab'; tab.dataset.tab='useradmin'; tab.textContent='Доступы'; tabs.appendChild(tab);
    var sec=document.createElement('section'); sec.id='useradmin'; sec.className='page hidden';
    sec.innerHTML='<div class="card"><div class="row" style="justify-content:space-between"><div><b>Пользователи и доступы</b><div class="muted">Создание аккаунтов выполняется в Supabase Authentication. Здесь назначаются роли и активность.</div></div><div class="row"><button onclick="LeaderUserAdmin.refresh()">Обновить</button><button onclick="LeaderUserAdmin.showCreateHelp()" class="primary">Как создать аккаунт</button></div></div><div id="uaAccessWarn" style="margin-top:10px"></div><div class="ua-grid" style="margin-top:12px"><div class="ua-card" style="grid-column:span 8"><b>Сотрудники</b><div id="uaUsers" class="ua-list" style="margin-top:10px"></div></div><div class="ua-card" style="grid-column:span 4"><b>Роли</b><div class="ua-table-wrap" style="margin-top:10px"><table class="ua-table"><thead><tr><th>Роль</th><th>Доступ</th></tr></thead><tbody><tr><td>owner</td><td>Всё, включая владельцев</td></tr><tr><td>admin</td><td>Почти всё, кроме владельца</td></tr><tr><td>manager</td><td>Заявки, клиенты, заказы, КП</td></tr><tr><td>designer</td><td>Макеты и производство</td></tr><tr><td>installer</td><td>Монтаж и выдача</td></tr><tr><td>contractor</td><td>Производственные ТЗ</td></tr><tr><td>accountant</td><td>Финансы и оплаты</td></tr></tbody></table></div><p class="muted">Ограничения интерфейса будут усиливаться поэтапно. Сейчас главное — управлять активностью и ролями.</p></div></div></div>';
    wrap.appendChild(sec);
    tab.onclick=async function(){document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active')});document.querySelectorAll('.page').forEach(function(x){x.classList.add('hidden')});tab.classList.add('active');sec.classList.remove('hidden');await LeaderUserAdmin.refresh();};
  }
  function ensureModal(){
    if(document.getElementById('uaBackdrop')) return;
    document.body.insertAdjacentHTML('beforeend','<div id="uaBackdrop" class="ua-backdrop"><div class="ua-modal"><div class="ua-head"><div><div id="uaTitle" class="ua-title">Пользователь</div><div id="uaSub" class="ua-meta"></div></div><button class="ua-close" onclick="LeaderUserAdmin.close()">Закрыть</button></div><div id="uaBody"></div></div></div>');
  }
  function userCard(u,i){
    var cls=u.role==='owner'?'ua-owner':'';
    return '<div class="ua-user"><b>'+esc(u.full_name||u.email||'Пользователь')+'</b><div class="ua-meta">'+esc(u.email||'')+' • последний вход: '+fmt(u.last_seen_at)+'</div><div><span class="ua-pill '+cls+'">'+esc(roleLabel(u.role))+'</span> <span class="ua-pill '+(u.is_active?'ua-active':'ua-off')+'">'+(u.is_active?'активен':'отключён')+'</span> '+(u.position?'<span class="ua-pill">'+esc(u.position)+'</span>':'')+'</div><div class="ua-actions"><button onclick="LeaderUserAdmin.open('+i+')">Редактировать</button><button onclick="LeaderUserAdmin.toggleActive('+i+')">'+(u.is_active?'Отключить':'Включить')+'</button></div></div>';
  }
  async function loadUsers(){
    var client=db(); if(!client) return [];
    var r=await client.from('leader_user_profiles').select('*').order('created_at',{ascending:false});
    if(r.error){ alert(r.error.message); return []; }
    write('users', r.data||[]);
    return r.data||[];
  }
  async function updateUser(u){
    var client=db(); if(!client) return;
    var r=await client.rpc('leader_update_user_profile',{
      p_user_id:u.user_id,
      p_full_name:u.full_name||null,
      p_role:u.role||null,
      p_is_active:!!u.is_active,
      p_phone:u.phone||null,
      p_position:u.position||null,
      p_notes:u.notes||null,
      p_permissions:u.permissions||{}
    });
    if(r.error) throw new Error(r.error.message);
  }
  window.LeaderUserAdmin={
    init:async function(){ ensureModal(); addTab(); try{ var p=await getProfile(); if(window.db) window.db.rpc('leader_touch_last_seen').then(function(){}); if(p) write('current_profile', p); }catch(e){ console.warn(e); } },
    refresh:async function(){
      var warn=document.getElementById('uaAccessWarn');
      var p=await getProfile();
      if(warn && (!p || !['owner','admin'].includes(p.role))){ warn.innerHTML='<div class="ua-empty">Эта вкладка предназначена для owner/admin. У вашей роли нет прав управления пользователями.</div>'; }
      else if(warn){ warn.innerHTML=''; }
      var box=document.getElementById('uaUsers'); if(!box) return;
      if(!p || !['owner','admin'].includes(p.role)){ box.innerHTML='<div class="ua-empty">Недостаточно прав</div>'; return; }
      var list=await loadUsers();
      box.innerHTML=list.length?list.map(userCard).join(''):'<div class="ua-empty">Пользователей пока нет</div>';
    },
    open:function(i){
      var list=read('users', []), u=list[i]; if(!u) return;
      ensureModal();
      document.getElementById('uaTitle').textContent=u.full_name||u.email||'Пользователь';
      document.getElementById('uaSub').textContent=u.user_id;
      document.getElementById('uaBody').innerHTML='<div class="ua-form"><div style="grid-column:span 6"><label>ФИО</label><input id="uaFullName" value="'+esc(u.full_name||'')+'"></div><div style="grid-column:span 6"><label>Email</label><input disabled value="'+esc(u.email||'')+'"></div><div style="grid-column:span 3"><label>Роль</label><select id="uaRole">'+roleOptions(u.role)+'</select></div><div style="grid-column:span 3"><label>Активен</label><select id="uaActive"><option value="true" '+(u.is_active?'selected':'')+'>Да</option><option value="false" '+(!u.is_active?'selected':'')+'>Нет</option></select></div><div style="grid-column:span 3"><label>Телефон</label><input id="uaPhone" value="'+esc(u.phone||'')+'"></div><div style="grid-column:span 3"><label>Должность</label><input id="uaPosition" value="'+esc(u.position||'')+'"></div><div style="grid-column:span 12"><label>Заметки</label><textarea id="uaNotes" rows="3">'+esc(u.notes||'')+'</textarea></div></div><div class="ua-actions"><button class="primary" onclick="LeaderUserAdmin.save('+i+')">Сохранить</button><button onclick="LeaderUserAdmin.close()">Закрыть</button></div>';
      document.getElementById('uaBackdrop').classList.add('show');
    },
    close:function(){ var b=document.getElementById('uaBackdrop'); if(b) b.classList.remove('show'); },
    save:async function(i){
      var list=read('users', []), u=list[i]; if(!u) return;
      u.full_name=document.getElementById('uaFullName').value;
      u.role=document.getElementById('uaRole').value;
      u.is_active=document.getElementById('uaActive').value==='true';
      u.phone=document.getElementById('uaPhone').value;
      u.position=document.getElementById('uaPosition').value;
      u.notes=document.getElementById('uaNotes').value;
      try{ await updateUser(u); toast('Пользователь сохранён'); this.close(); await this.refresh(); }
      catch(e){ alert(e.message); }
    },
    toggleActive:async function(i){ var list=read('users', []), u=list[i]; if(!u) return; u.is_active=!u.is_active; try{ await updateUser(u); toast(u.is_active?'Пользователь включён':'Пользователь отключён'); await this.refresh(); }catch(e){ alert(e.message); } },
    showCreateHelp:function(){
      ensureModal();
      document.getElementById('uaTitle').textContent='Как создать аккаунт';
      document.getElementById('uaSub').textContent='Supabase Authentication → Users';
      document.getElementById('uaBody').innerHTML='<div class="ua-card"><p><b>Шаг 1.</b> Открой Supabase → Authentication → Users → Add user.</p><p><b>Шаг 2.</b> Укажи email сотрудника и временный пароль. Включи Auto Confirm User.</p><p><b>Шаг 3.</b> Сотрудник должен один раз войти на сайт CRM.</p><p><b>Шаг 4.</b> Вернись сюда, нажми «Обновить» и назначь роль.</p><p class="muted">Пароли не храним в интерфейсе CRM и не пересылаем в чат. Лучше отправлять сотруднику временный пароль лично и попросить сменить его позже через Supabase reset password.</p></div>';
      document.getElementById('uaBackdrop').classList.add('show');
    }
  };
  document.addEventListener('DOMContentLoaded',function(){ setTimeout(function(){LeaderUserAdmin.init();},1200); });
})();
