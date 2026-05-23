(function(){
  function e(id){ return document.getElementById(id); }
  function n(v){ var x = Number(v); return Number.isFinite(x) ? x : 0; }
  function money(v){ return Math.round(n(v)).toLocaleString('ru-RU') + ' ₽'; }
  function h(s){ return String(s == null ? '' : s).replace(/[&<>"]/g,function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]; }); }
  function st(){ try { return window.eval('state'); } catch(x){ return null; } }

  var current = null;
  var busy = false;

  function mode(item){ return item && item.settings && item.settings.calc_ui ? item.settings.calc_ui : ((item && item.unit) === 'м²' ? 'area' : 'fixed'); }
  function costRules(item){ return item && item.settings && item.settings.cost_rules ? item.settings.cost_rules : {}; }
  function pricingRules(item){ return item && item.settings && item.settings.pricing_rules ? item.settings.pricing_rules : {}; }

  function css(){
    if(e('calcCostEngineCss')) return;
    var s = document.createElement('style');
    s.id = 'calcCostEngineCss';
    s.textContent = '.calc-risk-panel{margin-top:10px;padding:10px;border-radius:12px;border:1px solid var(--line);background:#fff}.calc-risk-panel.good{background:#f0fdf4;color:#166534}.calc-risk-panel.warn{background:#fffbeb;color:#92400e}.calc-risk-panel.bad{background:#fef2f2;color:#991b1b}.calc-risk-panel b{display:block;margin-bottom:4px}.calc-risk-panel ul{margin:6px 0 0 18px;padding:0}.calc-risk-panel li{margin:2px 0}.calc-row-warn{outline:1px solid #f59e0b}.calc-row-bad{outline:1px solid #dc2626}.calc-engine-note{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.35}';
    document.head.appendChild(s);
  }

  async function getCurrentItem(){
    var sel = e('catalogItem');
    if(!sel || !sel.value || !window.db) return null;
    var r = await window.db.from('leader_catalog').select('id,name,unit,item_type,category,contractor_price,default_client_price,min_client_price,markup_percent,calculation_mode,settings').eq('id', sel.value).maybeSingle();
    if(r.error) return null;
    current = r.data || null;
    return current;
  }

  function advancedData(item){
    var m = mode(item);
    var d = { calc_ui: m };
    if(m === 'area'){
      var l = n(e('catalogLength') && e('catalogLength').value);
      var w = n(e('catalogWidth') && e('catalogWidth').value);
      var p = n(e('catalogPieces') && e('catalogPieces').value) || 1;
      d.length = l; d.width = w; d.pieces = p; d.area = n(e('itemQty') && e('itemQty').value) || (l*w*p);
    }
    if(m === 'sign_piece'){
      d.length = n(e('advLength') && e('advLength').value);
      d.width = n(e('advWidth') && e('advWidth').value);
      d.area = Number((d.length * d.width).toFixed(4));
      d.material = e('advMaterial') && e('advMaterial').value || '';
    }
    if(m === 'mounting'){
      d.height = n(e('advHeight') && e('advHeight').value);
      d.complexity = e('advComplexity') && e('advComplexity').value || '';
      d.travel = e('advTravel') && e('advTravel').value || '';
    }
    if(m === 'design'){
      d.complexity = e('advComplexity') && e('advComplexity').value || '';
      d.variants = n(e('advVariants') && e('advVariants').value) || 1;
      d.urgent = e('advUrgent') && e('advUrgent').value || 'нет';
    }
    if(m === 'placement'){
      d.platform = e('advPlatform') && e('advPlatform').value || '';
      d.days = n(e('advDays') && e('advDays').value) || 1;
      d.content = e('advContent') && e('advContent').value || '';
    }
    return d;
  }

  function calculate(item){
    if(!item) return null;
    var m = mode(item), cr = costRules(item), pr = pricingRules(item), d = advancedData(item);
    var qty = n(e('itemQty') && e('itemQty').value) || 1;
    var baseCost = n(item.contractor_price);
    var defaultClient = n(item.default_client_price) || n(e('itemClient') && e('itemClient').value) || n(item.min_client_price) || 0;
    var minClient = n(item.min_client_price);
    var client = n(e('itemClient') && e('itemClient').value) || defaultClient;
    var unitCost = baseCost;
    var explain = [];

    if(m === 'area'){
      var area = Math.max(n(d.area), n(cr.min_billable_area_m2) || 0);
      var waste = 1 + (n(cr.waste_percent) || 0) / 100;
      unitCost = baseCost * waste;
      qty = area;
      explain.push('себестоимость с отходами +' + (n(cr.waste_percent)||0) + '%');
    }

    if(m === 'sign_piece'){
      var area2 = Math.max(n(d.area), n(cr.base_area_m2) || 0.06);
      var baseArea = n(cr.base_area_m2) || 0.06;
      var mat = cr.material_multiplier && cr.material_multiplier[d.material] ? n(cr.material_multiplier[d.material]) : 1;
      unitCost = (baseCost * (area2 / baseArea) * mat) + (n(cr.work_cost) || 0);
      var prMat = pr.material_multiplier && pr.material_multiplier[d.material] ? n(pr.material_multiplier[d.material]) : mat;
      client = Math.max(defaultClient * (area2 / baseArea) * prMat, minClient);
      explain.push('площадь ' + area2 + ' м²');
      explain.push('материал ×' + mat);
    }

    if(m === 'mounting'){
      var cm = cr.complexity_multiplier && cr.complexity_multiplier[d.complexity] ? n(cr.complexity_multiplier[d.complexity]) : 1;
      unitCost = (n(cr.base_cost) || baseCost || 0) * cm;
      if(d.height > (n(cr.height_threshold_m) || 3)) unitCost += n(cr.height_surcharge) || 0;
      if(d.travel) unitCost += n(cr.travel_surcharge) || 0;
      explain.push('себестоимость монтажа: сложность ×' + cm);
    }

    if(m === 'design'){
      var hoursMap = cr.hours_by_complexity || {};
      var hours = n(hoursMap[d.complexity]) || 0.5;
      hours += Math.max((n(d.variants)||1)-1,0) * (n(cr.extra_variant_hours)||0.35);
      var urgent = d.urgent === 'да' ? (n(cr.urgent_multiplier)||1.25) : 1;
      unitCost = hours * (n(cr.internal_hour_rate)||600) * urgent;
      explain.push('внутренняя работа: ' + hours.toFixed(1) + ' ч.');
    }

    if(m === 'placement'){
      var contentCost = cr.content_cost && cr.content_cost[d.content] ? n(cr.content_cost[d.content]) : 0;
      var platformCost = cr.platform_internal_cost && cr.platform_internal_cost[d.platform] ? n(cr.platform_internal_cost[d.platform]) : 0;
      unitCost = (n(cr.base_internal_cost)||0) + contentCost + platformCost;
      explain.push('внутренняя себестоимость размещения');
    }

    if(item.calculation_mode === 'markup' && !['sign_piece','mounting','design','placement'].includes(m)){
      var byMarkup = unitCost * (1 + n(item.markup_percent)/100);
      var byMin = minClient > 0 ? minClient / qty : 0;
      client = Math.max(byMarkup, byMin, client);
    }

    client = Math.max(n(client), minClient || 0);
    return { qty: qty, unitCost: Math.round(unitCost), client: Math.round(client), data: d, explain: explain };
  }

  function applyToFields(calc){
    if(!calc) return;
    if(e('itemQty')) e('itemQty').value = calc.qty;
    if(e('itemCost')) e('itemCost').value = calc.unitCost;
    if(e('itemClient')) e('itemClient').value = calc.client;
    var note = e('catalogPriceNote');
    if(note){
      note.style.display = 'block';
      note.innerHTML = 'Рекомендовано: клиенту <b>' + money(calc.client) + '</b>, себестоимость <b>' + money(calc.unitCost) + '</b>' + (calc.explain.length ? ' • ' + h(calc.explain.join(', ')) : '');
    }
  }

  async function recalc(){
    if(busy) return;
    busy = true;
    try{
      var item = await getCurrentItem();
      if(!item) return;
      var calc = calculate(item);
      applyToFields(calc);
    } finally { busy = false; }
  }

  function rowRisks(row){
    var qty = n(row.qty), cost = n(row.price) * qty, total = n(row.client) * qty, profit = total - cost;
    var risks = [];
    if(total <= 0) risks.push('цена клиенту не указана');
    if(cost <= 0 && ['Дизайн','Монтаж','Услуга','Изготовление'].indexOf(row.type || row.item_type || '') >= 0) risks.push('себестоимость 0 ₽ — проверьте внутренние затраты');
    if(profit < 0) risks.push('позиция убыточная');
    if(total > 0 && profit / total < 0.2) risks.push('маржа позиции ниже 20%');
    if(row.data && row.data.recommended_client_price && n(row.client) < n(row.data.recommended_client_price)) risks.push('цена ниже рекомендованной');
    return risks;
  }

  function renderRiskPanel(){
    css();
    var summary = e('calcFinalSummary');
    if(!summary) return;
    var panel = e('calcRiskPanel');
    if(!panel){
      panel = document.createElement('div');
      panel.id = 'calcRiskPanel';
      panel.className = 'calc-risk-panel';
      summary.insertAdjacentElement('afterend', panel);
    }
    var s = st();
    var rows = s && Array.isArray(s.rows) ? s.rows : [];
    var all = [];
    rows.forEach(function(r,i){ rowRisks(r).forEach(function(x){ all.push('Позиция ' + (i+1) + ': ' + x); }); });
    var cost = rows.reduce(function(a,r){ return a+n(r.price)*n(r.qty); },0);
    var total = rows.reduce(function(a,r){ return a+n(r.client)*n(r.qty); },0);
    var profit = total - cost;
    var percent = total > 0 ? Math.round(profit/total*100) : 0;
    if(rows.length && profit < 0) all.unshift('Заказ убыточный');
    else if(rows.length && percent < 20) all.unshift('Маржа заказа ниже 20%');
    panel.className = 'calc-risk-panel ' + (!rows.length ? '' : all.some(function(x){return x.indexOf('убыточ')>=0 || x.indexOf('не указана')>=0}) ? 'bad' : (all.length ? 'warn' : 'good'));
    if(!rows.length) panel.innerHTML = '<b>Финансовая проверка</b>Добавьте позиции, чтобы проверить маржу и риски.';
    else if(!all.length) panel.innerHTML = '<b>Финансовая проверка</b>Критичных замечаний нет. Плановая маржа: ' + percent + '%.';
    else panel.innerHTML = '<b>Финансовая проверка</b><ul>' + all.slice(0,8).map(function(x){return '<li>'+h(x)+'</li>';}).join('') + '</ul>';
  }

  function saveCalcToLastRow(){
    var item = current;
    var s = st();
    if(!item || !s || !Array.isArray(s.rows) || !s.rows.length) return;
    var row = s.rows[s.rows.length-1];
    var calc = calculate(item);
    if(calc){
      row.price = calc.unitCost;
      row.client = calc.client;
      row.qty = calc.qty;
      row.data = Object.assign({}, row.data || {}, calc.data || {}, { recommended_client_price: calc.client, recommended_contractor_price: calc.unitCost });
    }
    try{ if(window.LeaderV2CalcEditor && window.LeaderV2CalcEditor.render) window.LeaderV2CalcEditor.render(); }catch(x){}
  }

  function bind(){
    css();
    var ids = ['catalogItem','catalogLength','catalogWidth','catalogPieces','advLength','advWidth','advMaterial','advHeight','advComplexity','advTravel','advVariants','advUrgent','advPlatform','advDays','advContent'];
    ids.forEach(function(id){ var x=e(id); if(x && !x.dataset.costEngine){ x.dataset.costEngine='1'; x.addEventListener('input', function(){ setTimeout(recalc,120); }); x.addEventListener('change', function(){ setTimeout(recalc,120); }); } });
    var add = e('addItemBtn');
    if(add && !add.dataset.costEngine){ add.dataset.costEngine='1'; add.addEventListener('click', function(){ setTimeout(saveCalcToLastRow,260); }, true); }
    document.addEventListener('input', function(ev){ if(ev.target && ev.target.closest && ev.target.closest('#calc')) setTimeout(renderRiskPanel,120); });
    document.addEventListener('click', function(ev){ if(ev.target && ev.target.closest && ev.target.closest('#calc')) setTimeout(function(){ bind(); renderRiskPanel(); },220); });
    setInterval(function(){ bind(); renderRiskPanel(); },2500);
    renderRiskPanel();
  }

  window.LeaderCalcEngine = { recalc: recalc, renderRiskPanel: renderRiskPanel, calculate: calculate };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(bind,1600); }); else setTimeout(bind,1200);
})();
