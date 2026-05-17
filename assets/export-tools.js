// Export and simple reports module for RA Lider CRM.
(function(){
  function read(key, fallback){ try { return JSON.parse(localStorage.getItem('lc_'+key)) || fallback; } catch(e){ return fallback; } }
  function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,function(m){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[m]}) }
  function csvCell(v){ v = String(v==null?'':v); return '"' + v.replace(/"/g,'""') + '"'; }
  function download(name, text, type){
    var blob = new Blob([text], {type: type || 'text/plain;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name; a.click();
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  }
  function toCSV(rows, fields){
    var head = fields.map(function(f){ return csvCell(f.title); }).join(';');
    var body = rows.map(function(r){ return fields.map(function(f){ return csvCell(typeof f.value==='function' ? f.value(r) : r[f.value]); }).join(';'); }).join('\n');
    return '\ufeff' + head + '\n' + body;
  }
  function money(v){ return Math.round(Number(v||0)); }
  function sum(arr, fn){ return arr.reduce(function(a,x){ return a + Number(fn(x)||0); }, 0); }
  function group(arr, fn){
    var out = {};
    arr.forEach(function(x){ var k = fn(x) || 'Не указано'; out[k] = (out[k] || 0) + 1; });
    return out;
  }
  function groupMoney(arr, keyFn, valFn){
    var out = {};
    arr.forEach(function(x){ var k = keyFn(x) || 'Не указано'; out[k] = (out[k] || 0) + Number(valFn(x)||0); });
    return out;
  }
  function tableFromMap(map, title1, title2){
    return '<table><thead><tr><th>'+title1+'</th><th class="right">'+title2+'</th></tr></thead><tbody>'+Object.keys(map).sort().map(function(k){return '<tr><td>'+esc(k)+'</td><td class="right">'+esc(map[k])+'</td></tr>'}).join('')+'</tbody></table>';
  }
  function addTab(){
    if(document.querySelector('[data-tab="exports"]')) return;
    var tabs = document.querySelector('.tabs');
    var wrap = document.querySelector('.wrap');
    if(!tabs || !wrap) return;
    var tab = document.createElement('div');
    tab.className = 'tab';
    tab.dataset.tab = 'exports';
    tab.textContent = 'Экспорт';
    tabs.appendChild(tab);
    var sec = document.createElement('section');
    sec.id = 'exports';
    sec.className = 'page hidden';
    sec.innerHTML = '<div class="card"><div class="row" style="justify-content:space-between"><b>Экспорт и отчёты</b><div class="row"><button onclick="LeaderExports.refresh()">Обновить сводку</button><button onclick="LeaderExports.backupAll()">Полная JSON-копия</button></div></div><p class="muted">Перед экспортом лучше нажать «Загрузить из облака», чтобы локальные данные были актуальными.</p><div class="row"><button onclick="LeaderExports.ordersCsv()">Заказы CSV</button><button onclick="LeaderExports.clientsCsv()">Клиенты CSV</button><button onclick="LeaderExports.leadsCsv()">Заявки CSV</button><button onclick="LeaderExports.catalogCsv()">Прайс CSV</button><button onclick="LeaderExports.printReport()">Печатный отчёт</button></div><div id="exportSummary" class="sumgrid" style="margin-top:12px"></div><div class="grid"><div class="card" style="grid-column:span 6"><b>Заказы по статусам</b><div id="ordersByStatus" class="table" style="margin-top:8px"></div></div><div class="card" style="grid-column:span 6"><b>Заявки по источникам</b><div id="leadsBySource" class="table" style="margin-top:8px"></div></div></div></div>';
    wrap.appendChild(sec);
    tab.onclick=function(){document.querySelectorAll('.tab').forEach(function(x){x.classList.remove('active')});document.querySelectorAll('.page').forEach(function(x){x.classList.add('hidden')});tab.classList.add('active');sec.classList.remove('hidden');LeaderExports.refresh();};
  }
  function buildSummary(){
    var orders = read('orders', []), clients = read('clients', []), leads = read('leads', []), catalog = read('catalog', []);
    var revenue = sum(orders, function(o){ return o.total; });
    var cost = sum(orders, function(o){ return o.cost; });
    var debt = sum(orders, function(o){ return o.balance; });
    var profit = revenue - cost;
    var box = document.getElementById('exportSummary');
    if(box) box.innerHTML = '<div class="sum"><span>Заказы</span><b>'+orders.length+'</b></div><div class="sum"><span>Заявки</span><b>'+leads.length+'</b></div><div class="sum"><span>Клиенты</span><b>'+clients.length+'</b></div><div class="sum"><span>Позиции прайса</span><b>'+catalog.length+'</b></div><div class="sum"><span>Выручка</span><b>'+money(revenue).toLocaleString('ru-RU')+' ₽</b></div><div class="sum"><span>Маржа</span><b>'+money(profit).toLocaleString('ru-RU')+' ₽</b></div><div class="sum"><span>Долги</span><b>'+money(debt).toLocaleString('ru-RU')+' ₽</b></div>';
    var obs = document.getElementById('ordersByStatus');
    if(obs) obs.innerHTML = tableFromMap(group(orders, function(o){return o.status}), 'Статус', 'Кол-во');
    var lbs = document.getElementById('leadsBySource');
    if(lbs) lbs.innerHTML = tableFromMap(group(leads, function(l){return l.source || l.utm_source}), 'Источник', 'Кол-во');
  }
  window.LeaderExports = {
    refresh: buildSummary,
    ordersCsv: function(){
      var orders = read('orders', []);
      download('leader-orders-'+new Date().toISOString().slice(0,10)+'.csv', toCSV(orders, [
        {title:'Дата', value:'date'}, {title:'Проект', value:'project'}, {title:'Клиент', value:'client'}, {title:'Телефон', value:'phone'}, {title:'Статус', value:'status'}, {title:'Оплата', value:'payment_status'}, {title:'Срок', value:'deadline'}, {title:'Сумма', value:'total'}, {title:'Себестоимость', value:'cost'}, {title:'Маржа', value:'profit'}, {title:'Остаток', value:'balance'}
      ]), 'text/csv;charset=utf-8');
    },
    clientsCsv: function(){
      var rows = read('clients', []);
      download('leader-clients-'+new Date().toISOString().slice(0,10)+'.csv', toCSV(rows, [
        {title:'Имя', value:'name'}, {title:'Телефон', value:'phone'}, {title:'Источник', value:'source'}, {title:'Адрес', value:'address'}, {title:'Комментарий', value:'comment'}
      ]), 'text/csv;charset=utf-8');
    },
    leadsCsv: function(){
      var rows = read('leads', []);
      download('leader-leads-'+new Date().toISOString().slice(0,10)+'.csv', toCSV(rows, [
        {title:'Дата', value:function(x){return x.created_at || ''}}, {title:'Имя', value:'name'}, {title:'Телефон', value:'phone'}, {title:'Услуга', value:'service'}, {title:'Источник', value:'source'}, {title:'Статус', value:'status'}, {title:'Сообщение', value:'message'}, {title:'Страница', value:'page_url'}, {title:'UTM source', value:'utm_source'}, {title:'UTM campaign', value:'utm_campaign'}
      ]), 'text/csv;charset=utf-8');
    },
    catalogCsv: function(){
      var rows = read('catalog', []);
      download('leader-catalog-'+new Date().toISOString().slice(0,10)+'.csv', toCSV(rows, [
        {title:'Категория', value:'category'}, {title:'Наименование', value:'name'}, {title:'Ед.', value:'unit'}, {title:'Цена подрядчика', value:'price'}
      ]), 'text/csv;charset=utf-8');
    },
    backupAll: function(){
      var data = {orders:read('orders', []), clients:read('clients', []), leads:read('leads', []), tasks:read('tasks', []), catalog:read('catalog', []), projects:read('projects', {}), settings:read('settings', {})};
      download('leader-full-backup-'+new Date().toISOString().slice(0,10)+'.json', JSON.stringify(data,null,2), 'application/json;charset=utf-8');
    },
    printReport: function(){
      var orders = read('orders', []), leads = read('leads', []);
      var revenue = sum(orders, function(o){return o.total});
      var cost = sum(orders, function(o){return o.cost});
      var html = '<html><head><meta charset="utf-8"><style>body{font-family:Arial;padding:24px}table{width:100%;border-collapse:collapse;margin:12px 0}td,th{border:1px solid #ddd;padding:7px}.right{text-align:right}</style></head><body><h2>РА «Лидер» — отчёт</h2><p>Дата формирования: '+new Date().toLocaleString('ru-RU')+'</p><h3>Итоги</h3><p>Заказов: '+orders.length+'<br>Заявок: '+leads.length+'<br>Выручка: '+money(revenue).toLocaleString('ru-RU')+' ₽<br>Себестоимость: '+money(cost).toLocaleString('ru-RU')+' ₽<br>Маржа: '+money(revenue-cost).toLocaleString('ru-RU')+' ₽</p><h3>Заказы по статусам</h3>'+tableFromMap(group(orders,function(o){return o.status}), 'Статус', 'Кол-во')+'<h3>Выручка по статусам</h3>'+tableFromMap(groupMoney(orders,function(o){return o.status},function(o){return o.total}), 'Статус', 'Сумма')+'</body></html>';
      var w = window.open('', '_blank'); w.document.write(html); w.document.close(); w.print();
    }
  };
  document.addEventListener('DOMContentLoaded', function(){ setTimeout(addTab, 900); });
})();
