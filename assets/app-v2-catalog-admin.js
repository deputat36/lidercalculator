(function(){
  var catalog = [];
  var loaded = false;
  var loading = false;
  var editingId = null;

  function e(id){ return document.getElementById(id); }
  function n(v){ var x = Number(v); return Number.isFinite(x) ? x : 0; }
  function h(s){ return String(s == null ? '' : s).replace(/[&<>\"]/g,function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]; }); }
  function money(v){ return Math.round(n(v)).toLocaleString('ru-RU') + ' ₽'; }
  function val(id){ var x = e(id); return x && x.value != null ? String(x.value).trim() : ''; }
  function toast(text){ try { if(typeof window.toast === 'function') window.toast(text); } catch(x){} }

  function css(){
    if(e('catalogAdminCss')) return;
    var s = document.createElement('style');
    s.id = 'catalogAdminCss';
    s.textContent = '.catalog-admin-tools{display:grid;grid-template-columns:220px 220px 1fr auto;gap:10px;margin:12px 0}.catalog-admin-metrics{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:10px 0 14px}.catalog-admin-metrics>div{background:#f9fafb;border:1px solid var(--line);border-radius:12px;padding:10px}.catalog-admin-metrics span{display:block;color:var(--muted);font-size:12px;margin-bottom:4px}.catalog-admin-metrics b{font-size:16px}.catalog-table{width:100%;border-collapse:collapse}.catalog-table th,.catalog-table td{padding:9px 8px;border-bottom:1px solid var(--line);vertical-align:top;text-align:left}.catalog-table th{font-size:12px;color:var(--muted);font-weight:900}.catalog-row-title{font-weight:900;color:#111827}.catalog-row-meta{font-size:12px;color:var(--muted);line-height:1.35;margin-top:3px}.catalog-price-grid{display:grid;grid-template-columns:repeat(2,minmax(80px,1fr));gap:4px;font-size:12px}.catalog-price-grid span{color:var(--muted)}.catalog-actions{display:flex;gap:6px;flex-wrap:wrap}.catalog-actions button{padding:7px 9px;border-radius:9px;font-size:12px}.catalog-status{display:inline-flex;border-radius:999px;padding:4px 8px;font-size:11px;font-weight:900}.catalog-status.on{background:#dcfce7;color:#166534}.catalog-status.off{background:#fee2e2;color:#991b1b}.catalog-modal{position:fixed;inset:0;background:rgba(17,24,39,.48);display:flex;align-items:center;justify-content:center;z-index:80;padding:14px}.catalog-modal.hidden{display:none}.catalog-modal-card{width:min(920px,100%);max-height:92vh;overflow:auto;background:#fff;border-radius:18px;padding:16px;box-shadow:0 24px 80px rgba(0,0,0,.25)}.catalog-form-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.catalog-form-grid label{font-size:12px;font-weight:900;color:#374151}.catalog-form-grid input,.catalog-form-grid select,.catalog-form-grid textarea{margin-top:4px}.catalog-form-grid .wide{grid-column:1/-1}.catalog-form-grid textarea{min-height:86px}.catalog-json-help{font-size:12px;color:var(--muted);line-height:1.4;margin-top:4px}.catalog-note{margin-top:10px;color:var(--muted);font-size:13px;line-height:1.45}.catalog-note.bad{color:#991b1b}.catalog-note.good{color:#166534}@media(max-width:980px){.catalog-admin-tools{grid-template-columns:1fr 1fr}.catalog-admin-metrics{grid-template-columns:1fr 1fr}.catalog-table thead{display:none}.catalog-table,.catalog-table tbody,.catalog-table tr,.catalog-table td{display:block;width:100%}.catalog-table tr{border:1px solid var(--line);border-radius:12px;margin:8px 0;padding:8px;background:#fff}.catalog-table td{border:0;padding:6px 0}.catalog-form-grid{grid-template-columns:1fr 1fr}}@media(max-width:620px){.catalog-admin-tools,.catalog-admin-metrics,.catalog-form-grid{grid-template-columns:1fr}.catalog-actions button{flex:1}}';
    document.head.appendChild(s);
  }

  async function needLogin(){
    if(!window.db || !window.db.auth) throw new Error('Supabase ещё не готов');
    var q = await window.db.auth.getSession();
    if(!q.data || !q.data.session) throw new Error('Сначала войдите в CRM');
    return q.data.session;
  }

  function defaultSettings(mode){
    if(mode === 'area') return { calc_ui:'area', cost_rules:{ waste_percent:0, min_billable_area_m2:1 } };
    if(mode === 'fixed') return { calc_ui:'fixed' };
    if(mode === 'design') return { calc_ui:'design', cost_rules:{ internal_hour_rate:600 }, pricing_rules:{} };
    if(mode === 'mounting') return { calc_ui:'mounting', cost_rules:{ base_cost:0 }, pricing_rules:{} };
    return {};
  }

  function safeJson(text){
    text = String(text || '').trim();
    if(!text) return {};
    try { return JSON.parse(text); } catch(err){ throw new Error('Ошибка в JSON-настройках: ' + err.message); }
  }

  async function load(force){
    if(loading) return catalog;
    if(loaded && !force) return catalog;
    loading = true;
    setNote('Загружаю номенклатуру...');
    try{
      await needLogin();
      var r = await window.db.from('leader_catalog').select('id,created_at,category,name,unit,contractor_price,item_type,markup_percent,min_client_price,default_client_price,calculation_mode,description,sort_order,settings,is_active').order('sort_order',{ascending:true}).order('name',{ascending:true});
      if(r.error) throw new Error(r.error.message);
      catalog = r.data || [];
      loaded = true;
      fillFilters();
      render();
      setNote('Номенклатура загружена: ' + catalog.length + ' позиций.', 'good');
      return catalog;
    }catch(err){
      setNote('Не удалось загрузить номенклатуру: ' + h(err.message || err), 'bad');
      var box = e('catalogAdminList');
      if(box) box.innerHTML = '<div class="empty">Номенклатура не загрузилась. Проверьте вход и права доступа.</div>';
      return [];
    }finally{
      loading = false;
    }
  }

  function setNote(text, cls){
    var x = e('catalogAdminNote');
    if(!x) return;
    x.className = 'catalog-note ' + (cls || '');
    x.innerHTML = text;
  }

  function categories(){
    var set = ['Все категории'];
    catalog.forEach(function(x){ if(x.category && set.indexOf(x.category) < 0) set.push(x.category); });
    return set;
  }

  function itemTypes(){
    var base = ['Все типы','Изготовление','Услуга','Дизайн','Монтаж','Доставка','Интернет-реклама','Карты и справочники','Контент','Материал','Другое'];
    catalog.forEach(function(x){ if(x.item_type && base.indexOf(x.item_type) < 0) base.push(x.item_type); });
    return base;
  }

  function fillFilters(){
    var cat = e('catalogFilterCategory');
    var type = e('catalogFilterType');
    if(cat){ var old = cat.value || 'Все категории'; cat.innerHTML = categories().map(function(x){ return '<option>'+h(x)+'</option>'; }).join(''); cat.value = categories().indexOf(old) >= 0 ? old : 'Все категории'; }
    if(type){ var old2 = type.value || 'Все типы'; type.innerHTML = itemTypes().map(function(x){ return '<option>'+h(x)+'</option>'; }).join(''); type.value = itemTypes().indexOf(old2) >= 0 ? old2 : 'Все типы'; }
  }

  function filtered(){
    var cat = e('catalogFilterCategory') ? e('catalogFilterCategory').value : 'Все категории';
    var type = e('catalogFilterType') ? e('catalogFilterType').value : 'Все типы';
    var q = val('catalogSearch').toLowerCase();
    var active = e('catalogFilterActive') ? e('catalogFilterActive').value : 'active';
    return catalog.filter(function(x){
      if(cat !== 'Все категории' && (x.category || '') !== cat) return false;
      if(type !== 'Все типы' && (x.item_type || '') !== type) return false;
      if(active === 'active' && x.is_active === false) return false;
      if(active === 'inactive' && x.is_active !== false) return false;
      if(q){
        var hay = [x.name,x.category,x.item_type,x.unit,x.description,JSON.stringify(x.settings || {})].join(' ').toLowerCase();
        if(hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }

  function renderMetrics(list){
    list = list || [];
    var active = catalog.filter(function(x){ return x.is_active !== false; }).length;
    var inactive = catalog.length - active;
    var avgMarkup = list.length ? Math.round(list.reduce(function(a,x){ return a+n(x.markup_percent); },0) / list.length) : 0;
    var avgCost = list.length ? Math.round(list.reduce(function(a,x){ return a+n(x.contractor_price); },0) / list.length) : 0;
    if(e('catalogMetricTotal')) e('catalogMetricTotal').textContent = catalog.length;
    if(e('catalogMetricActive')) e('catalogMetricActive').textContent = active;
    if(e('catalogMetricInactive')) e('catalogMetricInactive').textContent = inactive;
    if(e('catalogMetricMarkup')) e('catalogMetricMarkup').textContent = avgMarkup + '%';
    if(e('catalogMetricCost')) e('catalogMetricCost').textContent = money(avgCost);
  }

  function calcClientUnit(x){
    var cost = n(x.contractor_price);
    var markup = n(x.markup_percent);
    var byMarkup = cost * (1 + markup / 100);
    var def = n(x.default_client_price);
    return Math.max(byMarkup, def || 0, n(x.min_client_price) || 0);
  }

  function rowHtml(x){
    var settings = x.settings && typeof x.settings === 'object' ? x.settings : {};
    var mode = settings.calc_ui || x.calculation_mode || (x.unit === 'м²' ? 'area' : 'fixed');
    return '<tr data-catalog-id="'+h(x.id)+'">' +
      '<td><div class="catalog-row-title">'+h(x.name || 'Без названия')+'</div><div class="catalog-row-meta">'+h(x.category || 'Без категории')+' • '+h(x.item_type || 'Тип не указан')+' • '+h(x.unit || 'ед.')+'</div><div class="catalog-row-meta">Режим: '+h(mode)+' • сортировка: '+h(x.sort_order || 0)+'</div></td>' +
      '<td><div class="catalog-price-grid"><div><span>Себ.</span><b>'+money(x.contractor_price)+'</b></div><div><span>Наценка</span><b>'+h(n(x.markup_percent))+'%</b></div><div><span>Мин.</span><b>'+money(x.min_client_price)+'</b></div><div><span>Клиенту</span><b>'+money(calcClientUnit(x))+'</b></div></div></td>' +
      '<td><span class="catalog-status '+(x.is_active === false ? 'off' : 'on')+'">'+(x.is_active === false ? 'выключена' : 'активна')+'</span><div class="catalog-row-meta">'+h(x.description || '')+'</div></td>' +
      '<td><div class="catalog-actions"><button data-catalog-action="edit">Редактировать</button><button data-catalog-action="copy">Копия</button><button data-catalog-action="toggle">'+(x.is_active === false ? 'Включить' : 'Выключить')+'</button></div></td>' +
    '</tr>';
  }

  function render(){
    css();
    var box = e('catalogAdminList');
    if(!box) return;
    var list = filtered();
    renderMetrics(list);
    if(!list.length){ box.innerHTML = '<div class="empty">Позиций по выбранным условиям нет.</div>'; return; }
    box.innerHTML = '<div class="table-wrap"><table class="catalog-table"><thead><tr><th>Позиция</th><th>Цены</th><th>Статус / описание</th><th>Действия</th></tr></thead><tbody>'+list.map(rowHtml).join('')+'</tbody></table></div>';
  }

  function formHtml(){
    return '<div id="catalogModal" class="catalog-modal hidden"><div class="catalog-modal-card"><div class="card-head"><div><h2 id="catalogModalTitle">Позиция номенклатуры</h2><p>Цены отсюда используются в расчёте и быстрых шаблонах.</p></div><button id="catalogCloseBtn" type="button">×</button></div><div class="catalog-form-grid"><label>Название<input id="catalogFormName" placeholder="Например: Баннер 440 г/м²"></label><label>Категория<input id="catalogFormCategory" placeholder="Например: Наружная реклама"></label><label>Тип<select id="catalogFormType"><option>Изготовление</option><option>Услуга</option><option>Дизайн</option><option>Монтаж</option><option>Доставка</option><option>Интернет-реклама</option><option>Карты и справочники</option><option>Контент</option><option>Материал</option><option>Другое</option></select></label><label>Ед. измерения<select id="catalogFormUnit"><option>шт</option><option>м²</option><option>м</option><option>проект</option><option>час</option><option>месяц</option><option>комплект</option><option>услуга</option><option>заказ</option></select></label><label>Себестоимость / подрядчик<input id="catalogFormCost" type="number" min="0" step="1" value="0"></label><label>Наценка, %<input id="catalogFormMarkup" type="number" step="1" value="50"></label><label>Минимальная цена клиенту<input id="catalogFormMin" type="number" min="0" step="1" value="0"></label><label>Цена клиенту по умолчанию<input id="catalogFormDefault" type="number" min="0" step="1" value="0"></label><label>Режим расчёта<select id="catalogFormMode"><option value="markup">markup — себестоимость + наценка</option><option value="fixed">fixed — фиксированная цена</option><option value="area">area — по площади</option><option value="custom">custom — расширенный</option></select></label><label>Сортировка<input id="catalogFormSort" type="number" step="1" value="100"></label><label>Активность<select id="catalogFormActive"><option value="true">Активна</option><option value="false">Выключена</option></select></label><label class="wide">Описание<textarea id="catalogFormDescription" placeholder="Комментарий для менеджера, подрядчик, особенности материала"></textarea></label><label class="wide">JSON-настройки<textarea id="catalogFormSettings" placeholder="{}"></textarea><div class="catalog-json-help">Для м² можно использовать: {&quot;calc_ui&quot;:&quot;area&quot;,&quot;cost_rules&quot;:{&quot;min_billable_area_m2&quot;:1,&quot;waste_percent&quot;:5}}</div></label></div><div id="catalogFormNote" class="catalog-note"></div><div class="actions right"><button id="catalogCancelBtn" type="button">Отмена</button><button id="catalogSaveBtn" type="button" class="primary">Сохранить</button></div></div></div>';
  }

  function ensureModal(){
    if(e('catalogModal')) return;
    document.body.insertAdjacentHTML('beforeend', formHtml());
    e('catalogCloseBtn').onclick = closeModal;
    e('catalogCancelBtn').onclick = closeModal;
    e('catalogSaveBtn').onclick = function(){ save().catch(function(err){ setFormNote(err.message || String(err), 'bad'); }); };
    e('catalogFormMode').addEventListener('change', function(){
      var settings = e('catalogFormSettings');
      if(settings && !String(settings.value || '').trim()) settings.value = JSON.stringify(defaultSettings(this.value), null, 2);
    });
  }

  function setFormNote(text, cls){
    var x = e('catalogFormNote');
    if(x){ x.className = 'catalog-note ' + (cls || ''); x.innerHTML = h(text); }
  }

  function openModal(item, copy){
    ensureModal();
    editingId = item && !copy ? item.id : null;
    e('catalogModalTitle').textContent = editingId ? 'Редактировать позицию' : (copy ? 'Создать копию позиции' : 'Новая позиция');
    e('catalogFormName').value = item ? (copy ? (item.name + ' — копия') : item.name || '') : '';
    e('catalogFormCategory').value = item ? (item.category || '') : '';
    e('catalogFormType').value = item ? (item.item_type || 'Изготовление') : 'Изготовление';
    e('catalogFormUnit').value = item ? (item.unit || 'шт') : 'шт';
    e('catalogFormCost').value = item ? n(item.contractor_price) : 0;
    e('catalogFormMarkup').value = item ? n(item.markup_percent) : 50;
    e('catalogFormMin').value = item ? n(item.min_client_price) : 0;
    e('catalogFormDefault').value = item ? n(item.default_client_price) : 0;
    e('catalogFormMode').value = item ? (item.calculation_mode || 'markup') : 'markup';
    e('catalogFormSort').value = item ? n(item.sort_order) : 100;
    e('catalogFormActive').value = item && item.is_active === false ? 'false' : 'true';
    e('catalogFormDescription').value = item ? (item.description || '') : '';
    e('catalogFormSettings').value = item && item.settings ? JSON.stringify(item.settings, null, 2) : JSON.stringify(defaultSettings(item && item.calculation_mode ? item.calculation_mode : 'markup'), null, 2);
    setFormNote('', '');
    e('catalogModal').classList.remove('hidden');
  }

  function closeModal(){
    if(e('catalogModal')) e('catalogModal').classList.add('hidden');
    editingId = null;
  }

  function payload(){
    var name = val('catalogFormName');
    if(!name) throw new Error('Укажите название позиции.');
    return {
      name: name,
      category: val('catalogFormCategory') || 'Без категории',
      item_type: val('catalogFormType') || 'Изготовление',
      unit: val('catalogFormUnit') || 'шт',
      contractor_price: n(val('catalogFormCost')),
      markup_percent: n(val('catalogFormMarkup')),
      min_client_price: n(val('catalogFormMin')),
      default_client_price: n(val('catalogFormDefault')),
      calculation_mode: val('catalogFormMode') || 'markup',
      sort_order: Math.round(n(val('catalogFormSort'))),
      is_active: val('catalogFormActive') !== 'false',
      description: val('catalogFormDescription'),
      settings: safeJson(val('catalogFormSettings'))
    };
  }

  async function save(){
    await needLogin();
    var p = payload();
    setFormNote('Сохраняю...', '');
    var r;
    if(editingId){
      r = await window.db.from('leader_catalog').update(p).eq('id', editingId).select('id').single();
    } else {
      r = await window.db.from('leader_catalog').insert(p).select('id').single();
    }
    if(r.error) throw new Error(r.error.message);
    closeModal();
    loaded = false;
    await load(true);
    toast(editingId ? 'Позиция обновлена' : 'Позиция создана');
  }

  async function toggle(id){
    var item = catalog.find(function(x){ return String(x.id) === String(id); });
    if(!item) return;
    await needLogin();
    var r = await window.db.from('leader_catalog').update({ is_active: item.is_active === false }).eq('id', id).select('id').single();
    if(r.error) throw new Error(r.error.message);
    item.is_active = item.is_active === false;
    render();
    toast(item.is_active === false ? 'Позиция выключена' : 'Позиция включена');
  }

  function bind(){
    css();
    ensureModal();
    var add = e('catalogAddBtn');
    if(add && !add.dataset.bound){ add.dataset.bound = '1'; add.onclick = function(){ openModal(null, false); }; }
    var reload = e('catalogReloadBtn');
    if(reload && !reload.dataset.bound){ reload.dataset.bound = '1'; reload.onclick = function(){ load(true); }; }
    ['catalogFilterCategory','catalogFilterType','catalogFilterActive'].forEach(function(id){ var x=e(id); if(x && !x.dataset.bound){ x.dataset.bound='1'; x.onchange=render; } });
    var search = e('catalogSearch');
    if(search && !search.dataset.bound){ search.dataset.bound='1'; search.oninput=render; }
    var list = e('catalogAdminList');
    if(list && !list.dataset.bound){
      list.dataset.bound = '1';
      list.addEventListener('click', function(ev){
        var btn = ev.target && ev.target.closest ? ev.target.closest('[data-catalog-action]') : null;
        if(!btn) return;
        var row = btn.closest('[data-catalog-id]');
        var id = row ? row.dataset.catalogId : '';
        var item = catalog.find(function(x){ return String(x.id) === String(id); });
        if(btn.dataset.catalogAction === 'edit') openModal(item, false);
        if(btn.dataset.catalogAction === 'copy') openModal(item, true);
        if(btn.dataset.catalogAction === 'toggle') toggle(id).catch(function(err){ alert(err.message || err); });
      });
    }
  }

  function ensure(){
    css();
    bind();
    if(!loaded) load(false);
  }

  function boot(){
    bind();
    document.querySelectorAll('[data-page="catalog"]').forEach(function(tab){
      if(!tab.dataset.catalogAdmin){
        tab.dataset.catalogAdmin = '1';
        tab.addEventListener('click', function(){ setTimeout(ensure, 250); });
      }
    });
  }

  window.LeaderV2CatalogAdmin = { load:load, render:render, open:function(){ openModal(null,false); } };
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(boot, 900); });
  else setTimeout(boot, 600);
})();
