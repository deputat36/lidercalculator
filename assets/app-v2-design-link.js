(function(){
  function e(id){return document.getElementById(id)}
  function enhance(){
    document.querySelectorAll('#ordersList .work-item[data-order]').forEach(function(card){
      var detail=card.querySelector('.order-detail');
      if(!detail||detail.dataset.designLinked)return;
      detail.dataset.designLinked='1';
      var actions=detail.querySelector('.order-detail-actions');
      if(!actions)return;
      var btn=document.createElement('button');
      btn.type='button';
      btn.textContent='Создать дизайн-задачу';
      btn.onclick=function(){
        var orderId=card.dataset.order;
        if(!orderId)return;
        if(!window.LeaderV2DesignTasks||!window.LeaderV2DesignTasks.createFromOrder){
          alert('Модуль дизайн-задач ещё не загрузился. Обновите страницу.');
          return;
        }
        btn.disabled=true;
        btn.textContent='Создаю...';
        window.LeaderV2DesignTasks.createFromOrder(orderId,true).catch(function(err){alert(err.message||err)}).finally(function(){btn.disabled=false;btn.textContent='Создать дизайн-задачу'});
      };
      actions.appendChild(btn);
    });
  }
  function observe(){
    var box=e('ordersList');
    if(box&&!box.dataset.designLinkObserver){
      if(window.MutationObserver){var mo=new MutationObserver(function(){enhance()});mo.observe(box,{childList:true,subtree:true})}
      box.dataset.designLinkObserver='1';
    }
    enhance();
  }
  window.LeaderV2DesignLink={enhance:enhance};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',function(){setTimeout(observe,1300)});else setTimeout(observe,900)
})();
