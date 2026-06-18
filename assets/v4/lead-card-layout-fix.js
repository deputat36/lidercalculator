import './lead-card-accordion.js?v=20260617-1';
import './site-crm-workflow-v1.js?v=20260617-1';
import './lead-site-summary-v1.js?v=20260618-1';
import './lead-no-phone-workflow-v1.js?v=20260618-1';
import './lead-site-need-create-v1.js?v=20260618-1';
import './lead-site-next-contact-v1.js?v=20260618-1';

let currentLeadId = null;

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function visualBlock(node) {
  if (!node) return null;
  return node.closest('details[data-lead-accordion="1"]') || node;
}

function moveAfter(node, anchor) {
  const visualNode = visualBlock(node);
  const visualAnchor = visualBlock(anchor);
  if (!visualNode || !visualAnchor || visualNode === visualAnchor || !visualAnchor.parentNode) return;
  if (visualAnchor.nextElementSibling === visualNode) return;
  visualAnchor.insertAdjacentElement('afterend', visualNode);
}

function reorderLeadCard() {
  const card = document.querySelector('#leadCardContent .v4-lead-card-view');
  if (!card) return;
  const calculations = document.getElementById('calculationsBox');
  const standard = document.getElementById('standardCalculationsBox');
  const advanced = document.getElementById('advancedCalculationsBox');
  const offers = document.getElementById('offersBox');

  if (calculations) calculations.classList.add('v4-card-block-saved-calculations');
  if (standard && calculations) moveAfter(standard, calculations);
  if (advanced && standard) moveAfter(advanced, standard);
  else if (advanced && calculations) moveAfter(advanced, calculations);
  if (offers && advanced) moveAfter(offers, advanced);
  else if (offers && standard) moveAfter(offers, standard);

  const oldCalcForm = document.querySelector('#calculationsBox .v4-calc-form, #calculationsBox [data-catalog-calculator]');
  if (oldCalcForm) oldCalcForm.remove();
}

function cleanDuplicateLeadEditor() {
  document.getElementById('editLeadBtn')?.remove();
  document.getElementById('leadEditBox')?.remove();

  const actions = document.querySelector('#leadCardContent .v4-card-view-actions');
  const leadId = currentLeadId || window.LeaderV4CurrentLeadId || document.body.dataset.currentLeadId;
  if (!actions || !leadId || actions.querySelector('[data-edit-type="lead"]')) return;

  const refresh = document.getElementById('refreshLeadBtn');
  const buttonHtml = `<button type="button" data-edit-type="lead" data-edit-id="${esc(leadId)}">Редактировать заявку</button>`;
  if (refresh) refresh.insertAdjacentHTML('beforebegin', buttonHtml);
  else actions.insertAdjacentHTML('afterbegin', buttonHtml);
}

function removeExtraHints() {
  document.getElementById('leadCardWorkHint')?.remove();
}

function run() {
  reorderLeadCard();
  removeExtraHints();
  cleanDuplicateLeadEditor();
}

document.addEventListener('leader-v4:lead-card-rendered', (event) => {
  if (event.detail?.leadId) {
    currentLeadId = event.detail.leadId;
    window.LeaderV4CurrentLeadId = currentLeadId;
    document.body.dataset.currentLeadId = currentLeadId;
  }
  setTimeout(run, 80);
  setTimeout(run, 300);
  setTimeout(run, 900);
});
document.addEventListener('leader-v4:route-change', (event) => {
  if (event.detail?.leadId) {
    currentLeadId = event.detail.leadId;
    window.LeaderV4CurrentLeadId = currentLeadId;
    document.body.dataset.currentLeadId = currentLeadId;
  }
  setTimeout(run, 120);
  setTimeout(run, 500);
});
document.addEventListener('DOMContentLoaded', run);
setInterval(run, 1500);
