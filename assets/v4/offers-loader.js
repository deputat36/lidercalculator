import './offers.js';

const cssId = 'leader-v4-offers-css';
if (!document.getElementById(cssId)) {
  const link = document.createElement('link');
  link.id = cssId;
  link.rel = 'stylesheet';
  link.href = 'assets/v4/offers.css?v=20260528-1';
  document.head.appendChild(link);
}
