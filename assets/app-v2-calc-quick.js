(function(){
  function e(id){ return document.getElementById(id); }
  function n(v){ var x=Number(v); return Number.isFinite(x)?x:0; }
  function h(s){ return String(s==null?'':s).replace(/[&<>\"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m];}); }
  function money(v){ return Math.round(n(v)).toLocaleString('ru-RU')+' ₽'; }
  function st(){ try{return window.eval('state')}catch(x){return null} }

  var catalog=[], templates=[];
  var catalogLoaded=false, templatesLoaded=false, loading=false;

  function css(){
    if(e('calcQuickCss')) return;
    var s=document.createElement('style');
    s.id='calcQuickCss';
    s.textContent='.calc-quick-box{margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff}.calc-quick-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.calc-quick-head b{font-size:15px}.calc-quick-head span{display:block;color:var(--muted);font-size:12px;margin-top:3px;line-height:1.35}.calc-quick-grid{display:grid;grid-template-columns:1.3fr repeat(3,minmax(90px,.6fr));gap:10px}.calc-quick-grid label{font-size:12px;font-weight:800;color:#374151}.calc-quick-grid input,.calc-quick-grid select{margin-top:4px}.calc-quick-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.calc-quick-actions button{padding:8px 10px;border-radius:10px}.calc-quick-actions button.primary{background:#111827;color:#fff}.calc-quick-note{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.4}.calc-quick-note.good{color:#166534}.calc-quick-note.warn{color:#92400e}.calc-quick-note.bad{color:#991b1b}.calc-quick-min{display:grid;grid-template-columns:1fr 160px auto;gap:8px;align-items:end;margin-top:12px;padding-top:12px;border-top:1px dashed var(--line)}.calc-quick-min label{font-size:12px;font-weight:800;color:#374151}@media(max-width:850px){.calc-quick-grid,.calc-quick-min{grid-template-columns:1fr}.calc-quick-actions button{flex:1}}';
    document.head.appendChild(s);
  }
  function rows(){ var s=st(); if(!s) return null; if(!Array.isArray(s.rows)) s.rows=[]; return s.rows; }
  function roundArea(v){ return Math.ceil(n(v)*100)/100; }
  function setNote(text,cls){ var x=e('calcQuickNote'); if(x){x.className='calc-quick-note '+(cls||''); x.innerHTML=text;} }
  async function session(){ if(!window.db||!window.db.auth) throw new Error('Supabase ещё не готов'); var r=await window.db.auth.getSession(); if(!r.data||!r.data.session) throw new Error('Сначала войдите в CRM'); }
  async function loadAll(force){
    if(loading) return; if(catalogLoaded&&templatesLoaded&&!force) return;
    loading=true;
    try{
      await session();
      var cr=await window.db.from('leader_catalog').select('id,category,name,unit,contractor_price,item_type,markup_percent,min_client_price,default_client_price,calculation_mode,description,settings,sort_order').eq('is_active',true).order('sort_order',{ascending:true}).order('name',{ascending:true});
      if(cr.error) throw new Error(cr.error.message);
      catalog=cr.data||[]; catalogLoaded=true;
      var tr=await window.db.from('leader_calculation_templates').select('id,name,category,description,items,settings,tags,usage_count').eq('is_active',true).order('category',{ascending:true}).order('name',{ascending:true});
      if(tr.error) throw new Error(tr.error.message);
      templates=tr.data||[]; templatesLoaded=true;
      fillTemplates(); syncPreview();
    }catch(err){ setNote('Шаблоны или номенклатура не загрузились: '+h(err.message||err), 'bad'); }
    finally{ loading=false; }
  }
  function selectedTemplate(){ var id=e('quickTemplate')?e('quickTemplate').value:''; return templates.find(function(t){return String(t.id)===String(id)})||templates[0]||null; }
  function fillTemplates(){
    var sel=e('quickTemplate'); if(!sel) return;
    if(!templates.length){ sel.innerHTML='<option value="">Нет активных шаблонов</option>'; return; }
    var old=sel.value;
    sel.innerHTML=templates.map(function(t){return '<option value="'+h(t.id)+'">'+h(t.category||'Общее')+' — '+h(t.name)+'</option>';}).join('');
    if(templates.some(function(t){return String(t.id)===String(old)})) sel.value=old;
  }
  function needsArea(t){ return (Array.isArray(t&&t.items)?t.items:[]).some(function(x){return x.qty_mode==='area'}); }
  function termsFor(item){ return item && Array.isArray(item.catalog_match_terms)?item.catalog_match_terms:[]; }
  function hay(c){ return [c.name,c.category,c.item_type,c.unit,c.description].join(' ').toLowerCase(); }
  function scoreCatalog(c,item){ var text=hay(c), score=0; termsFor(item).forEach(function(term){ if(text.indexOf(String(term).toLowerCase())>=0) score+=10; }); if(item.qty_mode==='area'&&c.unit==='м²') score+=5; return score; }
  function findCatalog(item){
    if(item && item.catalog_id){
      var byId = catalog.find(function(c){ return String(c.id)===String(item.catalog_id); });
      if(byId) return byId;
    }
    var list=catalog.map(function(c){return {c:c,score:scoreCatalog(c,item)}}).filter(function(x){return x.score>0}).sort(function(a,b){return b.score-a.score});
    return list[0]?list[0].c:null;
  }
  function qtyFor(item){ var pieces=n(e('quickPieces')&&e('quickPieces').value)||1; if(item.qty_mode==='area'){ var w=n(e('quickLength')&&e('quickLength').value), hgt=n(e('quickWidth')&&e('quickWidth').value); if(w<=0||hgt<=0) throw new Error('Укажите длину и ширину.'); return roundArea(w*hgt*pieces); } return n(item.qty)||pieces||1; }
  function calcPrice(c,qty){ var cost=n(c.contractor_price), markup=n(c.markup_percent), min=n(c.min_client_price), def=n(c.default_client_price); var unit=Math.max(cost*(1+markup/100), def||0, min>0?min/qty:0); if(c.calculation_mode==='fixed') unit=Math.max(def||cost*(1+markup/100)||cost, min>0?min/qty:0); return {cost:Math.round(cost), client:Math.round(unit), totalCost:Math.round(cost*qty), totalClient:Math.round(unit*qty)}; }
  function buildOne(t,item){ var c=findCatalog(item); if(!c) throw new Error('Не найдена позиция номенклатуры для пункта «'+(item.label||t.name)+'».'); var qty=qtyFor(item); var p=calcPrice(c,qty); var area=needsArea(t); var parts=['шаблон: '+t.name,'позиция: '+c.name]; if(item.catalog_id) parts.push('прямая привязка catalog_id'); if(area) parts.push('размер: '+n(e('quickLength').value)+' × '+n(e('quickWidth').value)+' м','изделий: '+(n(e('quickPieces').value)||1),'площадь: '+qty+' м²'); return {id:Date.now()+Math.random(),catalog_id:c.id,category:c.category||null,type:c.item_type||'Изготовление',item_type:c.item_type||'Изготовление',calculation_mode:c.calculation_mode||null,min_client_price:c.min_client_price||null,default_client_price:c.default_client_price||null,markup_percent:c.markup_percent||null,name:c.name,unit:c.unit,qty:qty,price:p.cost,client:p.client,comment:(t.description||'')+' '+parts.join(', ')+'.',data:Object.assign({},c.settings||{},{calculation_template_id:t.id,calculation_template_name:t.name,catalog_source:'leader_catalog',catalog_name:c.name,catalog_link_mode:item.catalog_id?'catalog_id':'match_terms',recommended_client_price:p.client,recommended_contractor_price:p.cost,length:area?n(e('quickLength').value):null,width:area?n(e('quickWidth').value):null,pieces:n(e('quickPieces').value)||1,area:area?qty:null,calculated_from_template_at:new Date().toISOString()})}; }
  function calcTotals(){ var rs=rows()||[]; var total=rs.reduce(function(a,r){return a+n(r.client)*n(r.qty)},0); return {total:total}; }
  function renderAll(){ try{ if(typeof window.renderCalcRows==='function') window.renderCalcRows(); }catch(x){} try{ if(window.LeaderV2CalcSummary&&window.LeaderV2CalcSummary.render) window.LeaderV2CalcSummary.render(); }catch(x){} try{ if(window.LeaderCalcGuard&&window.LeaderCalcGuard.renderStatus) window.LeaderCalcGuard.renderStatus(); }catch(x){} }
  function syncPreview(){ var t=selectedTemplate(); if(!t){ setNote('Нет активных шаблонов. Добавьте их в разделе «Шаблоны».','warn'); return; } var arr=Array.isArray(t.items)?t.items:[]; if(!arr.length){ setNote('В шаблоне нет позиций. Отредактируйте шаблон.','warn'); return; } try{ var lines=arr.map(function(item){ var c=findCatalog(item); if(!c) return '⚠ '+h(item.label||'Позиция')+': не найдена номенклатура'+(item.catalog_id?' по catalog_id':''); var qty=qtyFor(item); var p=calcPrice(c,qty); return '✓ '+h(c.name)+' • '+h(qty)+' '+h(c.unit)+' • клиенту '+money(p.totalClient)+(item.catalog_id?' • привязка по catalog_id':''); }); setNote('<b>'+h(t.name)+'</b><br>'+lines.join('<br>'),'good'); if(e('quickMinOrder')) e('quickMinOrder').value=n((t.settings||{}).min_order)||1000; }catch(err){ setNote(h(err.message||err),'warn'); } }
  async function addTemplate(){ var rs=rows(); if(!rs) return alert('Расчёт ещё не готов.'); await loadAll(false); var t=selectedTemplate(); if(!t) return alert('Нет активного шаблона.'); try{ (Array.isArray(t.items)?t.items:[]).forEach(function(item){ rs.push(buildOne(t,item)); }); await window.db.from('leader_calculation_templates').update({usage_count:n(t.usage_count)+1}).eq('id',t.id); renderAll(); setNote('Шаблон добавлен в расчёт: <b>'+h(t.name)+'</b>. Цены рассчитаны из текущей номенклатуры.','good'); }catch(err){ alert(err.message||String(err)); } }
  function fillManualFields(){ alert('Для шаблонов из базы лучше использовать «Добавить по шаблону»: один шаблон может добавлять несколько позиций.'); }
  function applyMinimum(){ var rs=rows(); if(!rs) return; var min=n(e('quickMinOrder')&&e('quickMinOrder').value)||1000; var t=calcTotals(); if(t.total<=0) return alert('Сначала добавьте позиции.'); if(t.total>=min) return setNote('Минимальная сумма уже соблюдена: '+money(t.total),'good'); var diff=Math.round(min-t.total); rs.push({id:Date.now()+Math.random(),type:'Услуга',item_type:'Услуга',name:'Минимальная сумма заказа',unit:'заказ',qty:1,price:0,client:diff,comment:'Корректировка до минимальной суммы заказа '+money(min)+'.',data:{quick_min_order_adjustment:true,min_order:min}}); renderAll(); setNote('Добавлена корректировка: '+money(diff),'good'); }
  function ensure(){ css(); if(e('calcQuickBox')) return; var btn=e('addItemBtn'); if(!btn||!btn.parentNode) return; var box=document.createElement('div'); box.id='calcQuickBox'; box.className='calc-quick-box'; box.innerHTML='<div class="calc-quick-head"><div><b>Быстрые шаблоны расчёта</b><span>Шаблоны загружаются из базы. В них хранится сценарий, а цены берутся из актуальной номенклатуры.</span></div><button id="quickReloadCatalogBtn" type="button">Обновить</button></div><div class="calc-quick-grid"><label>Шаблон<select id="quickTemplate"><option>Загружаю...</option></select></label><label>Длина, м<input id="quickLength" type="number" min="0" step="0.01" value="1"></label><label>Ширина, м<input id="quickWidth" type="number" min="0" step="0.01" value="1"></label><label>Кол-во<input id="quickPieces" type="number" min="1" step="1" value="1"></label></div><div class="calc-quick-actions"><button id="quickAddBtn" type="button" class="primary">Добавить по шаблону</button><button id="quickFillBtn" type="button">Пояснение</button></div><div class="calc-quick-min"><div><b>Минимальный заказ</b><div class="calc-quick-note">Минимум может подтягиваться из настроек шаблона.</div></div><label>Минимум, ₽<input id="quickMinOrder" type="number" min="0" step="100" value="1000"></label><button id="quickMinBtn" type="button">Довести до минимума</button></div><div id="calcQuickNote" class="calc-quick-note"></div>'; btn.parentNode.insertBefore(box,btn); e('quickTemplate').addEventListener('change',syncPreview); ['quickLength','quickWidth','quickPieces','quickMinOrder'].forEach(function(id){e(id).addEventListener('input',syncPreview)}); e('quickAddBtn').onclick=addTemplate; e('quickFillBtn').onclick=fillManualFields; e('quickMinBtn').onclick=applyMinimum; e('quickReloadCatalogBtn').onclick=function(){catalogLoaded=false;templatesLoaded=false;loadAll(true)}; loadAll(false); }
  function boot(){ ensure(); document.querySelectorAll('[data-page="calc"]').forEach(function(tab){ if(!tab.dataset.calcQuickDb){ tab.dataset.calcQuickDb='1'; tab.addEventListener('click',function(){setTimeout(ensure,300); setTimeout(function(){loadAll(false)},500);}); } }); }
  window.LeaderV2CalcQuick={ensure:ensure,loadAll:loadAll,addTemplate:addTemplate,applyMinimum:applyMinimum};
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',function(){setTimeout(boot,1200)}); else setTimeout(boot,900);
})();
