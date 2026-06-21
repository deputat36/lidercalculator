function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function check() {
  const tabs = ['management_dashboard', 'workdesk', 'leads', 'public_lead_audit', 'orders', 'order_control', 'finance_control', 'production', 'production_control', 'offers', 'catalog'];
  return tabs.map((key) => ({ key, ok: Boolean(document.querySelector(`[data-v4-tab-button="${key}"]`)) }));
}

function render() {
  const host = document.querySelector('#crmDiagnosticsBox') || document.querySelector('#crmWorkspace .v4-card') || document.getElementById('crmWorkspace');
  if (!host || document.getElementById('crmUiSelfcheckV1')) return;
  const box = document.createElement('details');
  box.id = 'crmUiSelfcheckV1';
  box.style.marginTop = '12px';
  box.innerHTML = '<summary style="font-weight:900;cursor:pointer">Проверка загруженных разделов CRM</summary><div id="crmUiSelfcheckV1Result" style="display:grid;gap:6px;margin-top:10px"></div>';
  host.appendChild(box);
  refresh();
}

function refresh() {
  const result = document.getElementById('crmUiSelfcheckV1Result');
  if (!result) return;
  result.innerHTML = check().map((item) => `<div style="display:flex;justify-content:space-between;gap:10px;border:1px solid #e2e8f0;border-radius:12px;padding:8px;background:#fff"><b>${esc(item.key)}</b><span style="font-weight:900;color:${item.ok ? '#166534' : '#92400e'}">${item.ok ? 'OK' : 'нет кнопки'}</span></div>`).join('');
}

function boot() {
  render();
  document.addEventListener('leader-v4:crm-ready', () => setTimeout(() => { render(); refresh(); }, 500));
  document.addEventListener('leader-v4:tab-opened', () => setTimeout(refresh, 300));
  setTimeout(() => { render(); refresh(); }, 1500);
  setInterval(refresh, 5000);
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
