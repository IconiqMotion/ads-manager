import api from './client';

export const list = (params) => api.get('/clients', { params });
export const getById = (id) => api.get(`/clients/${id}`);
export const create = (data) => api.post('/clients', data);
export const update = (id, data) => api.put(`/clients/${id}`, data);
export const remove = (id) => api.delete(`/clients/${id}`);
