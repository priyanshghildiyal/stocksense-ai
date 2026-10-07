const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '').replace(/\/$/, '');

function authHeaders() {
  const token = window.sessionStorage.getItem('stocksense:accessToken');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    credentials: 'include',
    cache: 'no-store',
    ...options,
    headers: {
      Accept: 'application/json',
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...authHeaders(),
      ...(options.headers || {}),
    },
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data?.error?.message || `Request failed (${response.status})`;
    const error = new Error(message);
    error.status = response.status;
    error.code = data?.error?.code;
    error.data = data;
    throw error;
  }
  return data;
}

export const api = {
  register: (body) => request('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),
  login: (body) => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  logout: () => request('/api/auth/logout', { method: 'POST', body: '{}' }),
  me: () => request('/api/auth/me'),
  updateMe: (body) => request('/api/auth/me', { method: 'PATCH', body: JSON.stringify(body) }),
  history: (ticker, range = '1y') => request(`/api/market/history/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}`),
  fundamentals: (ticker) => request(`/api/market/fundamentals/${encodeURIComponent(ticker)}`),
  financials: (ticker) => request(`/api/market/financials/${encodeURIComponent(ticker)}`),
  technicals: (ticker, range = '1y') => request(`/api/market/technicals/${encodeURIComponent(ticker)}?range=${encodeURIComponent(range)}`),
  ownership: (ticker) => request(`/api/market/ownership/${encodeURIComponent(ticker)}`),
  indices: () => request('/api/market/indices'),
  screener: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
    return request(`/api/market/screener${q ? `?${q}` : ''}`);
  },
  news: (params = {}) => {
    const q = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== '')).toString();
    return request(`/api/news${q ? `?${q}` : ''}`);
  },
  researchAsk: (body) => request('/api/research/ask', { method: 'POST', body: JSON.stringify(body) }),
  researchStatus: () => request('/api/research/status'),
  forecast: (ticker, horizonDays = 21) => request(`/api/forecast/${encodeURIComponent(ticker)}?horizonDays=${horizonDays}`),
  risk: (ticker) => request(`/api/risk/${encodeURIComponent(ticker)}`),
  riskRadar: () => request('/api/risk'),
  industry: (sector) => request(`/api/industry/${encodeURIComponent(sector)}`),
  watchlistGet: () => request('/api/watchlist'),
  watchlistAdd: (ticker) => request('/api/watchlist/items', { method: 'POST', body: JSON.stringify({ ticker }) }),
  watchlistRemove: (ticker) => request(`/api/watchlist/items/${encodeURIComponent(ticker)}`, { method: 'DELETE' }),
  portfolioGet: () => request('/api/portfolio'),
  portfolioAdd: (body) => request('/api/portfolio', { method: 'POST', body: JSON.stringify(body) }),
  portfolioRemove: (id) => request(`/api/portfolio/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  alertsGet: () => request('/api/alerts'),
  alertsCreate: (body) => request('/api/alerts', { method: 'POST', body: JSON.stringify(body) }),
  alertsDelete: (id) => request(`/api/alerts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  refresh: () => request('/api/auth/refresh', { method: 'POST', body: '{}' }),
  health: () => request('/api/health'),
  adminHealth: () => request('/api/health/admin'),
  whatChanged: () => request('/api/workspace/what-changed'),
  createSnapshot: () => request('/api/workspace/snapshots', { method: 'POST', body: '{}' }),
  notesList: () => request('/api/workspace/notes'),
  notesCreate: (body) => request('/api/workspace/notes', { method: 'POST', body: JSON.stringify(body) }),
  reportCreate: (body) => request('/api/reports', { method: 'POST', body: JSON.stringify(body) }),
  reportsList: () => request('/api/reports'),
  documentAnalyze: (body) => request('/api/research/documents', { method: 'POST', body: JSON.stringify(body) }),
};

export function persistSession(result) {
  // Tokens are normally held in httpOnly cookies. Keep this compatible with the
  // current Bearer-token flow only when a server explicitly returns an access token.
  if (result?.accessToken) window.sessionStorage.setItem('stocksense:accessToken', result.accessToken);
  if (result?.user) window.sessionStorage.setItem('stocksense:user', JSON.stringify(result.user));
}

export async function refreshSession() {
  const result = await api.refresh();
  persistSession(result);
  return result;
}

export function clearSession() {
  window.sessionStorage.removeItem('stocksense:accessToken');
  window.sessionStorage.removeItem('stocksense:refreshToken');
  window.sessionStorage.removeItem('stocksense:user');
}

export function readSessionUser() {
  try {
    return JSON.parse(window.sessionStorage.getItem('stocksense:user') || 'null');
  } catch {
    return null;
  }
}
