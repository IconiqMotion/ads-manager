import axios from 'axios';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' }
});

// JWT interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('ads_jwt');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Auto-logout on 401
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('ads_jwt');
      localStorage.removeItem('ads_user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
