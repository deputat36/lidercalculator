(function(){
  var activeCalcId=new URLSearchParams(location.search).get('calc')||localStorage.getItem('leader_v3_active_calc_id')||'';
  var activeOfferId='';
  function q(id){return document.getElementById(id)}
  function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
  function money(v){return Math.round(n(v)).toLocaleString('ru-RU')+' ₽'}
  function esc(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function leadId(){return new URLSearchParams(location.search).get('id')}
  function today(){return new Date().toLocaleDateString('ru-RU')}
  function validDate(){var d=new Date();d.setDate(d.getDate()+3);return d.toISOString().slice(0,10)}
  function showText(text){var box=q('offerText');if(box)box.textContent=text}
  function addCss(){
    if(q('offerV2Css'))return;
    var s=document.createElement('style');s.id='offerV2Css';s.textContent='.offer-v2-warn{margin-top:8px;padding:8px 10px;border-radius:10px;background:#fef3c7;border:1px solid #fde68a;color:#92400e;font-size:12px;line-height:1.4}.offer-v2-bad{background:#fee2e2;border-color:#fecaca;color:#991b1b}.offer-v2-ok{background:#dcfce7;border-color:#bbf7d0;color:#166534}.offer-v2-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.offer-v2-btn{border:1px solid #e5e7eb;background:#fff;border-radius:999px;padding:7px 10px;font-weight:900;font-size:12px;cursor:pointer}.offer-v2-btn.primary{background:#111827;color:#fff}.offer-v2-line{font-size:12px;color:#6b7280;margin-top:4px}';document.head.appendChild(s);
  }
  async function loadCalc(calcId){
    var c=await db.from('leader_lead_calculations').select('*').eq('id',calcId).single();
    if(c.error)throw new Error(c.error.message);
    var it=await db.from('leader_lead_calculation_items').select('*').eq('calculation_id',calcId).order('sort_order');
    if(it.error)throw new Error(it.error.message);
    var lead=await db.from('leader_leads').select('*').eq('id',c.data.lead_id).single();
    if(lead.error)throw new Error(lead.error.message);
    var need=null;
    if(c.data.need_id){var nr=await db.from('leader_lead_needs').select('*').eq('id',c.data.need_id).maybeSingle();need=nr.data||null;}
    return {calc:c.data,items:it.data||[],lead:lead.data,need:need};
  }
  async function latestCalc(){
    var id=leadId();
    if(!id)throw new Error('Не передан id заявки');
    var r=await db.from('leader_lead_calculations').select('*').eq('lead_id',id).order('updated_at',{ascending:false}).limit(1);
    if(r.error)throw new Error(r.error.message);
    if(!r.data||!r.data.length)throw new Error('Сначала создайте расчёт');
    activeCalcId=r.data[0].id;localStorage.setItem('leader_v3_active_calc_id',activeCalcId);
    return activeCalcId;
  }
  function warn(calc,items){
    var warnings=[];
    if(n(calc.client_total)<=0)warnings.push('Сумма клиенту 0 ₽. КП и заказ нельзя отправлять без проверки цены.');
    if(items.some(function(x){return n(x.contractor_price)<=0&&n(x.contractor_sum)<=0&&x.item_type!=='Дизайн'}))warnings.push('У части позиций нулевая себестоимость. Заполните цену подрядчика в номенклатуре.');
    if(n(calc.margin_percent)<20)warnings.push('Маржа ниже 20%. Нужно согласовать цену или наценку.');
    if(n(calc.profit)<0)warnings.push('Расчёт убыточный.');
    var dbw=Array.isArray(calc.warnings)?calc.warnings:[];
    dbw.forEach(function(w){if(w&&warnings.indexOf(w)<0)warnings.push(w)});
    return warnings;
  }
  function publicItems(items){
    return items.filter(function(x){return n(x.client_sum)>0}).map(function(x){return '— '+x.name+(x.qty?' — '+Number(x.qty).toLocaleString('ru-RU')+' '+(x.unit||''):'')+' — '+money(x.client_sum);}).join('\n');
  }
  function needText(need){
    if(!need)return '';
    var d=need.structured_data||{}, lines=[];
    if(need.title)lines.push(need.title);
    if(d.width&&d.height)lines.push('Размер: '+d.width+'×'+d.height+' м');
    if(d.qty)lines.push('Количество: '+d.qty);
    if(d.printQty)lines.push('Тираж: '+d.printQty+' шт.');
    if(d.format)lines.push('Формат: '+d.format);
    if(d.deadlineText)lines.push('Желаемый срок: '+d.deadlineText);
    if(need.need_design)lines.push('Дизайн/подготовка макета: включено или требуется согласование.');
    if(need.need_installation)lines.push('Монтаж/выезд: предусмотрен в расчёте.');
    return lines.join('\n');
  }
  function shortOffer(data){
    var c=data.calc, l=data.lead, items=data.items;
    var lines=[];
    lines.push('Здравствуйте! Подготовил расчёт по вашей заявке.');
    lines.push('');
    lines.push((c.title||'Работы по заявке')+' — '+money(c.client_total)+'.');
    if(items.length){lines.push('');lines.push('В стоимость входит:');items.filter(function(x){return n(x.client_sum)>0}).slice(0,6).forEach(function(x){lines.push('— '+x.name);});}
    lines.push('');
    lines.push('Срок выполнения уточняется после согласования макета и предоплаты.');
    lines.push('Для запуска нужно подтвердить заказ и внести предоплату.');
    return lines.join('\n');
  }
  function fullOffer(data){
    var c=data.calc,l=data.lead,ned=data.need,items=data.items;
    var lines=[];
    lines.push('Коммерческое предложение');
    lines.push('РА «Лидер»');
    lines.push('Дата: '+today());
    lines.push('');
    lines.push('Клиент: '+(l.name||'не указано'));
    if(l.phone)lines.push('Телефон: '+l.phone);
    lines.push('');
    lines.push('Задача клиента');
    lines.push(needText(ned)||c.title||l.service||'Работы по заявке');
    lines.push('');
    lines.push('Состав предложения');
    lines.push(publicItems(items)||'— Работы по согласованной заявке');
    lines.push('');
    lines.push('Итоговая стоимость: '+money(c.client_total));
    lines.push('');
    lines.push('Условия запуска');
    lines.push('1. Подтвердить состав работ и стоимость.');
    lines.push('2. Внести предоплату.');
    lines.push('3. Прислать материалы для макета или согласовать разработку дизайна.');
    lines.push('4. Согласовать финальный макет перед производством.');
    lines.push('');
    lines.push('Срок действия предложения: 3 рабочих дня.');
    lines.push('Срок выполнения зависит от согласования макета, наличия материалов и загрузки производства.');
    return lines.join('\n');
  }
  async function makeOffer(ev){
    var btn=ev.target.closest('#makeOfferBtn');
    if(!btn)return;
    ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();
    btn.disabled=true;var old=btn.textContent;btn.textContent='Формирую КП...';
    try{
      if(!window.db)throw new Error('Supabase не готов');
      var calcId=activeCalcId||await latestCalc();
      var data=await loadCalc(calcId);
      var warnings=warn(data.calc,data.items);
      var shortText=shortOffer(data), fullText=fullOffer(data);
      var offerTitle='КП: '+(data.calc.title||'Расчёт');
      var r=await db.from('leader_commercial_offers').insert({lead_id:data.calc.lead_id,calculation_id:data.calc.id,client_id:data.calc.client_id||null,order_id:data.calc.order_id||null,offer_type:'Подробное + короткое',title:offerTitle,short_text:shortText,full_text:fullText,total_sum:data.calc.client_total,valid_until:validDate(),status:'Черновик'}).select('*').single();
      if(r.error)throw new Error(r.error.message);
      activeOfferId=r.data.id;
      await db.from('leader_lead_calculations').update({commercial_offer_id:r.data.id,status:'КП сформировано',warning_level:warnings.length?'warn':'ok',warnings:warnings,updated_at:new Date().toISOString()}).eq('id',data.calc.id);
      await db.from('leader_commercial_offer_events').insert({offer_id:r.data.id,lead_id:data.calc.lead_id,calculation_id:data.calc.id,event_type:'Создано КП',new_status:'Черновик',comment:warnings.length?warnings.join('\n'):'КП сформировано без критичных предупреждений'});
      showText(fullText+'\n\n---\nКороткая версия для MAX / ВК:\n\n'+shortText);
      var box=q('offerList');
      if(box){box.insertAdjacentHTML('afterbegin','<div class="leadv3-item"><b>'+esc(offerTitle)+'</b><div class="muted">Черновик • '+money(data.calc.client_total)+'</div><button class="leadv3-btn mt" data-offer-v2-show="'+r.data.id+'">Показать КП v2</button></div>');}
      openOfferTab();
      alert('КП сформировано. '+(warnings.length?'Есть предупреждения: '+warnings.length:'Критичных предупреждений нет.'));
    }catch(err){alert(err.message||err)}finally{btn.disabled=false;btn.textContent=old;}
  }
  function openOfferTab(){
    document.querySelectorAll('.leadv3-tab').forEach(function(b){b.classList.toggle('active',b.dataset.tab==='offer')});
    document.querySelectorAll('.leadv3-page').forEach(function(p){p.classList.toggle('active',p.id==='offer')});
  }
  async function mark(status){
    if(!activeOfferId){
      var id=leadId();var r=await db.from('leader_commercial_offers').select('*').eq('lead_id',id).order('created_at',{ascending:false}).limit(1);
      if(r.error)throw new Error(r.error.message);if(!r.data.length)throw new Error('КП не найдено');activeOfferId=r.data[0].id;
    }
    var patch={status:status,updated_at:new Date().toISOString()};
    if(status==='КП отправлено')patch.sent_at=new Date().toISOString();
    if(status==='Согласовано')patch.approved_at=new Date().toISOString();
    var r2=await db.from('leader_commercial_offers').update(patch).eq('id',activeOfferId).select('*').single();
    if(r2.error)throw new Error(r2.error.message);
    await db.from('leader_commercial_offer_events').insert({offer_id:activeOfferId,lead_id:r2.data.lead_id,calculation_id:r2.data.calculation_id,event_type:'Изменение статуса КП',new_status:status,comment:'Статус изменён на '+status});
    alert('Статус КП: '+status);
  }
  async function showOffer(id){
    var r=await db.from('leader_commercial_offers').select('*').eq('id',id).single();
    if(r.error)throw new Error(r.error.message);
    activeOfferId=id;
    showText((r.data.full_text||'')+'\n\n---\nКороткая версия для MAX / ВК:\n\n'+(r.data.short_text||''));
  }
  function enhanceWarnings(){
    var id=leadId();if(!id||!window.db)return;
    db.from('leader_lead_calculations').select('id,warnings,warning_level,margin_percent,client_total,contractor_cost').eq('lead_id',id).then(function(r){
      if(r.error||!r.data)return;
      r.data.forEach(function(c){
        var btn=document.querySelector('[data-open-calc="'+c.id+'"]');
        if(!btn)return;
        var card=btn.closest('.leadv3-item');if(!card||card.querySelector('.offer-v2-warn'))return;
        var warnings=Array.isArray(c.warnings)?c.warnings:[];
        if(n(c.client_total)<=0)warnings.push('Сумма клиенту 0 ₽');
        if(n(c.margin_percent)<20)warnings.push('Маржа ниже 20%');
        var cls=warnings.length?'offer-v2-warn':'offer-v2-warn offer-v2-ok';
        card.insertAdjacentHTML('beforeend','<div class="'+cls+'">'+(warnings.length?warnings.map(esc).join('<br>'):'Расчёт без критичных предупреждений')+'</div>');
      });
    });
  }
  document.addEventListener('click',function(ev){
    var calcBtn=ev.target.closest('[data-open-calc]');
    if(calcBtn){activeCalcId=calcBtn.dataset.openCalc;localStorage.setItem('leader_v3_active_calc_id',activeCalcId)}
    var show=ev.target.closest('[data-offer-v2-show]');
    if(show){ev.preventDefault();showOffer(show.dataset.offerV2Show).catch(function(err){alert(err.message||err)})}
    if(ev.target.closest('#markOfferSentBtn')){ev.preventDefault();ev.stopPropagation();mark('КП отправлено').catch(function(err){alert(err.message||err)})}
    if(ev.target.closest('#markOfferApprovedBtn')){ev.preventDefault();ev.stopPropagation();mark('Согласовано').catch(function(err){alert(err.message||err)})}
  },true);
  document.addEventListener('click',makeOffer,true);
  document.addEventListener('DOMContentLoaded',function(){addCss();setTimeout(enhanceWarnings,1800);setInterval(enhanceWarnings,4000)});
})();
