(function(){
  var catalog = [];
  var catalogLoaded = false;
  var syncing = false;

  function e(id){ return document.getElementById(id); }
  function h(s){ return String(s == null ? '' : s).replace(/[&<>\"]/g, function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]; }); }
  function n(v){ var x = Number(v); return Number.isFinite(x) ? x : 0; }
  function val(id){ var x = e(id); return x && x.value != null ? String(x.value).trim() : ''; }
  function money(v){ return Math.round(n(v)).toLocaleString('ru-RU') + ' ₽'; }

  function css(){
    if(e('templateItemsCss')) return;
    var s = document.createElement('style');
    s.id = 'templateItemsCss';
    s.textContent = '.template-items-editor{grid-column:1/-1;border:1px solid var(--line);border-radius:14px;background:#f9fafb;padding:12px;margin-top:2px}.template-items-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.template-items-head b{font-size:14px}.template-items-head span{display:block;color:var(--muted);font-size:12px;line-height:1.4;margin-top:3px}.template-items-actions{display:flex;gap:7px;flex-wrap:wrap}.template-items-actions button{padding:7px 9px;border-radius:9px;font-size:12px}.template-items-list{display:grid;gap:10px}.template-items-row{border:1px solid var(--line);border-radius:12px;background:#fff;padding:10px}.template-items-row-grid{display:grid;grid-template-columns:110px 1fr 140px 100px;gap:8px;align-items:end}.template-items-row-grid label{font-size:11px;font-weight:900;color:#374151}.template-items-row-grid input,.template-items-row-grid select{margin-top:4px}.template-items-row-extra{display:grid;grid-template-columns:1fr 1fr auto;gap:8px;align-items:end;margin-top:8px}.template-items-row-extra label{font-size:11px;font-weight:900;color:#374151}.template-items-row-extra input{margin-top:4px}.template-items-note{margin-top:8px;color:var(--muted);font-size:12px;line-height:1.4}.template-items-note.good{color:#166534}.template-items-note.bad{color:#991b1b}.template-items-note.warn{color:#92400e}.template-items-row-remove{padding:8px 10px;border-radius:9px;background:#fee2e2;color:#991b1b;border:1px solid #fecaca;font-weight:900}@media(max-width:860px){.template-items-row-grid,.template-items-row-extra{grid-template-columns:1fr}.template-items-actions button,.template-items-row-remove{width:100%}}';
    document.head.appendChild(s);
  }

  async function ensureSession(){
    if(!window.db || !window.db.auth) throw new Error('Supabase ещё не готов');
    var r = await window.db.auth.getSession();
    if(!r.data || !r.data.session) throw new Error('Сначала войдите в CRM');
  }

  async function loadCatalog(force){
    if(catalogLoaded && !force) return catalog;
    await ensureSession();
    var r = await window.db.from('leader_catalog').select('id,category,name,unit,contractor_price,item_type,markup_percent,min_client_price,default_client_price,description,is_active').eq('is_active', true).order('category', {ascending:true}).order('name', {ascending:true});
    if(r.error) throw new Error(r.error.message);
    catalog = r.data || [];
    catalogLoaded = true;
    return catalog;
  }

  function parseItems(){
    try{
      var text = val('templateFormItems');
      var arr = text ? JSON.parse(text) : [];
      return Array.isArray(arr) ? arr : [];
    }catch(err){
      setNote('Ошибка JSON: ' + err.message, 'bad');
      return [];
    }
  }

  function writeItems(items){
    syncing = true;
    if(e('templateFormItems')) e('templateFormItems').value = JSON.stringify(items, null, 2);
    syncing = false;
    setNote('JSON позиций обновлён редактором.', 'good');
  }

  function setNote(text, cls){
    var x = e('templateItemsNote');
    if(!x) return;
    x.className = 'template-items-note ' + (cls || '');
    x.textContent = text;
  }

  function catalogOptions(selected){
    var html = '<option value="">Не выбрано — искать по ключевым словам</option>';
    var lastCat = null;
    catalog.forEach(function(c){
      var cat = c.category || 'Без категории';
      if(cat !== lastCat){
        if(lastCat !== null) html += '</optgroup>';
        html += '<optgroup label="' + h(cat) + '">';
        lastCat = cat;
      }
      html += '<option value="' + h(c.id) + '" ' + (String(selected || '') === String(c.id) ? 'selected' : '') + '>' + h(c.name) + ' — ' + h(c.unit || 'ед.') + ' — себ. ' + money(c.contractor_price) + '</option>';
    });
    if(lastCat !== null) html += '</optgroup>';
    return html;
  }

  function defaultTerms(catalogId, currentTerms){
    if(currentTerms && currentTerms.length) return currentTerms;
    var c = catalog.find(function(x){ return String(x.id) === String(catalogId); });
    if(!c) return [];
    var parts = String(c.name || '').toLowerCase().split(/[\s,.;:()\/\\-]+/).map(function(x){ return x.trim(); }).filter(function(x){ return x.length >= 4; });
    return Array.from(new Set(parts)).slice(0, 5);
  }

  function render(){
    var host = e('templateItemsList');
    if(!host) return;
    var items = parseItems();
    if(!items.length){
      host.innerHTML = '<div class="template-items-note warn">В шаблоне пока нет позиций. Нажмите «Добавить позицию».</div>';
      return;
    }
    host.innerHTML = items.map(function(it, i){
      var terms = Array.isArray(it.catalog_match_terms) ? it.catalog_match_terms.join(', ') : '';
      return '<div class="template-items-row" data-template-item-index="' + i + '">' +
        '<div class="template-items-row-grid">' +
          '<label>Роль<select data-ti-field="role"><option value="main" ' + (it.role === 'main' ? 'selected' : '') + '>Основная</option><option value="additional" ' + (it.role === 'additional' ? 'selected' : '') + '>Дополнительная</option></select></label>' +
          '<label>Позиция номенклатуры<select data-ti-field="catalog_id">' + catalogOptions(it.catalog_id || '') + '</select></label>' +
          '<label>Расчёт<select data-ti-field="qty_mode"><option value="area" ' + (it.qty_mode === 'area' ? 'selected' : '') + '>По площади</option><option value="fixed" ' + (it.qty_mode !== 'area' ? 'selected' : '') + '>Фиксированно</option></select></label>' +
          '<label>Кол-во<input data-ti-field="qty" type="number" min="0" step="0.01" value="' + h(it.qty || (it.qty_mode === 'area' ? '' : 1)) + '"></label>' +
        '</div>' +
        '<div class="template-items-row-extra">' +
          '<label>Название в шаблоне<input data-ti-field="label" value="' + h(it.label || '') + '" placeholder="Например: Баннер"></label>' +
          '<label>Ключевые слова<input data-ti-field="catalog_match_terms" value="' + h(terms) + '" placeholder="баннер, печать баннер"></label>' +
          '<button type="button" class="template-items-row-remove" data-ti-remove="' + i + '">Удалить</button>' +
        '</div>' +
      '</div>';
    }).join('');
  }

  function collectFromDom(){
    var items = [];
    document.querySelectorAll('[data-template-item-index]').forEach(function(row){
      var item = {};
      var role = row.querySelector('[data-ti-field="role"]');
      var catalogId = row.querySelector('[data-ti-field="catalog_id"]');
      var qtyMode = row.querySelector('[data-ti-field="qty_mode"]');
      var qty = row.querySelector('[data-ti-field="qty"]');
      var label = row.querySelector('[data-ti-field="label"]');
      var terms = row.querySelector('[data-ti-field="catalog_match_terms"]');
      item.role = role ? role.value : 'main';
      item.label = label && label.value ? label.value.trim() : 'Позиция';
      if(catalogId && catalogId.value) item.catalog_id = catalogId.value;
      item.catalog_match_terms = (terms && terms.value ? terms.value : '').split(',').map(function(x){ return x.trim(); }).filter(Boolean);
      item.qty_mode = qtyMode ? qtyMode.value : 'fixed';
      if(item.qty_mode !== 'area') item.qty = n(qty && qty.value) || 1;
      item.required = item.role === 'main';
      items.push(item);
    });
    return items;
  }

  function saveFromDom(){ writeItems(collectFromDom()); render(); }
  function addItem(){ var items = parseItems(); items.push({role:items.length?'additional':'main', label:items.length?'Дополнительная позиция':'Основная позиция', catalog_match_terms:[], qty_mode:items.length?'fixed':'area', qty:items.length?1:undefined, required:!items.length}); writeItems(items); render(); }
  function applyCatalogDefaults(row){
    var items = collectFromDom();
    var index = Number(row.dataset.templateItemIndex);
    var item = items[index];
    if(!item) return;
    var c = catalog.find(function(x){ return String(x.id) === String(item.catalog_id); });
    if(c){
      if(!item.label || item.label === 'Позиция' || item.label === 'Основная позиция' || item.label === 'Дополнительная позиция') item.label = c.name;
      item.catalog_match_terms = defaultTerms(item.catalog_id, item.catalog_match_terms);
      if(c.unit === 'м²') item.qty_mode = 'area';
      else if(!item.qty_mode) item.qty_mode = 'fixed';
    }
    writeItems(items);
    render();
  }

  async function ensureEditor(){
    css();
    var textarea = e('templateFormItems');
    if(!textarea || e('templateItemsEditor')) return;
    try{ await loadCatalog(false); }catch(err){ catalog = []; }
    var wrap = document.createElement('div');
    wrap.id = 'templateItemsEditor';
    wrap.className = 'template-items-editor';
    wrap.innerHTML = '<div class="template-items-head"><div><b>Редактор позиций шаблона</b><span>Выберите номенклатуру и способ расчёта. JSON ниже обновляется автоматически.</span></div><div class="template-items-actions"><button type="button" id="templateItemsAddBtn">Добавить позицию</button><button type="button" id="templateItemsRefreshBtn">Обновить номенклатуру</button><button type="button" id="templateItemsFromJsonBtn">Собрать из JSON</button></div></div><div id="templateItemsList" class="template-items-list"></div><div id="templateItemsNote" class="template-items-note"></div>';
    var label = textarea.closest('label');
    if(label && label.parentNode) label.parentNode.insertBefore(wrap, label);
    else textarea.parentNode.insertBefore(wrap, textarea);
    e('templateItemsAddBtn').onclick = addItem;
    e('templateItemsRefreshBtn').onclick = function(){ catalogLoaded = false; loadCatalog(true).then(function(){ render(); setNote('Номенклатура обновлена.', 'good'); }).catch(function(err){ setNote(err.message || String(err), 'bad'); }); };
    e('templateItemsFromJsonBtn').onclick = render;
    wrap.addEventListener('change', function(ev){ var row = ev.target.closest('[data-template-item-index]'); if(!row) return; if(ev.target.dataset.tiField === 'catalog_id') applyCatalogDefaults(row); else saveFromDom(); });
    wrap.addEventListener('input', function(){ saveFromDom(); });
    wrap.addEventListener('click', function(ev){ var b = ev.target.closest('[data-ti-remove]'); if(!b) return; var items = collectFromDom(); items.splice(Number(b.dataset.tiRemove), 1); writeItems(items); render(); });
    textarea.addEventListener('input', function(){ if(!syncing) setTimeout(render, 120); });
    render();
  }

  function observe(){
    var timer = null;
    var mo = new MutationObserver(function(){ clearTimeout(timer); timer = setTimeout(function(){ ensureEditor(); }, 120); });
    mo.observe(document.body, { childList:true, subtree:true });
    setInterval(ensureEditor, 1500);
  }
  window.LeaderV2TemplateItemsEditor = { ensure: ensureEditor, render: render, loadCatalog: loadCatalog };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(observe, 1200); }); else setTimeout(observe, 900);
})();
