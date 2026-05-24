(function(){
  var creating = false;

  function e(id){ return document.getElementById(id); }
  function q(s,r){ return (r || document).querySelector(s); }
  function n(v){ var x = Number(v); return Number.isFinite(x) ? x : 0; }
  function money(v){ return Math.round(n(v)).toLocaleString('ru-RU') + ' ₽'; }
  function st(){ try { return window.eval('state'); } catch(x){ return null; } }
  function val(id){ var x=e(id); return x && x.value ? String(x.value).trim() : ''; }
  function esc(s){ return String(s == null ? '' : s).replace(/[&<>\"]/g,function(m){ return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;'}[m]; }); }

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
      var type = r.type || r.item_type || '';

      if (!r.name) block.push(name + ': не указано название.');
      if (qty <= 0) block.push(name + ': количество должно быть больше 0.');
      if (unitClient <= 0) block.push(name + ': цена клиенту равна 0 ₽.');
      if (sumClient <= 0) block.push(name + ': сумма клиенту равна 0 ₽.');
      if (unitCost <= 0 && ['Изготовление','Услуга','Дизайн','Монтаж'].indexOf(type) >= 0) warn.push(name + ': себестоимость 0 ₽, проверьте внутренние затраты.');
      if (profit < 0) warn.push(name + ': позиция убыточная, прибыль ' + money(profit) + '.');
      else if (sumClient > 0 && margin < 20) warn.push(name + ': маржа ниже 20% — ' + margin + '%.');
      if (r.data && r.data.recommended_client_price && unitClient < n(r.data.recommended_client_price)) warn.push(name + ': цена ниже рекомендованной ' + money(r.data.recommended_client_price) + '.');
    });

    var t = totals(rows);
    if (rows.length && t.total <= 0) block.push('Общая сумма клиенту равна 0 ₽.');
    if (rows.length && t.profit < 0) warn.unshift('Заказ убыточный: прибыль ' + money(t.profit) + '.');
    else if (rows.length && t.total > 0 && t.margin < 20) warn.unshift('Маржа заказа ниже 20% — ' + t.margin + '%.');

    return { block:block, warn:warn, totals:t, rows:rows };
  }

  function css(){
    if(e('calcGuardCss')) return;
    var s = document.createElement('style');
    s.id = 'calcGuardCss';
    s.textContent = '.calc-guard-panel{margin:12px 0;padding:12px;border:1px solid var(--line);border-radius:14px;background:#f9fafb}.calc-guard-panel.good{background:#f0fdf4;border-color:#bbf7d0}.calc-guard-panel.warn{background:#fffbeb;border-color:#fde68a}.calc-guard-panel.bad{background:#fef2f2;border-color:#fecaca}.calc-guard-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;flex-wrap:wrap}.calc-guard-title{font-size:15px;font-weight:900;color:#111827}.calc-guard-badge{display:inline-flex;align-items:center;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900;background:#e5e7eb;color:#374151}.calc-guard-panel.good .calc-guard-badge{background:#dcfce7;color:#166534}.calc-guard-panel.warn .calc-guard-badge{background:#fef3c7;color:#92400e}.calc-guard-panel.bad .calc-guard-badge{background:#fee2e2;color:#991b1b}.calc-guard-text{margin-top:7px;font-size:13px;line-height:1.45;color:#374151}.calc-guard-list{margin:8px 0 0;padding-left:18px;font-size:13px;line-height:1.45}.calc-guard-list li+li{margin-top:3px}.calc-guard-kpi{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.calc-guard-kpi span{display:inline-flex;border:1px solid rgba(17,24,39,.08);border-radius:999px;background:#fff;padding:6px 9px;font-size:12px;font-weight:800;color:#374151}.calc-guard-panel.bad+.actions #createOrderBtn,.calc-final-actions button[disabled],#createOrderBtn[disabled]{opacity:.55;cursor:not-allowed}@media(max-width:560px){.calc-guard-head{display:block}.calc-guard-badge{margin-top:8px}.calc-guard-kpi span{width:100%;box-sizing:border-box}}';
    document.head.appendChild(s);
  }

  function ensurePanel(){
    css();
    var box = e('calcGuardPanel');
    if(box) return box;
    var totalsBox = q('#calc .totals');
    if(!totalsBox) return null;
    box = document.createElement('div');
    box.id = 'calcGuardPanel';
    box.className = 'calc-guard-panel';
    box.innerHTML = '<div class="calc-guard-head"><div><div id="calcGuardTitle" class="calc-guard-title">Проверка расчёта</div><div id="calcGuardText" class="calc-guard-text"></div></div><span id="calcGuardBadge" class="calc-guard-badge">Проверяю</span></div><ul id="calcGuardList" class="calc-guard-list"></ul><div id="calcGuardKpi" class="calc-guard-kpi"></div>';
    var summary = e('calcFinalSummary');
    if(summary && summary.parentNode) summary.parentNode.insertBefore(box, summary);
    else totalsBox.insertAdjacentElement('afterend', box);
    return box;
  }

  function statusOf(c){
    if(c.block.length) return { level:'bad', title:'Нельзя создать заказ', badge:'Нельзя создавать', text:'Исправьте критические ошибки в расчёте. После этого кнопка создания заказа станет доступной.' };
    if(c.warn.length) return { level:'warn', title:'Требуется подтверждение', badge:'Требуется подтверждение', text:'Создать заказ можно, но перед сохранением CRM покажет предупреждение о финансовых рисках.' };
    return { level:'good', title:'Можно создавать заказ', badge:'Можно создавать', text:'Критических ошибок нет. Цена клиенту указана, итоговая сумма больше 0 ₽.' };
  }

  function setCreateButtons(c){
    var disabled = creating || c.block.length > 0;
    var title = creating ? 'Заказ создаётся...' : (c.block[0] || (c.warn.length ? 'Перед созданием потребуется подтверждение' : 'Расчёт можно создать'));
    ['createOrderBtn','calcSummaryCreateOrderBtn'].forEach(function(id){
      var btn = e(id);
      if(!btn) return;
      btn.disabled = disabled;
      btn.title = title;
      if(id === 'createOrderBtn') btn.dataset.calcGuard = '1';
    });
  }

  function renderStatus(){
    var c = check();
    var box = ensurePanel();
    var stt = statusOf(c);
    if(box){
      box.className = 'calc-guard-panel ' + stt.level;
      if(e('calcGuardTitle')) e('calcGuardTitle').textContent = stt.title;
      if(e('calcGuardBadge')) e('calcGuardBadge').textContent = stt.badge;
      if(e('calcGuardText')) e('calcGuardText').textContent = stt.text;

      var list = c.block.length ? c.block : c.warn;
      var limited = list.slice(0, 4);
      if(e('calcGuardList')){
        e('calcGuardList').innerHTML = limited.length ? limited.map(function(x){ return '<li>'+esc(x)+'</li>'; }).join('') + (list.length > limited.length ? '<li>Ещё предупреждений: '+(list.length-limited.length)+'</li>' : '') : '';
      }
      if(e('calcGuardKpi')){
        e('calcGuardKpi').innerHTML = '<span>Клиенту: '+money(c.totals.total)+'</span><span>Себестоимость: '+money(c.totals.cost)+'</span><span>Прибыль: '+money(c.totals.profit)+'</span><span>Маржа: '+c.totals.margin+'%</span>';
      }
    }
    setCreateButtons(c);
    return c;
  }

  async function guardedCreate(){
    var btn = e('createOrderBtn');
    var c = renderStatus();

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
      creating = true;
      setCreateButtons(c);
      if (btn) btn.textContent = 'Создаю заказ...';
      await (window.createOrder ? window.createOrder() : createOrder());
    } catch(err) {
      alert(err && err.message ? err.message : String(err));
    } finally {
      creating = false;
      if (btn) btn.textContent = 'Создать заказ';
      setTimeout(renderStatus, 120);
    }
  }

  function bind(){
    var btn = e('createOrderBtn');
    if (btn) {
      btn.onclick = function(){ guardedCreate(); };
      btn.dataset.calcGuard = '1';
    }
    renderStatus();
  }

  function boot(){
    bind();
    var calc = e('calc');
    if(calc && window.MutationObserver && !calc.dataset.calcGuardObserver){
      calc.dataset.calcGuardObserver = '1';
      new MutationObserver(function(){ setTimeout(renderStatus, 60); }).observe(calc,{ childList:true, subtree:true, characterData:true });
    }
    document.addEventListener('input', function(ev){ if(ev.target && ev.target.closest && ev.target.closest('#calc')) setTimeout(renderStatus, 80); });
    document.addEventListener('change', function(ev){ if(ev.target && ev.target.closest && ev.target.closest('#calc')) setTimeout(renderStatus, 80); });
    document.addEventListener('click', function(ev){ if(ev.target && ev.target.closest && ev.target.closest('#calc')) setTimeout(renderStatus, 160); });
    setInterval(renderStatus, 1500);
  }

  window.LeaderCalcGuard = { check:check, guardedCreate:guardedCreate, bind:bind, renderStatus:renderStatus, totals:totals };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ setTimeout(boot, 700); });
  else setTimeout(boot, 400);
  setTimeout(bind, 1400);
})();
