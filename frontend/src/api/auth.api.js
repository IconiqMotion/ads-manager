import api from './client';

export const login = (email, password) => api.post('/auth/login', { email, password });
export const getMe = () => api.get('/auth/me');
export const register = (data) => api.post('/auth/register', data);
export const createApiKey = (data) => api.post('/auth/api-keys', data);
export const listApiKeys = () => api.get('/auth/api-keys');
export const deleteApiKey = (id) => api.delete(`/auth/api-keys/${id}`);
