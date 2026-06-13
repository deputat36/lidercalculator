import './offers.js';
import './orders.js';

const styles = [
  ['leader-v4-offers-css', 'assets/v4/offers.css?v=20260528-1'],
  ['leader-v4-orders-css', 'assets/v4/orders.css?v=20260613-2']
];

styles.forEach(([id, href]) => {
  if (document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.appendChild(link);
});
