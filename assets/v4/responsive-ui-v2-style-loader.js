if (!document.querySelector('link[data-responsive-ui-v2-css="1"]')) {
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = 'assets/v4/responsive-ui-v2.css?v=20260618-1';
  link.dataset.responsiveUiV2Css = '1';
  document.head.appendChild(link);
}
