import api from './client';

export const tagAd = (id) => api.post(`/intelligence/tag/${id}`);
export const tagBatch = (limit) => api.post(`/intelligence/tag-batch?limit=${limit || 200}`);
export const generateInsights = (period) => api.post(`/intelligence/insights/generate?period=${period || 'daily'}`);
export const listInsights = (params) => api.get('/intelligence/insights', { params });
export const markInsightsRead = (ids) => api.post('/intelligence/insights/mark-read', { ids });
export const getSimilarAds = (adId, limit) => api.get(`/intelligence/similar/${adId}`, { params: { limit } });
export const getIndustryStyles = (industryId) => api.get(`/intelligence/industry-styles/${industryId}`);
export const getBudgetRecommendations = (clientId) => api.get(`/intelligence/budget-recommendations/${clientId}`);
export const getCreativeRecommendations = (industryId) => api.get(`/intelligence/creative-recommendations/${industryId}`);

export const findSimilarByImage = (imageDataUrl, limit) => api.post('/intelligence/similar-by-image', { image: imageDataUrl, limit });
