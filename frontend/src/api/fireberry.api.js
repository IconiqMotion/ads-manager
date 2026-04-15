import api from './client';

export const syncClients = () => api.post('/fireberry/sync-clients');
export const syncTokens = () => api.post('/fireberry/sync-tokens');
export const syncAll = () => api.post('/fireberry/sync-all');
export const getStatus = () => api.get('/fireberry/status');
export const previewClients = () => api.get('/fireberry/preview-clients');
export const previewTokens = () => api.get('/fireberry/preview-tokens');
