import api from './client';

export const list = (params) => api.get('/campaigns', { params });
export const getById = (id) => api.get(`/campaigns/${id}`);
export const getAdSets = (id) => api.get(`/campaigns/${id}/adsets`);
export const getAdsForAdSet = (adsetId) => api.get(`/adsets/${adsetId}/ads`);
