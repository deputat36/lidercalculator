(function(){
  function el(id){return document.getElementById(id)}
  function isActive(id){var p=el(id);return p&&p.classList.contains('active')}
  function toast(text){var t=el('toast');if(t){t.textContent=text;t.classList.add('show');setTimeout(function(){t.classList.remove('show')},2200)}}
  function refreshOrders(silent){
    if(window.LeaderV2Orders&&window.LeaderV2Orders.load){
      return window.LeaderV2Orders.load().then(function(list){if(!silent)toast('Заказы обновлены: '+list.length);return list}).catch(function(e){if(!silent)alert(e.message);throw e})
    }
    if(!silent)alert('Модуль заказов ещё не загрузился. Обновите страницу.');
    return Promise.resolve([])
  }
  function bind(){
    var btn=el('reloadOrdersBtn');
    if(btn&&!btn.dataset.v2Fix){
      btn.dataset.v2Fix='1';
      btn.onclick=function(){refreshOrders(false)};
    }
    var create=el('createOrderBtn');
    if(create&&!create.dataset.v2Fix){
      create.dataset.v2Fix='1';
      create.addEventListener('click',function(){
        setTimeout(function(){refreshOrders(true)},1800);
        setTimeout(function(){refreshOrders(true)},3500);
      });
    }
    document.querySelectorAll('[data-page="orders"],[data-page="design"]').forEach(function(tab){
      if(!tab.dataset.v2Fix){
        tab.dataset.v2Fix='1';
        tab.addEventListener('click',function(){setTimeout(function(){refreshOrders(true)},400)})
      }
    });
  }
  window.LeaderV2Fixes={refreshOrders:refreshOrders,bind:bind};
  document.addEventListener('DOMContentLoaded',function(){
    setTimeout(bind,500);
    setInterval(function(){bind(); if(isActive('orders')||isActive('design')) refreshOrders(true);},5000);
  });
})();
