import { createContext, useState, useEffect } from 'react';
import api from '../api/client';

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('ads_jwt');
    const saved = localStorage.getItem('ads_user');
    if (token && saved) {
      try {
        setUser(JSON.parse(saved));
      } catch { /* invalid */ }
    }
    setLoading(false);
  }, []);

  async function login(email, password) {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('ads_jwt', data.data.token);
    localStorage.setItem('ads_user', JSON.stringify(data.data.user));
    setUser(data.data.user);
    return data.data.user;
  }

  function logout() {
    localStorage.removeItem('ads_jwt');
    localStorage.removeItem('ads_user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
}
