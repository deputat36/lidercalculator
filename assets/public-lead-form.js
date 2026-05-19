// Embeddable public lead form for RA Lider website.
// Before embedding on the site, replace __SUPABASE_URL__ and __SUPABASE_PUBLISHABLE_KEY__
// or load them through a small site config file.
(function(){
  const SUPABASE_URL='__SUPABASE_URL__';
  const SUPABASE_KEY='__SUPABASE_PUBLISHABLE_KEY__';
  function qs(){
    const p=new URLSearchParams(location.search);
    return {utm_source:p.get('utm_source')||'',utm_medium:p.get('utm_medium')||'',utm_campaign:p.get('utm_campaign')||'',utm_term:p.get('utm_term')||'',utm_content:p.get('utm_content')||''};
  }
  function sourceGuess(){
    const u=qs();
    if(u.utm_source) return u.utm_source;
    if(document.referrer){ try { return new URL(document.referrer).hostname; } catch(e){} }
    return 'Сайт';
  }
  function mount(target){
    target.innerHTML=`
      <form class="leader-lead-widget" id="leaderLeadForm">
        <h3>Рассчитать рекламу или изготовление</h3>
        <p>Оставьте заявку — уточним задачу, сроки, размеры и подготовим предварительный расчёт.</p>
        <input class="leader-lead-hp" id="llWebsite" tabindex="-1" autocomplete="off">
        <div class="leader-lead-grid">
          <div class="leader-lead-span-6"><label>Имя / организация</label><input id="llName" maxlength="200" placeholder="Например, Алексей / ООО Ромашка"></div>
          <div class="leader-lead-span-6"><label>Телефон</label><input id="llPhone" maxlength="80" placeholder="+7..." required></div>
          <div class="leader-lead-span-6"><label>Услуга</label><select id="llService"><option>Баннер</option><option>Наклейки</option><option>Табличка</option><option>Печать на плёнке</option><option>Перфорированная плёнка</option><option>Плоттерная резка</option><option>Дизайн</option><option>Монтаж</option><option>Комплексная реклама</option><option>Другое</option></select></div>
          <div class="leader-lead-span-3"><label>Ширина, м</label><input id="llWidth" inputmode="decimal" placeholder="3"></div>
          <div class="leader-lead-span-3"><label>Высота, м</label><input id="llHeight" inputmode="decimal" placeholder="1"></div>
          <div class="leader-lead-span-12"><label>Что нужно сделать?</label><textarea id="llMessage" maxlength="2000" rows="4" placeholder="Опишите задачу: размеры, материал, где будет размещаться, нужен ли дизайн/монтаж..."></textarea></div>
          <div class="leader-lead-span-12"><button id="llSubmit" type="submit">Отправить заявку</button></div>
        </div>
        <div class="leader-lead-note">Нажимая кнопку, вы соглашаетесь на обработку данных для связи и расчёта заказа.</div>
        <div id="llStatus" class="leader-lead-status"></div>
      </form>`;
    target.querySelector('form').addEventListener('submit', submit);
  }
  function status(type,msg){ const s=document.getElementById('llStatus'); if(!s) return; s.className='leader-lead-status show '+type; s.textContent=msg; }
  async function submit(e){
    e.preventDefault();
    const btn=document.getElementById('llSubmit');
    const hp=document.getElementById('llWebsite');
    if(hp && hp.value) return;
    const name=document.getElementById('llName').value.trim();
    const phone=document.getElementById('llPhone').value.trim();
    const service=document.getElementById('llService').value;
    const width=document.getElementById('llWidth').value.trim();
    const height=document.getElementById('llHeight').value.trim();
    const message=document.getElementById('llMessage').value.trim();
    if(!phone && !message){ status('err','Укажите телефон или опишите задачу.'); return; }
    if(SUPABASE_URL.indexOf('__')===0 || SUPABASE_KEY.indexOf('__')===0){ status('err','Форма не настроена: не указаны Supabase URL и publishable key.'); return; }
    btn.disabled=true; btn.textContent='Отправляем...';
    const utm=qs();
    const payload={
      name:name,
      phone:phone,
      service:service,
      source:sourceGuess(),
      message:[message,width||height?('Размеры: '+(width||'-')+'×'+(height||'-')+' м'):''].filter(Boolean).join('\n'),
      status:'Новая',
      page_url:location.href,
      utm_source:utm.utm_source,
      utm_medium:utm.utm_medium,
      utm_campaign:utm.utm_campaign,
      utm_term:utm.utm_term,
      utm_content:utm.utm_content,
      payload:{form:'leader_public_lead_form',width:width,height:height,user_agent:navigator.userAgent,referrer:document.referrer||''}
    };
    try{
      const res=await fetch(SUPABASE_URL+'/rest/v1/leader_leads',{method:'POST',headers:{'apikey':SUPABASE_KEY,'Authorization':'Bearer '+SUPABASE_KEY,'Content-Type':'application/json','Prefer':'return=minimal'},body:JSON.stringify(payload)});
      if(!res.ok){ throw new Error('Ошибка '+res.status); }
      status('ok','Заявка отправлена. Мы свяжемся с вами для уточнения деталей.');
      e.target.reset();
    }catch(err){
      console.error(err);
      status('err','Не удалось отправить заявку. Позвоните нам или попробуйте ещё раз.');
    }finally{
      btn.disabled=false; btn.textContent='Отправить заявку';
    }
  }
  function init(){ document.querySelectorAll('#leader-lead-form,[data-leader-lead-form]').forEach(mount); }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
