(function(){
  function e(id){ return document.getElementById(id); }
  function q(s,r){ return (r || document).querySelector(s); }
  function n(v){ var x = Number(v); return Number.isFinite(x) ? x : 0; }
  function money(v){ return Math.round(n(v)).toLocaleString('ru-RU') + ' ₽'; }
  function h(s){ return String(s == null ? '' : s).replace(/[&<>\"]/g,function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]; }); }
  function st(){ try { return window.eval('state'); } catch(x){ return null; } }

  var templates = {
    banner: {
      title: 'Баннер / печать на баннере',
      type: 'Изготовление',
      name: 'Баннер с печатью',
      unit: 'м²',
      cost: 450,
      client: 850,
      minTotal: 1200,
      comment: 'Быстрый шаблон: баннер. Проверьте плотность, люверсы, подгиб и монтаж.'
    },
    sticker: {
      title: 'Наклейка / плёнка',
      type: 'Изготовление',
      name: 'Наклейка / плёнка с печатью',
      unit: 'м²',
      cost: 650,
      client: 1200,
      minTotal: 1000,
      comment: 'Быстрый шаблон: печать на плёнке. Проверьте ламинацию, резку и подготовку макета.'
    },
    sign: {
      title: 'Табличка ПВХ / вывеска',
      type: 'Изготовление',
      name: 'Табличка ПВХ с печатью',
      unit: 'м²',
      cost: 900,
      client: 1800,
      minTotal: 1500,
      comment: 'Быстрый шаблон: табличка/вывеска. Проверьте толщину ПВХ, крепёж и монтаж.'
    },
    design: {
      title: 'Дизайн макета',
      type: 'Дизайн',
      name: 'Дизайн макета',
      unit: 'проект',
      qty: 1,
      cost: 300,
      client: 800,
      minTotal: 800,
      comment: 'Быстрый шаблон: дизайн макета. Уточните количество вариантов и правок.'
    },
    mounting: {
      title: 'Монтаж',
      type: 'Монтаж',
      name: 'Монтаж рекламной продукции',
      unit: 'услуга',
      qty: 1,
      cost: 700,
      client: 1500,
      minTotal: 1500,
      comment: 'Быстрый шаблон: монтаж. Уточните высоту, крепёж, выезд и сложность.'
    },
    delivery: {
      title: 'Доставка',
      type: 'Доставка',
      name: 'Доставка по городу',
      unit: 'услуга',
      qty: 1,
      cost: 150,
      client: 300,
      minTotal: 300,
      comment: 'Быстрый шаблон: доставка. Уточните адрес и срочность.'
    }
  };

  function css(){
    if(e('calcQuickCss')) return;
    var s = document.createElement('style');
    s.id = 'calcQuickCss';
    s.textContent = '.calc-quick-box{margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fff}.calc-quick-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.calc-quick-head b{font-size:15px}.calc-quick-head span{display:block;color:var(--muted);font-size:12px;margin-top:3px;line-height:1.35}.calc-quick-grid{display:grid;grid-template-columns:1.2fr repeat(3,minmax(90px,.7fr));gap:10px}.calc-quick-grid label{font-size:12px;font-weight:800;color:#374151}.calc-quick-grid input,.calc-quick-grid select{margin-top:4px}.calc-quick-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.calc-quick-actions button{padding:8px 10px;border-radius:10px}.calc-quick-actions button.primary{background:#111827;color:#fff}.calc-quick-presets{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.calc-quick-presets button{font-size:12px;padding:7px 9px;border-radius:999px;background:#f9fafb;border:1px solid var(--line)}.calc-quick-note{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.4}.calc-quick-min{display:grid;grid-template-columns:1fr 160px auto;gap:8px;align-items:end;margin-top:12px;padding-top:12px;border-top:1px dashed var(--line)}.calc-quick-min label{font-size:12px;font-weight:800;color:#374151}.calc-quick-min input{margin-top:4px}@media(max-width:900px){.calc-quick-grid,.calc-quick-min{grid-template-columns:1fr}.calc-quick-actions button,.calc-quick-presets button{flex:1}}';
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

  function selectedTemplate(){
    var key = e('quickTemplate') ? e('quickTemplate').value : 'banner';
    return templates[key] || templates.banner;
  }

  function syncPreview(){
    var t = selectedTemplate();
    var areaMode = ['banner','sticker','sign'].indexOf(e('quickTemplate') ? e('quickTemplate').value : '') >= 0;
    var l = n(e('quickLength') && e('quickLength').value);
    var w = n(e('quickWidth') && e('quickWidth').value);
    var p = n(e('quickPieces') && e('quickPieces').value) || 1;
    var qty = areaMode ? roundArea(l*w*p) : (t.qty || p || 1);
    var total = Math.max(n(t.client) * qty, n(t.minTotal));
    var cost = n(t.cost) * qty;
    if(areaMode && (!l || !w)){
      setNote('Укажите длину и ширину, чтобы рассчитать площадь. Цены в шаблонах ориентировочные, перед заказом их можно отредактировать в строке расчёта.');
      return;
    }
    setNote('Будет добавлено: <b>'+h(t.name)+'</b> • '+h(qty)+' '+h(t.unit)+' • клиенту примерно <b>'+money(total)+'</b> • себестоимость <b>'+money(cost)+'</b>.');
  }

  function buildRow(){
    var key = e('quickTemplate') ? e('quickTemplate').value : 'banner';
    var t = selectedTemplate();
    var areaMode = ['banner','sticker','sign'].indexOf(key) >= 0;
    var l = n(e('quickLength') && e('quickLength').value);
    var w = n(e('quickWidth') && e('quickWidth').value);
    var p = n(e('quickPieces') && e('quickPieces').value) || 1;
    var qty = areaMode ? roundArea(l*w*p) : (t.qty || p || 1);
    if(areaMode && (l <= 0 || w <= 0)) throw new Error('Укажите длину и ширину для расчёта площади.');
    if(qty <= 0) throw new Error('Количество должно быть больше 0.');
    var unitClient = n(t.client);
    var clientTotal = Math.max(unitClient * qty, n(t.minTotal));
    var clientUnit = qty > 0 ? Math.round(clientTotal / qty) : unitClient;
    var parts = [];
    if(areaMode) parts.push('Размер: '+l+' × '+w+' м', 'изделий: '+p, 'площадь: '+qty+' м²');
    parts.push('шаблон: '+t.title);
    return {
      id: Date.now() + Math.random(),
      type: t.type,
      item_type: t.type,
      name: t.name,
      unit: t.unit,
      qty: qty,
      price: n(t.cost),
      client: clientUnit,
      comment: t.comment + ' ' + parts.join(', ') + '.',
      data: {
        quick_template: key,
        length: areaMode ? l : null,
        width: areaMode ? w : null,
        pieces: p,
        area: areaMode ? qty : null,
        recommended_client_price: clientUnit,
        recommended_contractor_price: n(t.cost),
        min_total: n(t.minTotal)
      }
    };
  }

  function addTemplate(){
    var rs = rows();
    if(!rs) return alert('Расчёт ещё не готов. Обновите страницу.');
    try{
      var row = buildRow();
      rs.push(row);
      renderAll();
      setNote('Позиция добавлена: <b>'+h(row.name)+'</b>. Теперь её можно отредактировать в таблице расчёта.');
    }catch(err){ alert(err.message || String(err)); }
  }

  function fillManualFields(){
    try{
      var row = buildRow();
      if(e('itemType')) e('itemType').value = row.type;
      if(e('itemName')) e('itemName').value = row.name;
      if(e('itemUnit')) e('itemUnit').value = row.unit;
      if(e('itemQty')) e('itemQty').value = row.qty;
      if(e('itemCost')) e('itemCost').value = row.price;
      if(e('itemClient')) e('itemClient').value = row.client;
      if(e('itemComment')) e('itemComment').value = row.comment;
      setNote('Поля ручного добавления заполнены. Проверьте данные и нажмите стандартную кнопку «Добавить позицию».');
    }catch(err){ alert(err.message || String(err)); }
  }

  function addPreset(key){
    if(e('quickTemplate')) e('quickTemplate').value = key;
    if(['design','mounting','delivery'].indexOf(key) >= 0){
      var rs = rows();
      if(!rs) return;
      rs.push(buildRow());
      renderAll();
      setNote('Быстрая услуга добавлена в расчёт.');
    } else {
      syncPreview();
    }
  }

  function applyMinimum(){
    var rs = rows();
    if(!rs) return alert('Расчёт ещё не готов. Обновите страницу.');
    var min = n(e('quickMinOrder') && e('quickMinOrder').value) || 1000;
    var t = calcTotals();
    if(t.total <= 0) return alert('Сначала добавьте основную позицию с ценой клиенту.');
    if(t.total >= min){
      setNote('Минимальная сумма уже соблюдена: клиенту '+money(t.total)+', минимум '+money(min)+'.');
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
    setNote('Добавлена корректировка до минимального заказа: <b>'+money(diff)+'</b>.');
  }

  function ensure(){
    css();
    if(e('calcQuickBox')) return;
    var btn = e('addItemBtn');
    if(!btn || !btn.parentNode) return;
    var box = document.createElement('div');
    box.id = 'calcQuickBox';
    box.className = 'calc-quick-box';
    box.innerHTML = '<div class="calc-quick-head"><div><b>Быстрые шаблоны расчёта</b><span>Для типовых заказов: баннер, плёнка, табличка, дизайн, монтаж и доставка. Все суммы можно отредактировать после добавления.</span></div></div><div class="calc-quick-grid"><label>Шаблон<select id="quickTemplate"><option value="banner">Баннер / печать на баннере</option><option value="sticker">Наклейка / плёнка</option><option value="sign">Табличка ПВХ / вывеска</option><option value="design">Дизайн макета</option><option value="mounting">Монтаж</option><option value="delivery">Доставка</option></select></label><label>Длина, м<input id="quickLength" type="number" min="0" step="0.01" value="1"></label><label>Ширина, м<input id="quickWidth" type="number" min="0" step="0.01" value="1"></label><label>Кол-во<input id="quickPieces" type="number" min="1" step="1" value="1"></label></div><div class="calc-quick-actions"><button id="quickAddBtn" type="button" class="primary">Добавить по шаблону</button><button id="quickFillBtn" type="button">Заполнить поля ниже</button></div><div class="calc-quick-presets"><button type="button" data-quick-preset="design">+ дизайн</button><button type="button" data-quick-preset="mounting">+ монтаж</button><button type="button" data-quick-preset="delivery">+ доставка</button><button type="button" data-quick-preset="banner">баннер</button><button type="button" data-quick-preset="sticker">плёнка</button><button type="button" data-quick-preset="sign">табличка</button></div><div class="calc-quick-min"><div><b>Минимальный заказ</b><div class="calc-quick-note">Если сумма ниже минимума, CRM добавит отдельную корректирующую строку.</div></div><label>Минимум, ₽<input id="quickMinOrder" type="number" min="0" step="100" value="1000"></label><button id="quickMinBtn" type="button">Довести до минимума</button></div><div id="calcQuickNote" class="calc-quick-note"></div>';
    btn.parentNode.insertBefore(box, btn);
    e('quickTemplate').addEventListener('change', syncPreview);
    ['quickLength','quickWidth','quickPieces','quickMinOrder'].forEach(function(id){ if(e(id)) e(id).addEventListener('input', syncPreview); });
    e('quickAddBtn').onclick = addTemplate;
    e('quickFillBtn').onclick = fillManualFields;
    e('quickMinBtn').onclick = applyMinimum;
    box.addEventListener('click', function(ev){ var b = ev.target && ev.target.closest ? ev.target.closest('[data-quick-preset]') : null; if(b) addPreset(b.dataset.quickPreset); });
    syncPreview();
  }

  function boot(){
    ensure();
    document.querySelectorAll('[data-page="calc"]').forEach(function(tab){
      if(!tab.dataset.calcQuick){
        tab.dataset.calcQuick = '1';
        tab.addEventListener('click', function(){ setTimeout(ensure, 300); });
      }
    });
  }

  window.LeaderV2CalcQuick = { ensure:ensure, addTemplate:addTemplate, applyMinimum:applyMinimum };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(boot, 1200); });
  else setTimeout(boot, 900);
})();
