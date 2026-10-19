import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';

/**
 * Protects routes requiring authentication.
 * - If signed out (401), redirects to /login.
 * - If authenticated, renders the requested page.
 * - If server is waking up or unreachable, provides a retry button.
 */
function PrivateRoute({ children }) {
  const [status, setStatus] = useState('loading'); // loading | authenticated | anonymous | error

  const checkAuth = async () => {
    setStatus('loading');
    try {
      await axios.get('/api/auth/me', { withCredentials: true });
      setStatus('authenticated');
    } catch (error) {
      // 401 = genuinely signed out. Anything else (timeout, server waking up) is NOT "signed out".
      setStatus(error.response?.status === 401 ? 'anonymous' : 'error');
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  if (status === 'loading') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', flexDirection: 'column', gap: '1rem'
      }}>
        <div className="loading" style={{ width: '40px', height: '40px' }}></div>
        <p style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>
      </div>
    );
  }

  if (status === 'anonymous') return <Navigate to="/login" replace />;

  if (status === 'error') {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', flexDirection: 'column', gap: '1rem', textAlign: 'center', padding: '1rem'
      }}>
        <p>The server is waking up or unreachable. This can take up to a minute on the free tier.</p>
        <button onClick={checkAuth}>Try again</button>
      </div>
    );
  }

  return children;
}

export default PrivateRoute;
