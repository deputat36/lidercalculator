(function(){
  function loadTemplateItemsEditor(){
    var base = 'assets/app-v2-template-items.js';
    if (document.querySelector('script[src^="' + base + '"]')) return;
    var s = document.createElement('script');
    s.src = base + '?v=20260524-1';
    document.body.appendChild(s);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadTemplateItemsEditor);
  } else {
    loadTemplateItemsEditor();
  }
})();
