let lastOrderId = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function injectOrderEditButton() {
  const actions = document.querySelector('#orderCardSection .v4-order-detail-actions');
  if (!actions || !lastOrderId) return;
  if (actions.querySelector('[data-edit-type="order"]')) return;
  actions.insertAdjacentHTML('afterbegin', `<button type="button" data-edit-type="order" data-edit-id="${esc(lastOrderId)}">Редактировать заказ</button>`);
}

document.addEventListener('click', (event) => {
  const openOrder = event.target.closest?.('[data-open-order]');
  if (openOrder?.dataset.openOrder) {
    lastOrderId = openOrder.dataset.openOrder;
    window.LeaderV4CurrentOrderId = lastOrderId;
    setTimeout(injectOrderEditButton, 250);
    setTimeout(injectOrderEditButton, 900);
  }
}, true);

document.addEventListener('leader-v4-order-updated', (event) => {
  const orderId = event.detail?.order?.id || lastOrderId;
  if (!orderId) return;
  lastOrderId = orderId;
  window.LeaderV4CurrentOrderId = orderId;
  setTimeout(() => {
    const btn = document.querySelector(`[data-open-order="${CSS.escape(orderId)}"]`);
    if (btn) btn.click();
    else injectOrderEditButton();
  }, 250);
});

document.addEventListener('leader-v4:route-change', () => {
  setTimeout(injectOrderEditButton, 300);
});

setInterval(injectOrderEditButton, 1500);
