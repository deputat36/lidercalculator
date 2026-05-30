export const v4State = {
  session: null,
  user: null,
  profile: null,
  profileLoaded: false,
  authBusy: false,
  crmReady: false,
  status: 'Проверяю вход',
  leads: [],
  leadsLoaded: false,
  leadsBusy: false,
  leadsError: null,
  leadFilters: {
    status: 'active',
    source: 'Все',
    search: ''
  }
};

const subscribers = new Set();

export function setState(patch) {
  Object.assign(v4State, patch);
  subscribers.forEach((subscriber) => subscriber(v4State));
}

export function setLeadFilters(patch) {
  setState({ leadFilters: { ...v4State.leadFilters, ...patch } });
}

export function subscribeState(subscriber) {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export function resetAuthState() {
  setState({
    session: null,
    user: null,
    profile: null,
    profileLoaded: false,
    authBusy: false,
    crmReady: false,
    status: 'Нужен вход',
    leads: [],
    leadsLoaded: false,
    leadsBusy: false,
    leadsError: null,
    leadFilters: {
      status: 'active',
      source: 'Все',
      search: ''
    }
  });
}
