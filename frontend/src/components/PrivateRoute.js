import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import axios from 'axios';

/**
 * Decides where a visitor belongs before rendering a page.
 *
 *   not signed in                  -> /login
 *   signed in, onboarding not done -> /onboarding
 *   signed in, onboarding done     -> the requested page
 *
 * mode="app"        : pages for onboarded users (dashboard, archive, "/")
 * mode="onboarding" : the onboarding page itself (sends finished users to /dashboard)
 */
function PrivateRoute({ children, mode = 'app' }) {
  const [status, setStatus] = useState('loading'); // loading | anonymous | needs-onboarding | ready | error

  const check = async () => {
    setStatus('loading');
    try {
      await axios.get('/api/auth/me', { withCredentials: true });
      const { data } = await axios.get('/api/onboarding/status', { withCredentials: true });
      setStatus(data.needsOnboarding ? 'needs-onboarding' : 'ready');
    } catch (error) {
      // 401 = genuinely signed out. Anything else (timeout, server waking up) is NOT "signed out".
      setStatus(error.response?.status === 401 ? 'anonymous' : 'error');
    }
  };

  useEffect(() => {
    check();
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
        <button onClick={check}>Try again</button>
      </div>
    );
  }

  if (mode === 'onboarding') {
    return status === 'ready' ? <Navigate to="/dashboard" replace /> : children;
  }

  // mode === 'app'
  return status === 'needs-onboarding' ? <Navigate to="/onboarding" replace /> : children;
}

export default PrivateRoute;
