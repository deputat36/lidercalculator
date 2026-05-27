(function(){
  function e(id){return document.getElementById(id)}
  function css(){
    if(e('leadV3LinkCss'))return;
    var s=document.createElement('style');
    s.id='leadV3LinkCss';
    s.textContent='.lead-v3-link{background:#111827!important;color:#fff!important;border-color:#111827!important}.lead-v3-note{font-size:12px;color:#6b7280;margin-top:6px;line-height:1.35}';
    document.head.appendChild(s);
  }
  function addLinks(){
    css();
    document.querySelectorAll('#leadList .lead-card[data-id]').forEach(function(card){
      if(card.querySelector('[data-action="open-v3"]'))return;
      var id=card.getAttribute('data-id');
      if(!id)return;
      var actions=card.querySelector('.lead-actions')||card;
      var a=document.createElement('a');
      a.className='lead-v3-link';
      a.dataset.action='open-v3';
      a.href='lead-view.html?id='+encodeURIComponent(id);
      a.target='_blank';
      a.rel='noopener';
      a.textContent='Открыть v3';
      actions.insertBefore(a, actions.firstChild);
    });
  }
  function boot(){
    addLinks();
    var list=e('leadList');
    if(list&&window.MutationObserver&&!list.dataset.v3Observer){
      new MutationObserver(addLinks).observe(list,{childList:true,subtree:true});
      list.dataset.v3Observer='1';
    }
    document.addEventListener('click',function(ev){
      var btn=ev.target.closest('[data-action="open-v3"]');
      if(btn){ev.stopPropagation();}
    },true);
    setInterval(addLinks,2500);
  }
  window.LeaderV3LeadLinks={refresh:addLinks};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
