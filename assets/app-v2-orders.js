(function(){
  function loadScript(src){
    if(!document.querySelector('script[src="'+src+'"]')){
      var s=document.createElement('script');
      s.src=src;
      document.body.appendChild(s);
    }
  }
  loadScript('assets/app-v2-auth-fix.js');
  loadScript('assets/app-v2-dashboard.js');
  loadScript('assets/app-v2-orders-pro.js');
})();
