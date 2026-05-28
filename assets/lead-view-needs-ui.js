(function(){
  var selectedNeedId=null;
  var needs=[];
  function e(id){return document.getElementById(id)}
  function h(s){return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]})}
  function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
  function money(v){return Math.round(n(v)).toLocaleString('ru-RU')+' ₽'}
  function leadId(){return new URLSearchParams(location.search).get('id')}
  function validId(){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadId()||'')}
  function val(id){return e(id)?e(id).value:''}
  function set(id,v){if(e(id))e(id).value=v==null?'':v}
  function hideLoginWhenOk(){
    var st=e('authState');
    if(!st)return;
    var ok=st.classList.contains('ok')||/вход выполнен/i.test(st.textContent||'');
    ['loginEmail','loginPassword','loginBtn'].forEach(function(id){var x=e(id);if(x)x.style.display=ok?'none':''});
    if(ok&&!e('leadV3SwitchUser')){
      var b=document.createElement('button');
      b.id='leadV3SwitchUser';
      b.className='leadv3-btn';
      b.textContent='Сменить вход';
      b.onclick=function(){try{localStorage.removeItem('leader_session_v1')}catch(err){} location.reload()};
      st.parentNode.appendChild(b);
    }
  }
  function patchCss(){
    if(e('needsUiCss'))return;
    var s=document.createElement('style');
    s.id='needsUiCss';
    s.textContent='.need-ui-panel{margin-bottom:12px;padding:10px;border:1px solid #e5e7eb;border-radius:14px;background:#f9fafb}.need-ui-row{display:flex;justify-content:space-between;gap:8px;align-items:flex-start;padding:8px;border:1px solid #e5e7eb;border-radius:12px;background:#fff;margin-top:7px}.need-ui-title{font-weight:900}.need-ui-meta{font-size:12px;color:#6b7280;margin-top:3px}.need-ui-actions{display:flex;gap:6px;flex-wrap:wrap}.need-ui-btn{border:1px solid #e5e7eb;border-radius:999px;background:#fff;padding:7px 10px;font-weight:900;font-size:12px;cursor:pointer}.need-ui-btn.primary{background:#111827;color:#fff}.need-ui-btn.yellow{background:#f6c343;border-color:#f6c343}.need-ui-empty{font-size:13px;color:#6b7280;margin-top:7px}.need-ui-active{border-color:#111827;box-shadow:0 0 0 2px rgba(17,24,39,.08)}@media(max-width:700px){.need-ui-row{display:block}.need-ui-actions{margin-top:8px}}';
    document.head.appendChild(s);
  }
  async function loadNeeds(){
    if(!window.db||!validId())return;
    var r=await db.from('leader_lead_needs').select('*').eq('lead_id',leadId()).order('created_at',{ascending:false});
    if(r.error)throw new Error(r.error.message);
    needs=r.data||[];
    if(!selectedNeedId&&needs[0])selectedNeedId=needs[0].id;
    renderPanel();
  }
  function ensurePanel(){
    var form=e('needForm');
    if(!form||e('needUiPanel'))return;
    var panel=document.createElement('div');
    panel.id='needUiPanel';
    panel.className='need-ui-panel';
    form.parentNode.insertBefore(panel,form);
  }
  function renderPanel(){
    ensurePanel();
    var p=e('needUiPanel');
    if(!p)return;
    var html='<div class="need-ui-title">Потребности в этой заявке</div><div class="need-ui-meta">В одной заявке можно хранить несколько потребностей: баннер, вывеска, плёнка, полиграфия и другие позиции.</div><div class="need-ui-actions" style="margin-top:8px"><button class="need-ui-btn primary" data-need-new="1">Добавить ещё потребность</button><button class="need-ui-btn" data-need-refresh="1">Обновить список</button></div>';
    if(!needs.length){html+='<div class="need-ui-empty">Потребностей пока нет. Заполните форму ниже и нажмите «Сохранить потребность».</div>'}
    else{
      needs.forEach(function(x){
        html+='<div class="need-ui-row '+(x.id===selectedNeedId?'need-ui-active':'')+'"><div><div class="need-ui-title">'+h(x.title||x.need_type||'Потребность')+'</div><div class="need-ui-meta">'+h(x.need_type||'')+' • '+h(x.status||'')+(x.need_design?' • нужен дизайн':'')+(x.need_installation?' • нужен монтаж':'')+'</div></div><div class="need-ui-actions"><button class="need-ui-btn" data-need-open="'+x.id+'">Открыть</button><button class="need-ui-btn yellow" data-need-calc="'+x.id+'">Расчёт</button></div></div>';
      });
    }
    p.innerHTML=html;
  }
  function fillNeed(x){
    if(!x)return;
    selectedNeedId=x.id;
    var d=x.structured_data||{};
    set('needType',x.need_type||'Баннер');
    set('needTitle',x.title||'');
    set('needDescription',x.description||'');
    set('needWidth',d.width||'');
    set('needHeight',d.height||'');
    set('needQty',d.qty||1);
    set('needPrintQty',d.printQty||'');
    set('needFormat',d.format||'');
    set('needLayout',d.layout||'Не известно');
    set('needDesign',d.design||'auto');
    set('needInstallation',d.installation||'auto');
    set('needDeadlineText',d.deadlineText||'');
    set('needDeadlineDate',d.deadlineDate||'');
    set('needAddress',d.address||'');
    set('needFiles',d.files||'');
    renderPanel();
  }
  function clearNeedForm(){
    selectedNeedId=null;
    set('needType','Баннер');set('needTitle','');set('needDescription','');set('needWidth','');set('needHeight','');set('needQty',1);set('needPrintQty','');set('needFormat','');set('needLayout','Не известно');set('needDesign','auto');set('needInstallation','auto');set('needDeadlineText','');set('needDeadlineDate','');set('needAddress','');set('needFiles','');renderPanel();
  }
  async function currentLead(){
    var r=await db.from('leader_leads').select('*').eq('id',leadId()).single();
    if(r.error)throw new Error(r.error.message);
    return r.data;
  }
  function collectNeed(lead){
    var d={width:val('needWidth'),height:val('needHeight'),qty:val('needQty')||1,printQty:val('needPrintQty'),format:val('needFormat'),layout:val('needLayout'),design:val('needDesign'),installation:val('needInstallation'),deadlineText:val('needDeadlineText'),deadlineDate:val('needDeadlineDate'),address:val('needAddress'),files:val('needFiles')};
    var design=d.design==='yes'||(d.design==='auto'&&/нет|дизайн|плох|адапт/i.test(d.layout));
    var inst=d.installation==='yes'||(d.installation==='auto'&&!!d.address);
    return {lead_id:lead.id,client_id:lead.converted_client_id||null,need_type:val('needType')||'Другое',title:val('needTitle')||val('needType')||'Потребность',description:val('needDescription')||'',structured_data:d,need_design:design,need_installation:inst,design_reason:design?'Макет требует дизайна или подготовки':null,installation_reason:inst?'Клиент указал монтаж или адрес':null,deadline_text:d.deadlineText,deadline_date:d.deadlineDate||null,status:'Заполнена',completeness_score:70,updated_at:new Date().toISOString()};
  }
  async function saveSelectedNeed(){
    var lead=await currentLead();
    var row=collectNeed(lead);
    var r=selectedNeedId?await db.from('leader_lead_needs').update(row).eq('id',selectedNeedId).select('*').single():await db.from('leader_lead_needs').insert(row).select('*').single();
    if(r.error)throw new Error(r.error.message);
    selectedNeedId=r.data.id;
    await loadNeeds();
    fillNeed(r.data);
    return r.data;
  }
  function catalogPrice(c){
    var cost=n(c.contractor_price), markup=n(c.markup_percent), fixed=n(c.default_client_price);
    if(c.calculation_mode==='fixed'&&fixed>0)return fixed;
    if(fixed>0)return fixed;
    return Math.round(cost*(1+markup/100));
  }
  function findCatalog(catalog, words){
    words=Array.isArray(words)?words:[words];
    return catalog.find(function(c){var s=(c.category+' '+c.name).toLowerCase();return words.every(function(w){return s.indexOf(String(w).toLowerCase())>=0})})||null;
  }
  function line(calcId, catalog, qty, comment){
    var cost=n(catalog.contractor_price), client=catalogPrice(catalog), sumClient=client*qty, sumCost=cost*qty;
    return {calculation_id:calcId,lead_id:leadId(),catalog_id:catalog.id,category:catalog.category,item_type:catalog.item_type,name:catalog.name,unit:catalog.unit,qty:qty,contractor_price:cost,contractor_sum:sumCost,markup_percent:n(catalog.markup_percent),client_price:client,client_sum:sumClient,profit:sumClient-sumCost,margin_percent:client?Math.round((client-cost)/client*100):0,comment:comment||'',data:{source:'multi_need_ui'}};
  }
  async function createCalcForNeed(needId){
    var need=needs.find(function(x){return x.id===needId})||await saveSelectedNeed();
    if(need.id!==needId){needId=need.id;}
    var catalogRes=await db.from('leader_catalog').select('*').eq('is_active',true).order('category').order('sort_order');
    if(catalogRes.error)throw new Error(catalogRes.error.message);
    var catalog=catalogRes.data||[];
    var calcRes=await db.from('leader_lead_calculations').insert({lead_id:leadId(),need_id:need.id,client_id:need.client_id||null,title:need.title||'Расчёт',status:'Черновик'}).select('*').single();
    if(calcRes.error)throw new Error(calcRes.error.message);
    var calc=calcRes.data, d=need.structured_data||{}, type=(need.need_type||'').toLowerCase(), qty=n(d.qty)||1, items=[];
    if(type.indexOf('баннер')>=0){
      var area=n(d.width)*n(d.height)*qty, per=(n(d.width)+n(d.height))*2*qty;
      var banner=findCatalog(catalog,['баннерная','печать']);
      var edge=findCatalog(catalog,'проклейка');
      var eyelet=findCatalog(catalog,'люверс');
      if(banner&&area>0)items.push(line(calc.id,banner,area,'Площадь из потребности'));
      if(edge&&per>0)items.push(line(calc.id,edge,per,'Периметр'));
      if(eyelet&&per>0)items.push(line(calc.id,eyelet,Math.ceil(per/0.5),'Шаг 50 см'));
    }
    if(type.indexOf('полиграф')>=0){
      var fmt=String(d.format||'').toLowerCase(), printQty=n(d.printQty)||100, target=null;
      if(fmt.indexOf('a6')>=0)target=findCatalog(catalog,['листовка a6']);
      if(fmt.indexOf('a5')>=0)target=findCatalog(catalog,['листовка a5']);
      if(fmt.indexOf('a4')>=0)target=findCatalog(catalog,['листовка a4']);
      if(!target)target=findCatalog(catalog,'полиграфия');
      if(target)items.push(line(calc.id,target,Math.max(1,Math.ceil(printQty/100)),'Тираж блоками по 100 шт'));
    }
    if(type.indexOf('наклей')>=0||type.indexOf('плён')>=0||type.indexOf('плен')>=0){
      var film=findCatalog(catalog,'самокле');
      var area2=n(d.width)*n(d.height)*qty;
      if(film&&area2>0)items.push(line(calc.id,film,area2,'Площадь плёнки'));
    }
    if(need.need_design){var design=findCatalog(catalog,'подготовка макета')||findCatalog(catalog,'дизайн');if(design)items.push(line(calc.id,design,1,'Дизайн/подготовка'))}
    if(need.need_installation){var inst=findCatalog(catalog,'монтаж')||findCatalog(catalog,'доставка');if(inst)items.push(line(calc.id,inst,1,'Монтаж/выезд'))}
    if(!items.length){alert('Расчёт создан, но позиции не подобраны. Проверьте тип потребности и номенклатуру.');return calc;}
    var ins=await db.from('leader_lead_calculation_items').insert(items);
    if(ins.error)throw new Error(ins.error.message);
    var total=items.reduce(function(a,x){return a+n(x.client_sum)},0), cost=items.reduce(function(a,x){return a+n(x.contractor_sum)},0), profit=total-cost, margin=total?Math.round(profit/total*100):0, warnings=[];
    if(items.some(function(x){return n(x.contractor_price)<=0&&x.item_type!=='Дизайн'}))warnings.push('Есть позиции с нулевой себестоимостью');
    if(total<=0)warnings.push('Сумма клиенту 0 ₽');
    if(margin<20)warnings.push('Маржа ниже 20%');
    await db.from('leader_lead_calculations').update({client_total:total,contractor_cost:cost,profit:profit,margin_percent:margin,warnings:warnings,warning_level:warnings.length?'warn':'ok',status:'Готов',updated_at:new Date().toISOString()}).eq('id',calc.id);
    alert('Расчёт создан по потребности: '+(need.title||need.need_type)+'\nСумма: '+money(total));
    location.reload();
  }
  function bind(){
    document.addEventListener('click',function(ev){
      var t=ev.target;
      if(t.matches('[data-need-new]')){ev.preventDefault();clearNeedForm();}
      if(t.matches('[data-need-refresh]')){ev.preventDefault();loadNeeds().catch(function(err){alert(err.message||err)})}
      if(t.dataset.needOpen){ev.preventDefault();var x=needs.find(function(n){return n.id===t.dataset.needOpen});fillNeed(x)}
      if(t.dataset.needCalc){ev.preventDefault();createCalcForNeed(t.dataset.needCalc).catch(function(err){alert(err.message||err)})}
      if(t.id==='saveNeedBtn'){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();saveSelectedNeed().then(function(){alert('Потребность сохранена')}).catch(function(err){alert(err.message||err)});}
      if(t.id==='createCalcFromNeedBtn'){ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();saveSelectedNeed().then(function(x){return createCalcForNeed(x.id)}).catch(function(err){alert(err.message||err)});}
    },true);
  }
  function boot(){
    patchCss();
    bind();
    setInterval(hideLoginWhenOk,500);
    var timer=setInterval(function(){
      hideLoginWhenOk();
      if(e('needForm')&&validId()){clearInterval(timer);loadNeeds().then(function(){if(selectedNeedId){var x=needs.find(function(n){return n.id===selectedNeedId});if(x)fillNeed(x)}}).catch(function(err){console.warn(err)})}
    },700);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
