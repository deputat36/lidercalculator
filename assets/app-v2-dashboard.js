(function(){
  function loadScript(src){if(!document.querySelector('script[src="'+src+'"]')){var s=document.createElement('script');s.src=src;document.body.appendChild(s)}}
  loadScript('assets/app-v2-orders-pro.js');
  loadScript('assets/app-v2-clients.js');
  loadScript('assets/app-v2-client-picker.js');
  function el(id){return document.getElementById(id)}
  function money(v){return Math.round(Number(v||0)).toLocaleString('ru-RU')+' ₽'}
  function activeOrder(o){return ['Новый','КП отправлено','Согласовано','Передано подрядчику','В работе','Готов'].indexOf(o.status||'')>=0}
  function designTask(o){return ['Нужен дизайн','В работе у дизайнера','На согласовании','Требуются правки'].indexOf(o.layout_status||'')>=0}
  function ensureBlock(){
    if(el('ordersStatsGrid')) return;
    var dash=el('dashboard');
    var leadStats=dash?dash.querySelector('.grid.stats'):null;
    if(!dash||!leadStats) return;
    var title=document.createElement('div');
    title.id='ordersStatsTitle';
    title.className='card';
    title.innerHTML='<h2>Заказы</h2><p>Отдельная сводка по реальным заказам. Не путать с заявками, переведёнными в заказ.</p>';
    var grid=document.createElement('div');
    grid.id='ordersStatsGrid';
    grid.className='grid stats';
    grid.innerHTML=''
      +'<div class="card stat"><span>Всего заказов</span><b id="statOrdersTotal">0</b></div>'
      +'<div class="card stat"><span>Новые заказы</span><b id="statOrdersNew">0</b></div>'
      +'<div class="card stat"><span>Активные заказы</span><b id="statOrdersActive">0</b></div>'
      +'<div class="card stat"><span>Дизайн-задачи</span><b id="statDesignTasks">0</b></div>'
      +'<div class="card stat"><span>Сумма заказов</span><b id="statOrdersSum">0 ₽</b></div>'
      +'<div class="card stat"><span>Долги / остатки</span><b id="statOrdersDebt">0 ₽</b></div>';
    leadStats.insertAdjacentElement('afterend',grid);
    leadStats.insertAdjacentElement('afterend',title);
  }
  function updateOrders(list){
    ensureBlock();
    list=list||[];
    var total=list.length;
    var news=list.filter(function(o){return (o.status||'')==='Новый'}).length;
    var active=list.filter(activeOrder).length;
    var design=list.filter(designTask).length;
    var sum=list.reduce(function(a,o){return a+Number(o.client_total||0)},0);
    var debt=list.reduce(function(a,o){return a+Number(o.balance||0)},0);
    if(el('statOrdersTotal'))el('statOrdersTotal').textContent=total;
    if(el('statOrdersNew'))el('statOrdersNew').textContent=news;
    if(el('statOrdersActive'))el('statOrdersActive').textContent=active;
    if(el('statDesignTasks'))el('statDesignTasks').textContent=design;
    if(el('statOrdersSum'))el('statOrdersSum').textContent=money(sum);
    if(el('statOrdersDebt'))el('statOrdersDebt').textContent=money(debt);
  }
  window.LeaderV2Dashboard={ensureBlock:ensureBlock,updateOrders:updateOrders};
  document.addEventListener('DOMContentLoaded',function(){setTimeout(ensureBlock,700)});
})();
