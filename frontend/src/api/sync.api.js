import api from './client';

export const triggerOne = (accountId) => api.post(`/sync/trigger/${accountId}`);
export const triggerAll = () => api.post('/sync/trigger-all');
export const statusList = (params) => api.get('/sync/status', { params });
export const statusDetail = (id) => api.get(`/sync/status/${id}`);
