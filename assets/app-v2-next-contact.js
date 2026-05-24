(function(){
  function esc(s){return String(s??'').replace(/[&<>\"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]));}
  function dateInput(v){try{if(!v)return'';const d=new Date(v);if(Number.isNaN(d.getTime()))return'';return d.toISOString().slice(0,10)}catch(e){return''}}
  function dt(v){try{return v?new Date(v).toLocaleString('ru-RU'):'—'}catch(e){return v||'—'}}
  function isDue(v){if(!v)return false;const d=new Date(v);const end=new Date();end.setHours(23,59,59,999);return d<=end}
  function addStyles(){
    if(document.getElementById('nextContactCss'))return;
    const s=document.createElement('style');
    s.id='nextContactCss';
    s.textContent='.next-contact-box{margin-top:10px;padding:10px;border-radius:14px;background:#f8fafc;border:1px solid #e5e7eb}.next-contact-box.due{background:#fff7d6;border-color:#fde68a}.next-contact-box label{display:block;font-size:12px;color:#667085;font-weight:900;margin-bottom:6px}.next-contact-row{display:flex;gap:8px;flex-wrap:wrap}.next-contact-row input{min-height:36px;border:1px solid #e5e7eb;border-radius:10px;padding:6px 9px}.next-contact-row button{min-height:36px;border-radius:999px;border:1px solid #e5e7eb;background:#fff;font-weight:900;padding:7px 10px;cursor:pointer}.next-contact-note{font-size:12px;font-weight:800;color:#92400e;margin-top:6px}.next-contact-panel{margin-top:14px;padding:14px;border-radius:18px;background:#fff7d6;border:1px solid #fde68a}.next-contact-panel h3{margin:0 0 8px;font-size:18px}.next-contact-panel .item{padding:8px 0;border-top:1px solid #fde68a}.next-contact-panel .item:first-of-type{border-top:0}@media(max-width:560px){.next-contact-row{display:grid;grid-template-columns:1fr}.next-contact-row button{width:100%}}';
    document.head.appendChild(s);
  }
  function getLeads(){try{return Array.isArray(state.leads)?state.leads:[]}catch(e){return[]}}
  function renderBox(lead){
    const v=dateInput(lead.next_contact_at);
    const due=isDue(lead.next_contact_at);
    return '<div class="next-contact-box '+(due?'due':'')+'" data-next-contact-box="1"><label>Следующий контакт</label><div class="next-contact-row"><input type="date" value="'+esc(v)+'" data-next-date><button data-next-save>Сохранить</button><button data-next-tomorrow>Завтра</button><button data-next-clear>Очистить</button></div>'+(lead.next_contact_at?'<div class="next-contact-note">'+(due?'Нужно связаться сегодня / просрочено':'Запланировано')+': '+esc(dt(lead.next_contact_at))+'</div>':'')+'</div>';
  }
  function injectBoxes(){
    addStyles();
    const leads=getLeads();
    document.querySelectorAll('.lead-card[data-id]').forEach(card=>{
      if(card.querySelector('[data-next-contact-box]'))return;
      const lead=leads.find(l=>l.id===card.dataset.id);
      if(!lead)return;
      const target=card.firstElementChild;
      if(target)target.insertAdjacentHTML('beforeend',renderBox(lead));
    });
    renderDuePanel();
  }
  function renderDuePanel(){
    const todayList=document.getElementById('todayList');
    if(!todayList)return;
    let panel=document.getElementById('nextContactPanel');
    const due=getLeads().filter(l=>l.next_contact_at&&isDue(l.next_contact_at)&&!['Создан заказ','Отказ','Спам'].includes(l.status||''));
    if(!due.length){if(panel)panel.remove();return;}
    if(!panel){panel=document.createElement('div');panel.id='nextContactPanel';panel.className='next-contact-panel';todayList.parentElement.appendChild(panel);}
    panel.innerHTML='<h3>Кому связаться сегодня</h3>'+due.slice(0,8).map(l=>'<div class="item"><b>'+esc(l.name||'Без имени')+'</b><div class="meta">'+esc(l.phone||'телефон не указан')+' • '+esc(l.service||'услуга не указана')+' • '+esc(dt(l.next_contact_at))+'</div></div>').join('');
  }
  function tomorrowIso(){const d=new Date();d.setDate(d.getDate()+1);return d.toISOString().slice(0,10)+'T09:00:00+03:00'}
  async function saveNext(card,value){
    const id=card&&card.dataset.id;
    if(!id)return;
    const patch={next_contact_at:value||null};
    try{await updateLead(id,patch);toast(value?'Следующий контакт сохранён':'Следующий контакт очищен');setTimeout(injectBoxes,150)}catch(e){alert(e.message||e)}
  }
  function bindClicks(){
    document.addEventListener('click',function(e){
      const card=e.target.closest&&e.target.closest('.lead-card[data-id]');
      if(!card)return;
      if(e.target.matches('[data-next-save]')){const v=card.querySelector('[data-next-date]')?.value||'';saveNext(card,v?v+'T09:00:00+03:00':null)}
      if(e.target.matches('[data-next-tomorrow]'))saveNext(card,tomorrowIso());
      if(e.target.matches('[data-next-clear]'))saveNext(card,null);
    });
  }
  function patchRenderers(){
    try{const oldRenderLeads=renderLeads;renderLeads=function(){oldRenderLeads();setTimeout(injectBoxes,0)}}catch(e){}
    try{const oldRenderDashboard=renderDashboard;renderDashboard=function(){oldRenderDashboard();setTimeout(renderDuePanel,0)}}catch(e){}
  }
  document.addEventListener('DOMContentLoaded',function(){addStyles();bindClicks();patchRenderers();setTimeout(injectBoxes,800);setInterval(injectBoxes,3000)});
})();
