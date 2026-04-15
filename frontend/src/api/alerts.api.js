import api from './client';

export const listRules = () => api.get('/alerts/rules');
export const createRule = (data) => api.post('/alerts/rules', data);
export const deleteRule = (id) => api.delete(`/alerts/rules/${id}`);
export const listTriggers = (params) => api.get('/alerts/triggers', { params });
export const markRead = (ids) => api.post('/alerts/triggers/mark-read', { ids });
export const unreadCount = () => api.get('/alerts/triggers/unread-count');
export const evaluate = () => api.post('/alerts/evaluate');
