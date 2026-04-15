import api from './client';

export const getOverview = (params) => api.get('/dashboard/overview', { params });
export const getByIndustry = (params) => api.get('/dashboard/by-industry', { params });
export const getByClient = (id, params) => api.get(`/dashboard/by-client/${id}`, { params });
export const getTopAds = (params) => api.get('/dashboard/top-ads', { params });
export const getTrends = (params) => api.get('/performance/trends', { params });
