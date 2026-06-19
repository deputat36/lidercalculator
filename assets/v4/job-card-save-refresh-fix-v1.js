import { supabaseClient } from './supabase-client.js';
import { friendlyError } from './api.js';
import { v4State } from './state.js';
import { setStatus, toast } from './ui.js';

const PRODUCTION_OLD_FIELDS = 'id,order_id,production_status,sent_to_contractor_at,ready_at,title,layout_status,priority,deadline,file_url,technical_task,contractor_comment,internal_comment';
const INSTALLATION_OLD_FIELDS = 'id,order_id,install_status,started_at,completed_at,title,installer_name,installer_phone,address,scheduled_at,before_photo_url,after_photo_url,technical_task,tools_required,installer_comment';

let saving = false;

const nowIso = () => new Date().toISOString();
const val = (id) => document.getElementById(id)?.value?.trim() || '';

async function safeInsert(table, payload) {
  try {
    await supabaseClient.from(table).insert(payload);
  } catch (error) {
    console.warn(`[leader-v4] Не удалось записать журнал ${table}`, error);
  }
}

function reopenProduction(jobId) {
  document.getElementById('productionJobCardV2')?.remove();
  const button = document.querySelector(`[data-open-production-job-card="${CSS.escape(jobId)}"]`);
  if (button) setTimeout(() => button.click(), 150);
}

function reopenInstallation(jobId) {
  document.getElementById('installationJobCardV2')?.remove();
  const button = document.querySelector(`[data-open-installation-job-card="${CSS.escape(jobId)}"]`);
  if (button) setTimeout(() => button.click(), 150);
}

async function saveProduction(jobId) {
  if (saving) return;
  saving = true;
  try {
    setStatus('Сохраняю производственное задание...', 'warn');
    const oldResponse = await supabaseClient.from('leader_production_jobs').select(PRODUCTION_OLD_FIELDS).eq('id', jobId).single();
    if (oldResponse.error || !oldResponse.data) throw oldResponse.error || new Error('Производственное задание не найдено');
    const old = oldResponse.data;
    const status = val('jobEditStatus') || old.production_status || 'Не передано';
    const deadlineRaw = val('jobEditDeadline');
    const patch = {
      title: val('jobEditTitle') || old.title,
      production_status: status,
      layout_status: val('jobEditLayout') || old.layout_status,
      priority: val('jobEditPriority') || old.priority,
      deadline: deadlineRaw ? new Date(deadlineRaw).toISOString() : null,
      file_url: val('jobEditFile') || null,
      technical_task: val('jobEditTask') || null,
      contractor_comment: val('jobEditContractorComment') || null,
      internal_comment: val('jobEditInternalComment') || null,
      updated_at: nowIso()
    };
    if (status === 'Передано в производство') patch.sent_to_contractor_at = old.sent_to_contractor_at || nowIso();
    if (status === 'Готово') patch.ready_at = old.ready_at || nowIso();
    const response = await supabaseClient.from('leader_production_jobs').update(patch).eq('id', jobId);
    if (response.error) throw response.error;
    if (old.order_id) {
      const orderResponse = await supabaseClient.from('leader_orders').update({
        production_status: status,
        layout_status: patch.layout_status,
        layout_link: patch.file_url,
        current_stage: `Производство: ${status}`,
        updated_at: nowIso(),
        stage_updated_at: nowIso()
      }).eq('id', old.order_id);
      if (orderResponse.error) throw orderResponse.error;
    }
    await safeInsert('leader_production_events', { job_id: jobId, order_id: old.order_id, event_type: 'Обновление задания', old_status: old.production_status, new_status: status, body: 'Производственное задание обновлено из карточки задания', created_by: v4State.user?.id || null, created_by_email: v4State.user?.email || null });
    toast('Производственное задание сохранено');
    setStatus('Производственное задание сохранено', 'good');
    document.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: { id: old.order_id, production_status: status } } }));
    document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab: 'production' } }));
    reopenProduction(jobId);
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка задания: ${friendlyError(error)}`, 'error');
  } finally {
    saving = false;
  }
}

async function saveInstallation(jobId) {
  if (saving) return;
  saving = true;
  try {
    setStatus('Сохраняю монтажное задание...', 'warn');
    const oldResponse = await supabaseClient.from('leader_installation_jobs').select(INSTALLATION_OLD_FIELDS).eq('id', jobId).single();
    if (oldResponse.error || !oldResponse.data) throw oldResponse.error || new Error('Монтажное задание не найдено');
    const old = oldResponse.data;
    const status = val('installStatus') || old.install_status || 'Нужно назначить';
    const scheduledRaw = val('installScheduled');
    const patch = {
      title: val('installTitle') || old.title,
      install_status: status,
      installer_name: val('installInstaller') || null,
      installer_phone: val('installInstallerPhone') || null,
      address: val('installAddress') || null,
      scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : null,
      before_photo_url: val('installBefore') || null,
      after_photo_url: val('installAfter') || null,
      technical_task: val('installTask') || null,
      tools_required: val('installTools') || null,
      installer_comment: val('installComment') || null,
      updated_by: v4State.user?.id || null,
      updated_at: nowIso()
    };
    if (status === 'В работе') patch.started_at = old.started_at || nowIso();
    if (status === 'Выполнен') patch.completed_at = old.completed_at || nowIso();
    const response = await supabaseClient.from('leader_installation_jobs').update(patch).eq('id', jobId);
    if (response.error) throw response.error;
    if (old.order_id) {
      const orderResponse = await supabaseClient.from('leader_orders').update({
        installation_status: status,
        installation_address: patch.address,
        installation_scheduled_at: patch.scheduled_at,
        installer_name: patch.installer_name,
        installer_phone: patch.installer_phone,
        current_stage: `Монтаж: ${status}`,
        updated_at: nowIso(),
        stage_updated_at: nowIso()
      }).eq('id', old.order_id);
      if (orderResponse.error) throw orderResponse.error;
    }
    await safeInsert('leader_installation_events', { job_id: jobId, order_id: old.order_id, event_type: 'Обновление монтажа', old_status: old.install_status, new_status: status, body: 'Монтажное задание обновлено из карточки монтажа', created_by: v4State.user?.id || null });
    toast('Монтаж сохранён');
    setStatus('Монтажное задание сохранено', 'good');
    document.dispatchEvent(new CustomEvent('leader-v4-order-updated', { detail: { order: { id: old.order_id, installation_status: status } } }));
    document.dispatchEvent(new CustomEvent('leader-v4:tab-opened', { detail: { tab: 'production' } }));
    reopenInstallation(jobId);
  } catch (error) {
    toast(friendlyError(error));
    setStatus(`Ошибка монтажа: ${friendlyError(error)}`, 'error');
  } finally {
    saving = false;
  }
}

window.addEventListener('click', (event) => {
  const production = event.target.closest?.('[data-save-production-job]');
  if (production) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    saveProduction(production.dataset.saveProductionJob);
    return;
  }
  const installation = event.target.closest?.('[data-save-installation-job]');
  if (installation) {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();
    saveInstallation(installation.dataset.saveInstallationJob);
  }
}, true);
