(function(){
  function e(id){ return document.getElementById(id); }
  function n(v){ var x = Number(v); return Number.isFinite(x) ? x : 0; }
  function money(v){ return Math.round(n(v)).toLocaleString('ru-RU') + ' ₽'; }
  function h(s){ return String(s == null ? '' : s).replace(/[&<>\"]/g,function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]; }); }
  function st(){ try { return window.eval('state'); } catch(x){ return null; } }

  var catalog = [];
  var catalogLoaded = false;
  var catalogLoading = false;

  var templates = {
    banner: {
      title: 'Баннер / печать на баннере',
      type: 'Изготовление',
      unit: 'м²',
      area: true,
      terms: ['баннер', 'banner', 'печать баннер', 'баннерная ткань'],
      comment: 'Быстрый шаблон: баннер. Проверьте плотность, люверсы, подгиб и монтаж.'
    },
    sticker: {
      title: 'Наклейка / плёнка',
      type: 'Изготовление',
      unit: 'м²',
      area: true,
      terms: ['наклей', 'плен', 'плён', 'самоклей', 'пленка', 'плёнка'],
      comment: 'Быстрый шаблон: печать на плёнке. Проверьте ламинацию, резку и подготовку макета.'
    },
    sign: {
      title: 'Табличка ПВХ / вывеска',
      type: 'Изготовление',
      unit: 'м²',
      area: true,
      terms: ['таблич', 'пвх', 'вывес', 'пластик'],
      comment: 'Быстрый шаблон: табличка/вывеска. Проверьте толщину ПВХ, крепёж и монтаж.'
    },
    design: {
      title: 'Дизайн макета',
      type: 'Дизайн',
      unit: 'проект',
      qty: 1,
      terms: ['дизайн', 'макет', 'верстка', 'вёрстка'],
      comment: 'Быстрый шаблон: дизайн макета. Уточните количество вариантов и правок.'
    },
    mounting: {
      title: 'Монтаж',
      type: 'Монтаж',
      unit: 'услуга',
      qty: 1,
      terms: ['монтаж', 'установка', 'поклейка'],
      comment: 'Быстрый шаблон: монтаж. Уточните высоту, крепёж, выезд и сложность.'
    },
    delivery: {
      title: 'Доставка',
      type: 'Доставка',
      unit: 'услуга',
      qty: 1,
      terms: ['доставка', 'выезд', 'курьер'],
      comment: 'Быстрый шаблон: доставка. Уточните адрес и срочность.'
    }
  };

  function css(){
    if(e('calcQuickCss')) return;
    var s = document.createElement('style');
    s.id = 'calcQuickCss';
    s.textContent = '.calc-quick-box{margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff}.calc-quick-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.calc-quick-head b{font-size:15px}.calc-quick-head span{display:block;color:var(--muted);font-size:12px;margin-top:3px;line-height:1.35}.calc-quick-grid{display:grid;grid-template-columns:1fr 1.2fr repeat(3,minmax(80px,.55fr));gap:10px}.calc-quick-grid label{font-size:12px;font-weight:800;color:#374151}.calc-quick-grid input,.calc-quick-grid select{margin-top:4px}.calc-quick-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.calc-quick-actions button{padding:8px 10px;border-radius:10px}.calc-quick-actions button.primary{background:#111827;color:#fff}.calc-quick-actions button[disabled]{opacity:.55;cursor:not-allowed}.calc-quick-presets{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.calc-quick-presets button{font-size:12px;padding:7px 9px;border-radius:999px;background:#f9fafb;border:1px solid var(--line)}.calc-quick-note{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.4}.calc-quick-note.good{color:#166534}.calc-quick-note.warn{color:#92400e}.calc-quick-note.bad{color:#991b1b}.calc-quick-min{display:grid;grid-template-columns:1fr 160px auto;gap:8px;align-items:end;margin-top:12px;padding-top:12px;border-top:1px dashed var(--line)}.calc-quick-min label{font-size:12px;font-weight:800;color:#374151}.calc-quick-min input{margin-top:4px}@media(max-width:1100px){.calc-quick-grid{grid-template-columns:1fr 1fr}}@media(max-width:700px){.calc-quick-grid,.calc-quick-min{grid-template-columns:1fr}.calc-quick-actions button,.calc-quick-presets button{flex:1}}';
    document.head.appendChild(s);
  }

  function rows(){
    var s = st();
    if(!s) return null;
    if(!Array.isArray(s.rows)) s.rows = [];
    return s.rows;
  }

  function calcTotals(){
    var rs = rows() || [];
    var cost = rs.reduce(function(a,r){ return a+n(r.price)*n(r.qty); },0);
    var total = rs.reduce(function(a,r){ return a+n(r.client)*n(r.qty); },0);
    return { cost:cost, total:total, profit:total-cost };
  }

  function roundArea(v){ return Math.ceil(n(v)*100)/100; }

  function selectedKey(){ return e('quickTemplate') ? e('quickTemplate').value : 'banner'; }
  function selectedTemplate(){ return templates[selectedKey()] || templates.banner; }

  function renderAll(){
    try{ if(typeof window.renderCalcRows === 'function') window.renderCalcRows(); }catch(x){}
    try{ if(window.LeaderV2CalcEditor && window.LeaderV2CalcEditor.render) window.LeaderV2CalcEditor.render(); }catch(x){}
    try{ if(window.LeaderV2CalcSummary && window.LeaderV2CalcSummary.render) window.LeaderV2CalcSummary.render(); }catch(x){}
    try{ if(window.LeaderCalcGuard && window.LeaderCalcGuard.renderStatus) window.LeaderCalcGuard.renderStatus(); }catch(x){}
    try{ if(window.LeaderCalcEngine && window.LeaderCalcEngine.renderRiskPanel) window.LeaderCalcEngine.renderRiskPanel(); }catch(x){}
  }

  function setNote(text, cls){
    var x = e('calcQuickNote');
    if(!x) return;
    x.className = 'calc-quick-note ' + (cls || '');
    x.innerHTML = text;
  }

  async function ensureSession(){
    if(!window.db || !window.db.auth) throw new Error('Supabase ещё не готов');
    var s = await window.db.auth.getSession();
    if(!s.data || !s.data.session) throw new Error('Сначала войдите в CRM');
    return s.data.session;
  }

  async function loadCatalog(force){
    if(catalogLoading) return catalog;
    if(catalogLoaded && !force) return catalog;
    catalogLoading = true;
    try{
      await ensureSession();
      var r = await window.db.from('leader_catalog').select('id,category,name,unit,contractor_price,item_type,markup_percent,min_client_price,default_client_price,calculation_mode,description,settings,sort_order').eq('is_active',true).order('sort_order',{ascending:true}).order('name',{ascending:true});
      if(r.error) throw new Error(r.error.message);
      catalog = r.data || [];
      catalogLoaded = true;
      fillCatalogOptions();
      return catalog;
    }catch(err){
      catalogLoaded = false;
      catalog = [];
      fillCatalogOptions();
      setNote('Номенклатура не загрузилась: '+h(err.message || err)+'. Цены по шаблонам не будут рассчитаны без базы.', 'bad');
      return [];
    }finally{
      catalogLoading = false;
    }
  }

  function hay(item){
    return [item.name,item.category,item.item_type,item.unit,item.description].join(' ').toLowerCase();
  }

  function scoreItem(item,t){
    var text = hay(item);
    var score = 0;
    (t.terms || []).forEach(function(term){ if(text.indexOf(String(term).toLowerCase()) >= 0) score += 10; });
    if(t.unit && item.unit === t.unit) score += 4;
    if(t.type && item.item_type === t.type) score += 4;
    if(t.area && item.unit === 'м²') score += 3;
    if(!t.area && item.unit !== 'м²') score += 1;
    return score;
  }

  function matchesForTemplate(t){
    return (catalog || []).map(function(item){ return { item:item, score:scoreItem(item,t) }; }).filter(function(x){ return x.score > 0; }).sort(function(a,b){ return b.score - a.score || String(a.item.name).localeCompare(String(b.item.name),'ru'); }).map(function(x){ return x.item; });
  }

  function chosenCatalogItem(){
    var id = e('quickCatalogItem') ? e('quickCatalogItem').value : '';
    if(id) return catalog.find(function(x){ return String(x.id) === String(id); }) || null;
    var list = matchesForTemplate(selectedTemplate());
    return list[0] || null;
  }

  function fillCatalogOptions(){
    var sel = e('quickCatalogItem');
    if(!sel) return;
    var t = selectedTemplate();
    var list = matchesForTemplate(t);
    if(!catalog.length){
      sel.innerHTML = '<option value="">Номенклатура не загружена</option>';
      return;
    }
    if(!list.length){
      sel.innerHTML = '<option value="">Подходящая позиция не найдена</option>' + catalog.slice(0,80).map(function(x){ return '<option value="'+h(x.id)+'">'+h(x.name)+' — '+h(x.unit)+' — '+money(x.contractor_price)+'</option>'; }).join('');
      return;
    }
    sel.innerHTML = list.slice(0,80).map(function(x,i){ return '<option value="'+h(x.id)+'" '+(i===0?'selected':'')+'>'+h(x.name)+' — '+h(x.unit)+' — себ. '+money(x.contractor_price)+'</option>'; }).join('');
  }

  function quantityForTemplate(t){
    var l = n(e('quickLength') && e('quickLength').value);
    var w = n(e('quickWidth') && e('quickWidth').value);
    var p = n(e('quickPieces') && e('quickPieces').value) || 1;
    if(t.area){
      if(l <= 0 || w <= 0) throw new Error('Укажите длину и ширину для расчёта площади.');
      return roundArea(l*w*p);
    }
    return n(t.qty) || p || 1;
  }

  function calcFromCatalog(item,qty){
    qty = n(qty) || 1;
    var unitCost = n(item.contractor_price);
    var markup = n(item.markup_percent);
    var minTotal = n(item.min_client_price);
    var defaultClient = n(item.default_client_price);
    var byMarkup = unitCost * (1 + markup / 100);
    var unitClient = Math.max(byMarkup, defaultClient || 0, minTotal > 0 ? minTotal / qty : 0);
    if(item.calculation_mode === 'fixed'){
      unitClient = Math.max(defaultClient || byMarkup || unitCost, minTotal > 0 ? minTotal / qty : 0);
    }
    return {
      unitCost: Math.round(unitCost),
      unitClient: Math.round(unitClient),
      totalCost: Math.round(unitCost * qty),
      totalClient: Math.round(unitClient * qty),
      markup: markup,
      minTotal: minTotal,
      defaultClient: defaultClient
    };
  }

  async function syncPreview(){
    await loadCatalog(false);
    fillCatalogOptions();
    var t = selectedTemplate();
    var item = chosenCatalogItem();
    if(!item){
      setNote('Для шаблона <b>'+h(t.title)+'</b> не найдена активная позиция в номенклатуре. Добавьте её в базу или выберите вручную из списка.', 'warn');
      return;
    }
    try{
      var qty = quantityForTemplate(t);
      var price = calcFromCatalog(item,qty);
      setNote('Цена будет рассчитана из базы: <b>'+h(item.name)+'</b> • '+h(qty)+' '+h(item.unit)+' • себестоимость <b>'+money(price.totalCost)+'</b> • клиенту <b>'+money(price.totalClient)+'</b> • наценка '+h(price.markup)+'%'+(price.minTotal ? ' • минимум '+money(price.minTotal) : '')+'.', 'good');
    }catch(err){
      setNote('Выбран шаблон <b>'+h(t.title)+'</b> и позиция <b>'+h(item.name)+'</b>. '+h(err.message || err), 'warn');
    }
  }

  async function buildRow(){
    await loadCatalog(false);
    var key = selectedKey();
    var t = selectedTemplate();
    var item = chosenCatalogItem();
    if(!item) throw new Error('Не найдена позиция номенклатуры для шаблона «'+t.title+'». Выберите позицию вручную или добавьте её в базу.');
    var qty = quantityForTemplate(t);
    if(qty <= 0) throw new Error('Количество должно быть больше 0.');
    var price = calcFromCatalog(item,qty);
    var l = n(e('quickLength') && e('quickLength').value);
    var w = n(e('quickWidth') && e('quickWidth').value);
    var p = n(e('quickPieces') && e('quickPieces').value) || 1;
    var parts = [];
    if(t.area) parts.push('Размер: '+l+' × '+w+' м', 'изделий: '+p, 'площадь: '+qty+' м²');
    parts.push('шаблон: '+t.title, 'цена из номенклатуры: '+item.name);
    return {
      id: Date.now() + Math.random(),
      catalog_id: item.id,
      category: item.category || null,
      type: item.item_type || t.type,
      item_type: item.item_type || t.type,
      calculation_mode: item.calculation_mode || null,
      min_client_price: item.min_client_price || null,
      default_client_price: item.default_client_price || null,
      markup_percent: item.markup_percent || null,
      name: item.name || t.title,
      unit: item.unit || t.unit,
      qty: qty,
      price: price.unitCost,
      client: price.unitClient,
      comment: (t.comment || '') + ' ' + parts.join(', ') + '.',
      data: Object.assign({}, item.settings || {}, {
        quick_template: key,
        catalog_source: 'leader_catalog',
        catalog_name: item.name,
        length: t.area ? l : null,
        width: t.area ? w : null,
        pieces: p,
        area: t.area ? qty : null,
        recommended_client_price: price.unitClient,
        recommended_contractor_price: price.unitCost,
        min_total: price.minTotal,
        calculated_from_catalog_at: new Date().toISOString()
      })
    };
  }

  async function addTemplate(){
    var rs = rows();
    if(!rs) return alert('Расчёт ещё не готов. Обновите страницу.');
    try{
      var row = await buildRow();
      rs.push(row);
      renderAll();
      setNote('Позиция добавлена из номенклатуры: <b>'+h(row.name)+'</b>. Цена рассчитана по текущей себестоимости и наценке из базы.', 'good');
    }catch(err){ alert(err.message || String(err)); }
  }

  async function fillManualFields(){
    try{
      var row = await buildRow();
      if(e('itemType')) e('itemType').value = row.type;
      if(e('itemName')) e('itemName').value = row.name;
      if(e('itemUnit')) e('itemUnit').value = row.unit;
      if(e('itemQty')) e('itemQty').value = row.qty;
      if(e('itemCost')) e('itemCost').value = row.price;
      if(e('itemClient')) e('itemClient').value = row.client;
      if(e('itemComment')) e('itemComment').value = row.comment;
      setNote('Поля ручного добавления заполнены из номенклатуры. Проверьте данные и нажмите стандартную кнопку «Добавить позицию».', 'good');
    }catch(err){ alert(err.message || String(err)); }
  }

  async function addPreset(key){
    if(e('quickTemplate')) e('quickTemplate').value = key;
    fillCatalogOptions();
    if(['design','mounting','delivery'].indexOf(key) >= 0){
      await addTemplate();
    } else {
      await syncPreview();
    }
  }

  function applyMinimum(){
    var rs = rows();
    if(!rs) return alert('Расчёт ещё не готов. Обновите страницу.');
    var min = n(e('quickMinOrder') && e('quickMinOrder').value) || 1000;
    var t = calcTotals();
    if(t.total <= 0) return alert('Сначала добавьте основную позицию с ценой клиенту.');
    if(t.total >= min){
      setNote('Минимальная сумма уже соблюдена: клиенту '+money(t.total)+', минимум '+money(min)+'.', 'good');
      return;
    }
    var diff = Math.round(min - t.total);
    var existing = rs.find(function(r){ return r && r.data && r.data.quick_min_order_adjustment; });
    if(existing){
      existing.client = diff;
      existing.comment = 'Автоматическая корректировка до минимальной суммы заказа '+money(min)+'.';
    } else {
      rs.push({
        id: Date.now() + Math.random(),
        type: 'Услуга',
        item_type: 'Услуга',
        name: 'Минимальная сумма заказа',
        unit: 'заказ',
        qty: 1,
        price: 0,
        client: diff,
        comment: 'Автоматическая корректировка до минимальной суммы заказа '+money(min)+'.',
        data: { quick_min_order_adjustment:true, min_order:min, recommended_client_price:diff }
      });
    }
    renderAll();
    setNote('Добавлена корректировка до минимального заказа: <b>'+money(diff)+'</b>.', 'good');
  }

  function ensure(){
    css();
    if(e('calcQuickBox')) return;
    var btn = e('addItemBtn');
    if(!btn || !btn.parentNode) return;
    var box = document.createElement('div');
    box.id = 'calcQuickBox';
    box.className = 'calc-quick-box';
    box.innerHTML = '<div class="calc-quick-head"><div><b>Быстрые шаблоны расчёта</b><span>Шаблон хранит сценарий и размеры, а цены берутся из актуальной номенклатуры: себестоимость подрядчика + наценка + минимальная сумма.</span></div><button id="quickReloadCatalogBtn" type="button">Обновить номенклатуру</button></div><div class="calc-quick-grid"><label>Шаблон<select id="quickTemplate"><option value="banner">Баннер / печать на баннере</option><option value="sticker">Наклейка / плёнка</option><option value="sign">Табличка ПВХ / вывеска</option><option value="design">Дизайн макета</option><option value="mounting">Монтаж</option><option value="delivery">Доставка</option></select></label><label>Позиция из номенклатуры<select id="quickCatalogItem"><option value="">Загружаю...</option></select></label><label>Длина, м<input id="quickLength" type="number" min="0" step="0.01" value="1"></label><label>Ширина, м<input id="quickWidth" type="number" min="0" step="0.01" value="1"></label><label>Кол-во<input id="quickPieces" type="number" min="1" step="1" value="1"></label></div><div class="calc-quick-actions"><button id="quickAddBtn" type="button" class="primary">Добавить по шаблону</button><button id="quickFillBtn" type="button">Заполнить поля ниже</button></div><div class="calc-quick-presets"><button type="button" data-quick-preset="design">+ дизайн</button><button type="button" data-quick-preset="mounting">+ монтаж</button><button type="button" data-quick-preset="delivery">+ доставка</button><button type="button" data-quick-preset="banner">баннер</button><button type="button" data-quick-preset="sticker">плёнка</button><button type="button" data-quick-preset="sign">табличка</button></div><div class="calc-quick-min"><div><b>Минимальный заказ</b><div class="calc-quick-note">Если сумма ниже минимума, CRM добавит отдельную корректирующую строку.</div></div><label>Минимум, ₽<input id="quickMinOrder" type="number" min="0" step="100" value="1000"></label><button id="quickMinBtn" type="button">Довести до минимума</button></div><div id="calcQuickNote" class="calc-quick-note"></div>';
    btn.parentNode.insertBefore(box, btn);
    e('quickTemplate').addEventListener('change', function(){ fillCatalogOptions(); syncPreview(); });
    e('quickCatalogItem').addEventListener('change', syncPreview);
    ['quickLength','quickWidth','quickPieces','quickMinOrder'].forEach(function(id){ if(e(id)) e(id).addEventListener('input', syncPreview); });
    e('quickAddBtn').onclick = addTemplate;
    e('quickFillBtn').onclick = fillManualFields;
    e('quickMinBtn').onclick = applyMinimum;
    e('quickReloadCatalogBtn').onclick = function(){ loadCatalog(true).then(syncPreview); };
    box.addEventListener('click', function(ev){ var b = ev.target && ev.target.closest ? ev.target.closest('[data-quick-preset]') : null; if(b) addPreset(b.dataset.quickPreset); });
    loadCatalog(false).then(syncPreview);
  }

  function boot(){
    ensure();
    document.querySelectorAll('[data-page="calc"]').forEach(function(tab){
      if(!tab.dataset.calcQuick){
        tab.dataset.calcQuick = '1';
        tab.addEventListener('click', function(){ setTimeout(ensure, 300); setTimeout(function(){ loadCatalog(false).then(syncPreview); }, 500); });
      }
    });
  }

  window.LeaderV2CalcQuick = { ensure:ensure, addTemplate:addTemplate, applyMinimum:applyMinimum, loadCatalog:loadCatalog };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(boot, 1200); });
  else setTimeout(boot, 900);
})();
