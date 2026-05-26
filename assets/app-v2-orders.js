(function(){
  function loadScript(src){
    var base=src.split('?')[0];
    if(!document.querySelector('script[src="'+src+'"]')&&!document.querySelector('script[src^="'+base+'"]')){
      var s=document.createElement('script');
      s.src=src;
      document.body.appendChild(s);
    }
  }
  var v='?v=20260524-25';
  loadScript('assets/app-v2-speed-core.js'+v);
  loadScript('assets/app-v2-dashboard.js'+v);
  loadScript('assets/app-v2-manager-dashboard.js'+v);
  loadScript('assets/app-v2-maintenance.js'+v);
  loadScript('assets/app-v2-orders-pro.js'+v);
  loadScript('assets/app-v2-order'+'-card.js'+v);
  loadScript('assets/app-v2-order'+'-progress.js'+v);
  loadScript('assets/app-v2-order'+'-finance.js'+v);
  loadScript('assets/app-v2-order'+'-timeline.js'+v);
  loadScript('assets/app-v2-process-guard.js'+v);
  loadScript('assets/app-v2-production.js'+v);
  loadScript('assets/app-v2-production-link.js'+v);
  loadScript('assets/app-v2-production-brief.js'+v);
  loadScript('assets/app-v2-installation.js'+v);
  loadScript('assets/app-v2-installation-link.js'+v);
  loadScript('assets/app-v2-design-tasks.js'+v);
  loadScript('assets/app-v2-design-link.js'+v);
  loadScript('assets/app-v2-banner-wizard.js'+v);
  loadScript('assets/app-v2-post-order-flow.js'+v);
  loadScript('assets/app-v2-catalog'+'-calc.js'+v);
  loadScript('assets/app-v2-catalog'+'-meta.js'+v);
  loadScript('assets/app-v2-catalog'+'-advanced.js'+v);
  loadScript('assets/app-v2-catalog'+'-admin.js'+v);
  loadScript('assets/app-v2-templates'+'-admin.js'+v);
  loadScript('assets/app-v2-templates'+'-visual.js'+v);
  loadScript('assets/app-v2-templates'+'-settings.js'+v);
  loadScript('assets/app-v2-calc'+'-cost-engine.js'+v);
  loadScript('assets/app-v2-calc'+'-editor.js'+v);
  loadScript('assets/app-v2-calc'+'-summary.js'+v);
  loadScript('assets/app-v2-calc'+'-guard.js'+v);
  loadScript('assets/app-v2-calc'+'-quick.js'+v);
  loadScript('assets/app-v2-order-'+'aler'+'ts.js'+v);
})();
