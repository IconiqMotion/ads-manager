import api from './client';

export const list = () => api.get('/industries');
export const create = (data) => api.post('/industries', data);
export const update = (id, data) => api.put(`/industries/${id}`, data);
export const remove = (id) => api.delete(`/industries/${id}`);
