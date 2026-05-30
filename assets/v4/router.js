import { setRoute } from './state.js';

function getLeadIdFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const value = params.get('lead') || params.get('id') || '';
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value) ? value : null;
}

export function currentLeadUrl(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('lead', id);
  return `${url.pathname}${url.search}`;
}

export function clearLeadUrl() {
  const url = new URL(window.location.href);
  url.searchParams.delete('lead');
  url.searchParams.delete('id');
  window.history.pushState({}, '', `${url.pathname}${url.search}`);
  setRoute({ leadId: null });
  document.dispatchEvent(new CustomEvent('leader-v4:route-change', { detail: { leadId: null } }));
}

export function openLeadRoute(id) {
  const url = new URL(window.location.href);
  url.searchParams.set('lead', id);
  window.history.pushState({}, '', `${url.pathname}${url.search}`);
  setRoute({ leadId: id });
  document.dispatchEvent(new CustomEvent('leader-v4:route-change', { detail: { leadId: id } }));
}

export function bootRouter() {
  const leadId = getLeadIdFromUrl();
  setRoute({ leadId });
  window.addEventListener('popstate', () => {
    const nextLeadId = getLeadIdFromUrl();
    setRoute({ leadId: nextLeadId });
    document.dispatchEvent(new CustomEvent('leader-v4:route-change', { detail: { leadId: nextLeadId } }));
  });
}

document.addEventListener('DOMContentLoaded', bootRouter);
