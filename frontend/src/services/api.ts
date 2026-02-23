import axios from 'axios';

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000') + '/api';

const api = axios.create({
    baseURL: API_BASE,
    headers: { 'Content-Type': 'application/json' },
});

// Add JWT token to every request
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('xcreener_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auto-logout on 401
api.interceptors.response.use(
    (response) => response,
    (error) => {
        if (error.response?.status === 401) {
            localStorage.removeItem('xcreener_token');
            localStorage.removeItem('xcreener_user');
            window.location.href = '/login';
        }
        return Promise.reject(error);
    }
);

// ─── Auth ───────────────────────────────────────────────────────────────────
export const authAPI = {
    register: (data: { email: string; username: string; password: string }) =>
        api.post('/auth/register', data),
    login: (data: { username: string; password: string }) =>
        api.post('/auth/login', data),
    getProfile: () => api.get('/auth/me'),
    updateProfile: (data: any) => api.patch('/auth/me', data),
    testTelegram: () => api.post('/auth/test-telegram'),
};

// ─── Dashboard ──────────────────────────────────────────────────────────────
export const dashboardAPI = {
    getStats: () => api.get('/dashboard/stats'),
    getTickerStats: () => api.get('/dashboard/ticker-stats'),
    getRecentSignals: (params?: any) => api.get('/dashboard/recent-signals', { params }),
    getFetchStatus: () => api.get('/dashboard/fetch-status'),
};

// ─── Scanner ────────────────────────────────────────────────────────────────
export const scannerAPI = {
    runScan: (timeframe: string) => api.post(`/scanner/run/${timeframe}`),
    getProgress: () => api.get('/scanner/progress'),
    analyzeTicker: (symbol: string, timeframe: string) =>
        api.post(`/scanner/analyze/${symbol}`, null, { params: { timeframe } }),
    updateData: () => api.post('/scanner/update-data'),
    refreshUniverse: () => api.post('/scanner/refresh-universe'),
    searchTickers: (q: string, exchange?: string) =>
        api.get('/scanner/tickers', { params: { q, exchange } }),
};

// ─── Journal ────────────────────────────────────────────────────────────────
export const journalAPI = {
    list: (params?: any) => api.get('/journal/', { params }),
    create: (data: any) => api.post('/journal/', data),
    get: (id: number) => api.get(`/journal/${id}`),
    update: (id: number, data: any) => api.patch(`/journal/${id}`, data),
    delete: (id: number) => api.delete(`/journal/${id}`),
    getStats: () => api.get('/journal/stats/summary'),
};

// ─── Alerts ─────────────────────────────────────────────────────────────────
export const alertsAPI = {
    list: (params?: any) => api.get('/alerts/', { params }),
    count: () => api.get('/alerts/count'),
};
// ─── Explorer ───────────────────────────────────────────────────────────────
export const explorerAPI = {
    listTickers: (params?: any) => api.get('/explorer/tickers', { params }),
    getTickerDetail: (symbol: string) => api.get(`/explorer/tickers/${symbol}`),
    getUniverseStats: () => api.get('/explorer/stats'),
};

export default api;
