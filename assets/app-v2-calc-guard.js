(function(){
  function e(id){ return document.getElementById(id); }
  function n(v){ var x = Number(v); return Number.isFinite(x) ? x : 0; }
  function money(v){ return Math.round(n(v)).toLocaleString('ru-RU') + ' ₽'; }
  function st(){ try { return window.eval('state'); } catch(x){ return null; } }
  function toast(text){ try { if (typeof window.toast === 'function') window.toast(text); } catch(x){} }
  function val(id){ var x=e(id); return x && x.value ? String(x.value).trim() : ''; }

  function totals(rows){
    rows = rows || [];
    var cost = rows.reduce(function(a,r){ return a + n(r.price) * n(r.qty); }, 0);
    var total = rows.reduce(function(a,r){ return a + n(r.client) * n(r.qty); }, 0);
    return { cost:cost, total:total, profit:total-cost, margin: total > 0 ? Math.round((total-cost)/total*100) : 0 };
  }

  function rowName(r,i){ return (i+1) + '. ' + (r.name || r.type || 'Позиция без названия'); }

  function check(){
    var s = st();
    var rows = s && Array.isArray(s.rows) ? s.rows : [];
    var block = [];
    var warn = [];

    if (!rows.length) block.push('Добавьте хотя бы одну позицию расчёта.');
    if (!val('calcClientName') && !val('calcClientPhone')) warn.push('Не указан клиент или телефон. Заказ будет сложнее найти.');

    rows.forEach(function(r,i){
      var qty = n(r.qty);
      var unitClient = n(r.client);
      var unitCost = n(r.price);
      var sumClient = unitClient * qty;
      var sumCost = unitCost * qty;
      var profit = sumClient - sumCost;
      var margin = sumClient > 0 ? Math.round(profit / sumClient * 100) : 0;
      var name = rowName(r,i);

      if (!r.name) block.push(name + ': не указано название.');
      if (qty <= 0) block.push(name + ': количество должно быть больше 0.');
      if (unitClient <= 0) block.push(name + ': цена клиенту равна 0 ₽.');
      if (sumClient <= 0) block.push(name + ': сумма клиенту равна 0 ₽.');
      if (unitCost <= 0 && ['Изготовление','Услуга','Дизайн','Монтаж'].indexOf(r.type || r.item_type || '') >= 0) warn.push(name + ': себестоимость 0 ₽, проверьте внутренние затраты.');
      if (profit < 0) warn.push(name + ': позиция убыточная, прибыль ' + money(profit) + '.');
      else if (sumClient > 0 && margin < 20) warn.push(name + ': маржа ниже 20% — ' + margin + '%.');
      if (r.data && r.data.recommended_client_price && unitClient < n(r.data.recommended_client_price)) warn.push(name + ': цена ниже рекомендованной ' + money(r.data.recommended_client_price) + '.');
    });

    var t = totals(rows);
    if (rows.length && t.total <= 0) block.push('Общая сумма клиенту равна 0 ₽.');
    if (rows.length && t.profit < 0) warn.unshift('Заказ убыточный: прибыль ' + money(t.profit) + '.');
    else if (rows.length && t.total > 0 && t.margin < 20) warn.unshift('Маржа заказа ниже 20% — ' + t.margin + '%.');

    return { block:block, warn:warn, totals:t };
  }

  async function guardedCreate(){
    var btn = e('createOrderBtn');
    var c = check();

    if (c.block.length) {
      alert('Заказ нельзя создать:\n\n' + c.block.join('\n'));
      return;
    }

    if (c.warn.length) {
      var ok = confirm(
        'Проверьте финансовые риски перед созданием заказа:\n\n' +
        c.warn.slice(0,10).join('\n') +
        '\n\nИтого клиенту: ' + money(c.totals.total) +
        '\nСебестоимость: ' + money(c.totals.cost) +
        '\nПрибыль: ' + money(c.totals.profit) +
        '\nМаржа: ' + c.totals.margin + '%' +
        '\n\nВсё равно создать заказ?'
      );
      if (!ok) return;
    }

    if (!window.createOrder && typeof createOrder !== 'function') {
      alert('Функция создания заказа ещё не загружена. Обновите страницу.');
      return;
    }

    try {
      if (btn) { btn.disabled = true; btn.textContent = 'Создаю заказ...'; }
      await (window.createOrder ? window.createOrder() : createOrder());
    } catch(err) {
      alert(err && err.message ? err.message : String(err));
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = 'Создать заказ'; }
    }
  }

  function bind(){
    var btn = e('createOrderBtn');
    if (!btn) return;
    btn.onclick = function(){ guardedCreate(); };
    btn.dataset.calcGuard = '1';
  }

  window.LeaderCalcGuard = { check:check, guardedCreate:guardedCreate, bind:bind };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(bind, 500); });
  else setTimeout(bind, 300);
  setTimeout(bind, 1200);
})();
