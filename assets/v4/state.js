export const v4State = {
  session: null,
  user: null,
  profile: null,
  profileLoaded: false,
  authBusy: false,
  crmReady: false,
  status: 'Проверяю вход',
  route: {
    leadId: null
  },
  leads: [],
  leadsLoaded: false,
  leadsBusy: false,
  leadsError: null,
  leadFilters: {
    status: 'active',
    source: 'Все',
    search: ''
  },
  currentLead: null,
  currentLeadBusy: false,
  currentLeadError: null,
  leadNeeds: [],
  leadNeedsBusy: false,
  leadNeedsError: null,
  calculations: [],
  calculationsBusy: false,
  calculationsError: null,
  offers: [],
  offersBusy: false,
  offersError: null
};

const subscribers = new Set();

export function setState(patch) {
  Object.assign(v4State, patch);
  subscribers.forEach((subscriber) => subscriber(v4State));
}

export function setLeadFilters(patch) {
  setState({ leadFilters: { ...v4State.leadFilters, ...patch } });
}

export function setRoute(patch) {
  setState({ route: { ...v4State.route, ...patch } });
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
    route: {
      leadId: null
    },
    leads: [],
    leadsLoaded: false,
    leadsBusy: false,
    leadsError: null,
    leadFilters: {
      status: 'active',
      source: 'Все',
      search: ''
    },
    currentLead: null,
    currentLeadBusy: false,
    currentLeadError: null,
    leadNeeds: [],
    leadNeedsBusy: false,
    leadNeedsError: null,
    calculations: [],
    calculationsBusy: false,
    calculationsError: null,
    offers: [],
    offersBusy: false,
    offersError: null
  });
}
