(function(){
  function loadScript(src){
    var base=src.split('?')[0];
    if(!document.querySelector('script[src="'+src+'"]')&&!document.querySelector('script[src^="'+base+'"]')){
      var s=document.createElement('script');
      s.src=src;
      document.body.appendChild(s);
    }
  }
  var v='?v=20260524-9';
  loadScript('assets/app-v2-speed-core.js'+v);
  loadScript('assets/app-v2-dashboard.js'+v);
  loadScript('assets/app-v2-orders-pro.js'+v);
  loadScript('assets/app-v2-catalog'+'-calc.js'+v);
  loadScript('assets/app-v2-catalog'+'-meta.js'+v);
  loadScript('assets/app-v2-catalog'+'-advanced.js'+v);
  loadScript('assets/app-v2-catalog'+'-admin.js'+v);
  loadScript('assets/app-v2-templates'+'-admin.js'+v);
  loadScript('assets/app-v2-calc'+'-cost-engine.js'+v);
  loadScript('assets/app-v2-calc'+'-editor.js'+v);
  loadScript('assets/app-v2-calc'+'-summary.js'+v);
  loadScript('assets/app-v2-calc'+'-guard.js'+v);
  loadScript('assets/app-v2-calc'+'-quick.js'+v);
  loadScript('assets/app-v2-order-'+'aler'+'ts.js'+v);
})();
