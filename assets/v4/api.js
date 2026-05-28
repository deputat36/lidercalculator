import { V4_CONFIG } from './config.js';

export function timeout(promise, ms = V4_CONFIG.timeouts.requestMs, message = 'Операция заняла слишком много времени') {
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = window.setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => window.clearTimeout(timer));
}

export function isNetworkError(error) {
  const text = String(error?.message || error || '').toLowerCase();
  return text.includes('failed to fetch') || text.includes('network') || text.includes('timeout') || text.includes('ожид');
}

export function friendlyError(error) {
  return isNetworkError(error) ? 'Ошибка сети' : (error?.message || String(error || 'Ошибка'));
}

export async function fetchJson(url, options = {}, timeoutMs = V4_CONFIG.timeouts.requestMs, timeoutMessage = 'Сервер долго не отвечает') {
  const response = await timeout(fetch(url, options), timeoutMs, timeoutMessage);
  const raw = await response.text();
  let data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (_) {
      data = raw;
    }
  }
  if (!response.ok) {
    const message = data?.error_description || data?.msg || data?.message || `HTTP ${response.status}`;
    const error = new Error(message);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return { data, response };
}
