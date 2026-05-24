(function(){
  function e(id){return document.getElementById(id)}
  function toast(t){try{if(typeof window.toast==='function')window.toast(t)}catch(x){}}
  function enhance(){
    document.querySelectorAll('#ordersList .work-item[data-order]').forEach(function(card){
      var detail=card.querySelector('.order-detail');
      if(!detail || detail.dataset.productionLinked) return;
      detail.dataset.productionLinked='1';
      var actions=detail.querySelector('.order-detail-actions');
      if(!actions) return;
      var btn=document.createElement('button');
      btn.type='button';
      btn.textContent='Создать производство';
      btn.dataset.productionCreateFromOrder='1';
      btn.onclick=function(){
        var orderId=card.dataset.order;
        if(!orderId) return;
        if(!window.LeaderV2Production || !window.LeaderV2Production.createFromOrder){
          alert('Модуль производства ещё не загрузился. Обновите страницу.');
          return;
        }
        btn.disabled=true;
        btn.textContent='Создаю...';
        window.LeaderV2Production.createFromOrder(orderId,true).catch(function(err){
          alert(err.message||String(err));
        }).finally(function(){
          btn.disabled=false;
          btn.textContent='Создать производство';
        });
      };
      actions.appendChild(btn);
    });
  }
  function observe(){
    var box=e('ordersList');
    if(box && !box.dataset.productionLinkObserver){
      if(window.MutationObserver){
        var mo=new MutationObserver(function(){enhance()});
        mo.observe(box,{childList:true,subtree:true});
      }
      box.dataset.productionLinkObserver='1';
    }
    enhance();
  }
  window.LeaderV2ProductionLink={enhance:enhance};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(observe,1200)});else setTimeout(observe,900);
})();
