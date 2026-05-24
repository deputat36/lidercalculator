(function(){
  var syncing = false;

  function e(id){ return document.getElementById(id); }
  function n(v){ var x = Number(v); return Number.isFinite(x) ? x : 0; }
  function h(s){ return String(s == null ? '' : s).replace(/[&<>\"]/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]; }); }

  function css(){
    if(e('templateSettingsCss')) return;
    var s = document.createElement('style');
    s.id = 'templateSettingsCss';
    s.textContent = '.template-settings-editor{grid-column:1/-1;border:1px solid var(--line);border-radius:14px;background:#f9fafb;padding:12px;margin-top:2px}.template-settings-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.template-settings-head b{font-size:14px}.template-settings-head span{display:block;color:var(--muted);font-size:12px;line-height:1.4;margin-top:3px}.template-settings-actions{display:flex;gap:7px;flex-wrap:wrap}.template-settings-actions button{padding:7px 9px;border-radius:9px;font-size:12px}.template-settings-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.template-settings-grid label{font-size:11px;font-weight:900;color:#374151}.template-settings-grid input,.template-settings-grid select{margin-top:4px}.template-settings-checks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:10px}.template-settings-checks label{display:flex;gap:8px;align-items:center;border:1px solid var(--line);border-radius:12px;background:#fff;padding:9px;font-size:12px;font-weight:800;color:#374151}.template-settings-checks input{width:auto;margin:0}.template-settings-note{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.4}.template-settings-note.good{color:#166534}.template-settings-note.bad{color:#991b1b}.template-settings-note.warn{color:#92400e}@media(max-width:860px){.template-settings-grid,.template-settings-checks{grid-template-columns:1fr 1fr}}@media(max-width:560px){.template-settings-grid,.template-settings-checks{grid-template-columns:1fr}.template-settings-actions button{width:100%}}';
    document.head.appendChild(s);
  }

  function getSettings(){
    var ta = e('templateFormSettings');
    if(!ta) return {};
    try{
      var obj = JSON.parse(ta.value || '{}');
      return obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {};
    }catch(err){
      setNote('Ошибка JSON-настроек: ' + err.message, 'bad');
      return {};
    }
  }

  function writeSettings(obj){
    var ta = e('templateFormSettings');
    if(!ta) return;
    syncing = true;
    ta.value = JSON.stringify(obj || {}, null, 2);
    syncing = false;
    setNote('JSON настроек обновлён визуальным редактором.', 'good');
  }

  function setNote(text, cls){
    var x = e('templateSettingsNote');
    if(!x) return;
    x.className = 'template-settings-note ' + (cls || '');
    x.textContent = text;
  }

  function checked(id, value){
    var x = e(id);
    if(x) x.checked = !!value;
  }

  function value(id, v){
    var x = e(id);
    if(x) x.value = v == null ? '' : String(v);
  }

  function render(){
    var settings = getSettings();
    var fields = settings.fields || {};
    var flags = settings.flags || {};
    checked('tsFieldWidth', fields.width !== false);
    checked('tsFieldHeight', fields.height !== false);
    checked('tsFieldPieces', fields.pieces !== false);
    checked('tsFlagDesign', !!flags.design);
    checked('tsFlagMounting', !!flags.mounting);
    checked('tsFlagDelivery', !!flags.delivery);
    checked('tsFlagUrgent', !!flags.urgent);
    value('tsMinOrder', n(settings.min_order) || 0);
    value('tsQuickKey', settings.quick_key || '');
    value('tsDefaultDeadline', n(settings.default_deadline_days) || '');
    value('tsUrgentMarkup', n(settings.urgent_markup_percent) || '');
  }

  function collect(){
    var settings = getSettings();
    settings.fields = settings.fields && typeof settings.fields === 'object' ? settings.fields : {};
    settings.flags = settings.flags && typeof settings.flags === 'object' ? settings.flags : {};

    settings.fields.width = !!(e('tsFieldWidth') && e('tsFieldWidth').checked);
    settings.fields.height = !!(e('tsFieldHeight') && e('tsFieldHeight').checked);
    settings.fields.pieces = !!(e('tsFieldPieces') && e('tsFieldPieces').checked);

    settings.min_order = n(e('tsMinOrder') && e('tsMinOrder').value);
    settings.quick_key = e('tsQuickKey') && e('tsQuickKey').value ? e('tsQuickKey').value.trim() : '';

    var deadline = n(e('tsDefaultDeadline') && e('tsDefaultDeadline').value);
    if(deadline > 0) settings.default_deadline_days = Math.round(deadline);
    else delete settings.default_deadline_days;

    var urgentMarkup = n(e('tsUrgentMarkup') && e('tsUrgentMarkup').value);
    if(urgentMarkup > 0) settings.urgent_markup_percent = urgentMarkup;
    else delete settings.urgent_markup_percent;

    settings.flags.design = !!(e('tsFlagDesign') && e('tsFlagDesign').checked);
    settings.flags.mounting = !!(e('tsFlagMounting') && e('tsFlagMounting').checked);
    settings.flags.delivery = !!(e('tsFlagDelivery') && e('tsFlagDelivery').checked);
    settings.flags.urgent = !!(e('tsFlagUrgent') && e('tsFlagUrgent').checked);

    Object.keys(settings.flags).forEach(function(k){ if(!settings.flags[k]) delete settings.flags[k]; });
    if(!Object.keys(settings.flags).length) delete settings.flags;
    if(!settings.quick_key) delete settings.quick_key;

    return settings;
  }

  function saveFromVisual(){
    writeSettings(collect());
  }

  function defaultsByItems(){
    var items = [];
    try{ items = JSON.parse((e('templateFormItems') && e('templateFormItems').value) || '[]'); }catch(err){}
    if(!Array.isArray(items)) items = [];
    var hasArea = items.some(function(it){ return it && it.qty_mode === 'area'; });
    var hasDesign = items.some(function(it){ return /дизайн|макет|верст|вёрст/i.test([it.label, (it.catalog_match_terms || []).join(' ')].join(' ')); });
    var hasMounting = items.some(function(it){ return /монтаж|установка|поклей/i.test([it.label, (it.catalog_match_terms || []).join(' ')].join(' ')); });
    var hasDelivery = items.some(function(it){ return /доставка|выезд|курьер/i.test([it.label, (it.catalog_match_terms || []).join(' ')].join(' ')); });
    var settings = getSettings();
    settings.fields = { width: hasArea, height: hasArea, pieces: true };
    settings.min_order = n(settings.min_order) || (hasMounting ? 2500 : hasArea ? 1000 : 0);
    settings.flags = settings.flags || {};
    settings.flags.design = hasDesign;
    settings.flags.mounting = hasMounting;
    settings.flags.delivery = hasDelivery;
    Object.keys(settings.flags).forEach(function(k){ if(!settings.flags[k]) delete settings.flags[k]; });
    if(!Object.keys(settings.flags).length) delete settings.flags;
    writeSettings(settings);
    render();
    setNote('Настройки подобраны по позициям шаблона.', 'good');
  }

  function ensureEditor(){
    css();
    var ta = e('templateFormSettings');
    if(!ta || e('templateSettingsEditor')) return;
    var wrap = document.createElement('div');
    wrap.id = 'templateSettingsEditor';
    wrap.className = 'template-settings-editor';
    wrap.innerHTML = '<div class="template-settings-head"><div><b>Визуальный редактор настроек</b><span>Задаёт поля, минимальный заказ и служебные признаки шаблона. JSON ниже обновляется автоматически.</span></div><div class="template-settings-actions"><button type="button" id="tsDefaultsBtn">Подобрать по позициям</button><button type="button" id="tsFromJsonBtn">Собрать из JSON</button><button type="button" id="tsToJsonBtn">Записать в JSON</button></div></div><div class="template-settings-grid"><label>Минимальный заказ, ₽<input id="tsMinOrder" type="number" min="0" step="100"></label><label>Ключ шаблона<input id="tsQuickKey" placeholder="banner_full"></label><label>Срок по умолчанию, дней<input id="tsDefaultDeadline" type="number" min="0" step="1"></label><label>Срочная наценка, %<input id="tsUrgentMarkup" type="number" min="0" step="1"></label></div><div class="template-settings-checks"><label><input id="tsFieldWidth" type="checkbox"> Поле длина</label><label><input id="tsFieldHeight" type="checkbox"> Поле ширина</label><label><input id="tsFieldPieces" type="checkbox"> Поле количество</label><label><input id="tsFlagDesign" type="checkbox"> Есть дизайн</label><label><input id="tsFlagMounting" type="checkbox"> Есть монтаж</label><label><input id="tsFlagDelivery" type="checkbox"> Есть доставка</label><label><input id="tsFlagUrgent" type="checkbox"> Возможна срочность</label></div><div id="templateSettingsNote" class="template-settings-note"></div>';
    var label = ta.closest('label');
    if(label && label.parentNode) label.parentNode.insertBefore(wrap, label);
    else ta.parentNode.insertBefore(wrap, ta);

    wrap.addEventListener('input', saveFromVisual);
    wrap.addEventListener('change', saveFromVisual);
    e('tsDefaultsBtn').onclick = defaultsByItems;
    e('tsFromJsonBtn').onclick = render;
    e('tsToJsonBtn').onclick = saveFromVisual;
    ta.addEventListener('input', function(){ if(!syncing) setTimeout(render, 120); });
    render();
  }

  function observe(){
    var timer = null;
    var mo = new MutationObserver(function(){
      clearTimeout(timer);
      timer = setTimeout(ensureEditor, 120);
    });
    mo.observe(document.body, { childList:true, subtree:true });
    setInterval(ensureEditor, 1500);
  }

  window.LeaderV2TemplateSettingsEditor = { ensure: ensureEditor, render: render, collect: collect };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(observe, 1200); });
  else setTimeout(observe, 900);
})();
