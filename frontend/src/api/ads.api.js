import api from './client';

export const getById = (id) => api.get(`/ads/${id}`);
export const getPerformance = (id, params) => api.get(`/ads/${id}/performance`, { params });
export const updateIndustry = (id, industry_id) => api.patch(`/ads/${id}/industry`, { industry_id });
export const classifyIndustry = (id) => api.post(`/ads/${id}/classify-industry`);
export const gallery = (params) => api.get('/gallery', { params });
