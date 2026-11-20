// npm start

import React, { useState, useEffect } from 'react';
import { API_URL, apiFetch } from './api';
import { normalizeUser } from './helpers';
import { Login, ForgotPassword, ResetPassword } from './components/AuthScreens';
import Dashboard from './Dashboard';

export default function App() {
  const [view, setView] = useState('login'); // 'login' | 'forgot' | 'reset' | 'app'
  const [resetToken, setResetToken] = useState(null);
  const [token, setToken] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (window.location.pathname.includes('reset-password') && t) {
      setResetToken(t);
      setView('reset');
    }
  }, []);

  // pinging the backend as soon as the site loads so it starts waking up while the person types their login
  useEffect(() => {
    fetch(`${API_URL}/health`).catch(() => {});
  }, []);

  const login = async (email, password) => {
    const data = await apiFetch('/auth/login', { method: 'POST', body: { email, password } });
    setToken(data.token);
    setCurrentUser(normalizeUser(data.user));
    setView('app');
  };

  const logout = () => {
    setToken(null);
    setCurrentUser(null);
    setView('login');
  };

  const backToLogin = () => {
    window.history.replaceState({}, '', '/');
    setResetToken(null);
    setView('login');
  };

  if (view === 'forgot') return <ForgotPassword onBack={() => setView('login')} />;
  if (view === 'reset') return <ResetPassword token={resetToken} onDone={backToLogin} />;
  if (view === 'app' && currentUser) return <Dashboard currentUser={currentUser} token={token} onLogout={logout} />;

  return <Login onSubmit={login} onForgot={() => setView('forgot')} />;
}