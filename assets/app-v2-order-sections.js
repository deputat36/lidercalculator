(function(){
  function e(id){return document.getElementById(id)}
  function h(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function css(){
    if(e('orderSectionsCss'))return;
    var s=document.createElement('style');
    s.id='orderSectionsCss';
    s.textContent='.order-compact-nav{display:flex;gap:7px;flex-wrap:wrap;margin:10px 0;padding:8px;border:1px solid var(--line);border-radius:14px;background:#f9fafb}.order-compact-nav button{border:1px solid var(--line);background:#fff;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900;cursor:pointer}.order-compact-nav button.active{background:#111827;color:#fff}.order-section-wrap{border:1px solid var(--line);border-radius:14px;background:#fff;margin:10px 0;overflow:hidden}.order-section-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;background:#f9fafb;cursor:pointer}.order-section-title{font-weight:900;font-size:14px}.order-section-sub{color:#6b7280;font-size:12px;margin-top:2px;line-height:1.35}.order-section-toggle{border:1px solid var(--line);background:#fff;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;cursor:pointer}.order-section-body{padding:0 10px 10px}.order-section-wrap.collapsed .order-section-body{display:none}.order-section-wrap.collapsed .order-section-toggle::after{content:'Развернуть'}.order-section-wrap:not(.collapsed) .order-section-toggle::after{content:'Свернуть'}.order-detail.order-sections-ready>.order-progress-box,.order-detail.order-sections-ready>.order-finance-box,.order-detail.order-sections-ready>.order-timeline-box{margin:0;border:0;border-radius:0}.order-section-body>.order-progress-box,.order-section-body>.order-finance-box,.order-section-body>.order-timeline-box{margin:0;border:0;border-radius:0;padding:0}.order-section-body>.order-progress-box .order-progress-actions,.order-section-body>.order-finance-box .order-finance-actions,.order-section-body>.order-timeline-box .order-timeline-actions{margin-bottom:6px}.order-main-mini{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:8px 0}.order-main-mini>div{background:#f9fafb;border:1px solid var(--line);border-radius:12px;padding:9px}.order-main-mini span{display:block;color:#6b7280;font-size:11px;font-weight:900;margin-bottom:4px}.order-main-mini b{font-size:13px}@media(max-width:760px){.order-main-mini{grid-template-columns:1fr 1fr}.order-compact-nav button{flex:1}}@media(max-width:480px){.order-main-mini{grid-template-columns:1fr}}';
    document.head.appendChild(s);
  }
  function findOrderData(card){
    try{
      var txt=(card.querySelector('.work-title,.order-title,b')||{}).textContent||'Заказ';
      var status=(card.querySelector('.badge')||{}).textContent||'';
      var progress=card.querySelector('.order-progress-title');
      var next=card.querySelector('.order-progress-sub');
      var balance='—';
      var fin=card.querySelector('.order-finance-grid .bad b');
      if(fin)balance=fin.textContent||'—';
      return {title:txt,status:status,stage:progress?progress.textContent.replace('Этап заказа:','').trim():'—',next:next?next.textContent.replace('Следующий шаг:','').trim():'—',balance:balance};
    }catch(x){return {title:'Заказ',status:'',stage:'—',next:'—',balance:'—'}}
  }
  function createMainSection(detail,card){
    if(detail.querySelector('.order-section-main'))return;
    var data=findOrderData(card);
    var wrap=document.createElement('div');
    wrap.className='order-section-wrap order-section-main';
    wrap.dataset.section='main';
    wrap.innerHTML='<div class="order-section-head"><div><div class="order-section-title">Главное по заказу</div><div class="order-section-sub">Этап, следующий шаг и быстрые действия.</div></div><button class="order-section-toggle" type="button"></button></div><div class="order-section-body"><div class="order-main-mini"><div><span>Статус</span><b>'+h(data.status||'—')+'</b></div><div><span>Этап</span><b>'+h(data.stage||'—')+'</b></div><div><span>Остаток</span><b>'+h(data.balance||'—')+'</b></div><div><span>Следующий шаг</span><b>'+h(data.next||'—')+'</b></div></div></div>';
    var actions=detail.querySelector('.order-detail-actions');
    if(actions){wrap.querySelector('.order-section-body').appendChild(actions)}
    detail.insertBefore(wrap,detail.firstChild);
  }
  function wrapBox(detail,selector,key,title,sub,collapsedDefault){
    var box=detail.querySelector(selector);
    if(!box||box.closest('.order-section-wrap'))return;
    var wrap=document.createElement('div');
    wrap.className='order-section-wrap order-section-'+key+(collapsedDefault?' collapsed':'');
    wrap.dataset.section=key;
    wrap.innerHTML='<div class="order-section-head"><div><div class="order-section-title">'+h(title)+'</div><div class="order-section-sub">'+h(sub)+'</div></div><button class="order-section-toggle" type="button"></button></div><div class="order-section-body"></div>';
    box.parentNode.insertBefore(wrap,box);
    wrap.querySelector('.order-section-body').appendChild(box);
  }
  function ensureNav(detail){
    if(detail.querySelector('.order-compact-nav'))return;
    var nav=document.createElement('div');
    nav.className='order-compact-nav';
    nav.innerHTML='<button data-order-section-jump="main">Главное</button><button data-order-section-jump="progress">Прогресс</button><button data-order-section-jump="finance">Финансы</button><button data-order-section-jump="timeline">История</button><button data-order-section-action="collapse">Свернуть всё</button><button data-order-section-action="expand">Развернуть всё</button>';
    detail.insertBefore(nav,detail.firstChild);
  }
  function enhanceCard(card){
    var detail=card.querySelector('.order-detail');
    if(!detail)return;
    css();
    ensureNav(detail);
    createMainSection(detail,card);
    wrapBox(detail,'.order-progress-box','progress','Прогресс и следующий шаг','Автоматический этап заказа, процент готовности и ближайшее действие.',false);
    wrapBox(detail,'.order-finance-box','finance','Финансы','Оплаты, расходы, остаток, прибыль и предупреждения.',false);
    wrapBox(detail,'.order-timeline-box','timeline','История','Все события заказа: оплаты, статусы, дизайн, производство и монтаж.',true);
    detail.classList.add('order-sections-ready');
  }
  function enhance(){document.querySelectorAll('#ordersList .work-item[data-order]').forEach(enhanceCard)}
  function jump(detail,key){
    var sec=detail.querySelector('.order-section-'+key);
    if(!sec)return;
    sec.classList.remove('collapsed');
    sec.scrollIntoView({behavior:'smooth',block:'start'});
  }
  function boot(){
    css();
    var list=e('ordersList');
    if(list&&window.MutationObserver&&!list.dataset.sectionsObserver){
      var mo=new MutationObserver(function(){enhance()});
      mo.observe(list,{childList:true,subtree:true});
      list.dataset.sectionsObserver='1';
    }
    document.addEventListener('click',function(ev){
      var head=ev.target.closest('.order-section-head');
      if(head){var sec=head.closest('.order-section-wrap');if(sec)sec.classList.toggle('collapsed');return}
      var jumpBtn=ev.target.closest('[data-order-section-jump]');
      if(jumpBtn){var detail=jumpBtn.closest('.order-detail');if(detail)jump(detail,jumpBtn.dataset.orderSectionJump);return}
      var action=ev.target.closest('[data-order-section-action]');
      if(action){var d=action.closest('.order-detail');if(!d)return;d.querySelectorAll('.order-section-wrap').forEach(function(s){s.classList.toggle('collapsed',action.dataset.orderSectionAction==='collapse')});return}
    });
    setTimeout(enhance,1200);
  }
  window.LeaderV2OrderSections={enhance:enhance};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
