import { supabaseClient } from './supabase-client.js';
import { timeout, friendlyError } from './api.js';

const CHECKS = [
  { key: 'profile', label: 'Профиль CRM', run: async (user) => supabaseClient.from('leader_user_profiles').select('user_id,email,role,is_active,full_name').eq('user_id', user.id).maybeSingle() },
  { key: 'leads', label: 'Заявки', run: async () => supabaseClient.from('leader_leads').select('id').limit(1) },
  { key: 'orders', label: 'Заказы', run: async () => supabaseClient.from('leader_orders').select('id').limit(1) },
  { key: 'catalog', label: 'Номенклатура', run: async () => supabaseClient.from('leader_catalog').select('id').limit(1) },
  { key: 'calculations', label: 'Расчёты', run: async () => supabaseClient.from('leader_lead_calculations').select('id').limit(1) },
  { key: 'offers', label: 'КП', run: async () => supabaseClient.from('leader_commercial_offers').select('id').limit(1) },
  { key: 'production', label: 'Производство', run: async () => supabaseClient.from('leader_production_jobs').select('id').limit(1) },
  { key: 'installation', label: 'Монтаж', run: async () => supabaseClient.from('leader_installation_jobs').select('id').limit(1) }
];

function esc(value) {
  return String(value ?? '').replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
}

function ensureStyles() {
  if (document.getElementById('crmDiagnosticsV1Styles')) return;
  const style = document.createElement('style');
  style.id = 'crmDiagnosticsV1Styles';
  style.textContent = `
    .v4-diagnostics-box{margin-top:14px;border:1px solid #dbeafe;background:#f8fbff;border-radius:18px;padding:14px;display:grid;gap:10px}
    .v4-diagnostics-head{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}
    .v4-diagnostics-head h3{margin:0}.v4-diagnostics-list{display:grid;gap:8px}
    .v4-diagnostic-row{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;border:1px solid #e2e8f0;background:#fff;border-radius:14px;padding:10px}
    .v4-diagnostic-row b{display:block}.v4-diagnostic-row span{display:block;color:#64748b;font-size:12px;margin-top:3px}
    .v4-diagnostic-mark{font-weight:900;border-radius:999px;padding:5px 8px;white-space:nowrap;background:#e2e8f0;color:#334155}
    .v4-diagnostic-mark.good{background:#dcfce7;color:#166534}.v4-diagnostic-mark.error{background:#fee2e2;color:#991b1b}.v4-diagnostic-mark.warn{background:#fef3c7;color:#92400e}
  `;
  document.head.appendChild(style);
}

function ensureBox() {
  ensureStyles();
  const profileCard = document.querySelector('#crmWorkspace .v4-card');
  if (!profileCard) return null;
  let box = document.getElementById('crmDiagnosticsBox');
  if (box) return box;
  const html = `
    <section id="crmDiagnosticsBox" class="v4-diagnostics-box">
      <div class="v4-diagnostics-head">
        <div><h3>Проверка системы</h3><p class="v4-muted">Запускается вручную. Проверяет вход, профиль и чтение основных таблиц.</p></div>
        <button type="button" class="v4-primary" data-run-crm-diagnostics>Проверить CRM</button>
      </div>
      <div id="crmDiagnosticsResult" class="v4-diagnostics-list"><div class="v4-empty">Нажмите «Проверить CRM», если есть проблемы со входом или загрузкой данных.</div></div>
    </section>
  `;
  profileCard.insertAdjacentHTML('beforeend', html);
  return document.getElementById('crmDiagnosticsBox');
}

function row(label, status, text) {
  const mark = status === 'ok' ? 'good' : status === 'warn' ? 'warn' : 'error';
  const labelText = status === 'ok' ? 'OK' : status === 'warn' ? 'Внимание' : 'Ошибка';
  return `<div class="v4-diagnostic-row"><div><b>${esc(label)}</b><span>${esc(text)}</span></div><div class="v4-diagnostic-mark ${mark}">${labelText}</div></div>`;
}

async function runDiagnostics() {
  const result = document.getElementById('crmDiagnosticsResult');
  if (!result) return;
  result.innerHTML = '<div class="v4-empty">Проверяю CRM...</div>';
  const rows = [];
  let user = null;
  try {
    const auth = await timeout(supabaseClient.auth.getUser(), 9000, 'Пользователь не получен за 9 секунд');
    if (auth.error) throw auth.error;
    user = auth.data?.user || null;
    rows.push(row('Supabase Auth', user ? 'ok' : 'error', user ? `Вход выполнен: ${user.email || user.id}` : 'Активного пользователя нет'));
  } catch (error) {
    rows.push(row('Supabase Auth', 'error', friendlyError(error)));
  }

  if (user) {
    for (const check of CHECKS) {
      try {
        const response = await timeout(check.run(user), 12000, `${check.label} не ответил за 12 секунд`);
        if (response.error) throw response.error;
        if (check.key === 'profile') {
          const profile = response.data;
          rows.push(row(check.label, profile?.is_active === false ? 'warn' : 'ok', profile ? `${profile.email || '—'} · роль: ${profile.role || '—'} · ${profile.is_active === false ? 'отключён' : 'активен'}` : 'Профиль не найден'));
        } else {
          rows.push(row(check.label, 'ok', `Чтение доступно. Строк в тестовом ответе: ${(response.data || []).length}`));
        }
      } catch (error) {
        rows.push(row(check.label, 'error', friendlyError(error)));
      }
    }
  }
  result.innerHTML = rows.join('');
}

function boot() {
  ensureBox();
  document.addEventListener('leader-v4:crm-ready', () => setTimeout(ensureBox, 400));
  document.addEventListener('click', (event) => {
    if (event.target.closest?.('[data-run-crm-diagnostics]')) runDiagnostics();
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
