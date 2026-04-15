import api from './client';

export const rawQuery = (data) => api.post('/query/raw', data);
export const builderQuery = (data) => api.post('/query/builder', data);
export const getSchema = () => api.get('/query/schema');
export const getTableSchema = (table) => api.get(`/query/schema/${table}`);
export const getRelationships = () => api.get('/query/schema/relationships');
export const saveQuery = (data) => api.post('/query/saved', data);
export const listSaved = () => api.get('/query/saved');
export const getSaved = (id) => api.get(`/query/saved/${id}`);
export const runSaved = (id) => api.post(`/query/saved/${id}/run`);
export const deleteSaved = (id) => api.delete(`/query/saved/${id}`);
