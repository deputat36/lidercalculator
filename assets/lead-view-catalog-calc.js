(function(){
  function q(id){return document.getElementById(id)}
  function n(v){var x=Number(v);return Number.isFinite(x)?x:0}
  function leadId(){return new URLSearchParams(location.search).get('id')}
  function val(id){return q(id)?q(id).value:''}
  function price(c){
    var cost=n(c.contractor_price), markup=n(c.markup_percent), fixed=n(c.default_client_price);
    if(c.calculation_mode==='fixed' && fixed>0)return fixed;
    if(fixed>0)return fixed;
    return Math.round(cost*(1+markup/100));
  }
  function calcLine(calcId, leadIdValue, catalog, qty, comment){
    var cost=n(catalog.contractor_price), client=price(catalog), sumClient=client*qty, sumCost=cost*qty;
    return {
      calculation_id:calcId,
      lead_id:leadIdValue,
      catalog_id:catalog.id,
      category:catalog.category,
      item_type:catalog.item_type,
      name:catalog.name,
      unit:catalog.unit,
      qty:qty,
      contractor_price:cost,
      contractor_sum:sumCost,
      markup_percent:n(catalog.markup_percent),
      client_price:client,
      client_sum:sumClient,
      profit:sumClient-sumCost,
      margin_percent:client?Math.round((client-cost)/client*100):0,
      comment:comment||'',
      data:{source:'leader_catalog',calculation_mode:catalog.calculation_mode,default_client_price:catalog.default_client_price}
    };
  }
  function findCatalog(catalog, words){
    words=Array.isArray(words)?words:[words];
    return catalog.find(function(c){var s=(c.category+' '+c.name).toLowerCase();return words.every(function(w){return s.indexOf(String(w).toLowerCase())>=0})})||null;
  }
  async function ensureNeed(lead){
    var id=leadId();
    var old=await db.from('leader_lead_needs').select('*').eq('lead_id',id).order('created_at',{ascending:false}).limit(1);
    var d={width:val('needWidth'),height:val('needHeight'),qty:val('needQty')||1,printQty:val('needPrintQty'),format:val('needFormat'),layout:val('needLayout'),design:val('needDesign'),installation:val('needInstallation'),deadlineText:val('needDeadlineText'),deadlineDate:val('needDeadlineDate'),address:val('needAddress'),files:val('needFiles')};
    var design=d.design==='yes'||(d.design==='auto'&&/нет|дизайн|плох|адапт/i.test(d.layout));
    var inst=d.installation==='yes'||(d.installation==='auto'&&!!d.address);
    var row={lead_id:id,client_id:lead.converted_client_id||null,need_type:val('needType')||'Другое',title:val('needTitle')||val('needType')||'Потребность',description:val('needDescription')||'',structured_data:d,need_design:design,need_installation:inst,design_reason:design?'Макет требует дизайна или подготовки':null,installation_reason:inst?'Клиент указал монтаж или адрес':null,deadline_text:d.deadlineText,deadline_date:d.deadlineDate||null,status:'Заполнена',completeness_score:70,updated_at:new Date().toISOString()};
    var current=(old.data||[])[0];
    var r=current?await db.from('leader_lead_needs').update(row).eq('id',current.id).select('*').single():await db.from('leader_lead_needs').insert(row).select('*').single();
    if(r.error)throw new Error(r.error.message);
    return r.data;
  }
  async function createCatalogCalc(ev){
    var btn=ev.target.closest('#createCalcFromNeedBtn');
    if(!btn)return;
    ev.preventDefault();ev.stopPropagation();ev.stopImmediatePropagation();
    btn.disabled=true;var oldText=btn.textContent;btn.textContent='Создаю расчёт...';
    try{
      if(!window.db)throw new Error('Supabase не готов');
      var id=leadId(); if(!id)throw new Error('Не передан id заявки');
      var leadRes=await db.from('leader_leads').select('*').eq('id',id).single();
      if(leadRes.error)throw new Error(leadRes.error.message);
      var lead=leadRes.data;
      var need=await ensureNeed(lead);
      var d=need.structured_data||{};
      var catalogRes=await db.from('leader_catalog').select('*').eq('is_active',true).order('category').order('sort_order');
      if(catalogRes.error)throw new Error(catalogRes.error.message);
      var catalog=catalogRes.data||[];
      var calcRes=await db.from('leader_lead_calculations').insert({lead_id:id,need_id:need.id,client_id:lead.converted_client_id||null,title:need.title||'Расчёт',status:'Черновик'}).select('*').single();
      if(calcRes.error)throw new Error(calcRes.error.message);
      var calc=calcRes.data, type=(need.need_type||'').toLowerCase(), items=[], qty=n(d.qty)||1;
      if(type.indexOf('баннер')>=0){
        var area=n(d.width)*n(d.height)*qty;
        var perimeter=(n(d.width)+n(d.height))*2*qty;
        var banner=findCatalog(catalog,['баннерная','печать']);
        var edge=findCatalog(catalog,['проклейка']);
        var eyelet=findCatalog(catalog,['люверс']);
        if(banner&&area>0)items.push(calcLine(calc.id,id,banner,area,'Площадь рассчитана из потребности'));
        if(edge&&perimeter>0)items.push(calcLine(calc.id,id,edge,perimeter,'Периметр баннера'));
        if(eyelet&&perimeter>0)items.push(calcLine(calc.id,id,eyelet,Math.ceil(perimeter/0.5),'Шаг примерно 50 см'));
      }
      if(type.indexOf('полиграф')>=0){
        var format=(d.format||'').toLowerCase(), printQty=n(d.printQty)||100;
        var target=null;
        if(format.indexOf('a6')>=0)target=findCatalog(catalog,['листовка a6']);
        if(format.indexOf('a5')>=0)target=findCatalog(catalog,['листовка a5']);
        if(format.indexOf('a4')>=0)target=findCatalog(catalog,['листовка a4']);
        if(!target)target=findCatalog(catalog,['полиграфия']);
        if(target)items.push(calcLine(calc.id,id,target,Math.max(1,Math.ceil(printQty/100)),'Тираж указан блоками по 100 шт'));
      }
      if(type.indexOf('наклей')>=0||type.indexOf('плён')>=0||type.indexOf('плен')>=0){
        var film=findCatalog(catalog,['самоклеящейся']);
        var area2=n(d.width)*n(d.height)*qty;
        if(film&&area2>0)items.push(calcLine(calc.id,id,film,area2,'Площадь плёнки из потребности'));
      }
      if(need.need_design){
        var design=findCatalog(catalog,['подготовка макета'])||findCatalog(catalog,['дизайн макета'])||findCatalog(catalog,['дизайн']);
        if(design)items.push(calcLine(calc.id,id,design,1,'CRM рекомендовала дизайн'));
      }
      if(need.need_installation){
        var install=findCatalog(catalog,['монтаж баннера'])||findCatalog(catalog,['монтаж вывески'])||findCatalog(catalog,['монтаж']);
        if(install)items.push(calcLine(calc.id,id,install,1,'CRM рекомендовала монтаж'));
      }
      if(!items.length)throw new Error('Не удалось подобрать позиции. Проверьте тип потребности и номенклатуру.');
      var ins=await db.from('leader_lead_calculation_items').insert(items);
      if(ins.error)throw new Error(ins.error.message);
      var total=items.reduce(function(a,x){return a+n(x.client_sum)},0), cost=items.reduce(function(a,x){return a+n(x.contractor_sum)},0), profit=total-cost, margin=total?Math.round(profit/total*100):0;
      var warnings=[];
      if(items.some(function(x){return n(x.contractor_price)<=0}))warnings.push('У части позиций нулевая себестоимость. Заполните цену подрядчика в номенклатуре.');
      if(total<=0)warnings.push('Сумма клиенту 0 ₽. Нельзя создавать заказ.');
      if(margin<20)warnings.push('Маржа ниже 20%.');
      await db.from('leader_lead_calculations').update({client_total:total,contractor_cost:cost,profit:profit,margin_percent:margin,status:'Готов',warning_level:warnings.length?'warn':'ok',warnings:warnings,updated_at:new Date().toISOString()}).eq('id',calc.id);
      alert('Расчёт создан по актуальной номенклатуре. Позиций: '+items.length+'; сумма: '+Math.round(total).toLocaleString('ru-RU')+' ₽');
      location.href='lead-view.html?id='+encodeURIComponent(id)+'&calc='+encodeURIComponent(calc.id)+'&fresh='+Date.now();
    }catch(err){alert(err.message||err)}finally{btn.disabled=false;btn.textContent=oldText;}
  }
  document.addEventListener('click',createCatalogCalc,true);
})();
