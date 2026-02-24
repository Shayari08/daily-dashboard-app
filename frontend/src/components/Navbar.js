import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

function Navbar({ user, activeView, setActiveView, taskCount, onDailyReset, onToggleChat }) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
      navigate('/login');
    } catch (error) {
      console.error('Failed to logout:', error);
      navigate('/login');
    }
  };

  const handleDeleteAccount = async () => {
    const confirmation = window.prompt(
      'This will permanently delete your account and ALL data.\n\nType "DELETE" to confirm:'
    );

    if (confirmation !== 'DELETE') {
      if (confirmation !== null) {
        alert('Account deletion cancelled. You must type DELETE exactly.');
      }
      return;
    }

    if (!window.confirm('Are you absolutely sure? This CANNOT be undone!')) return;

    try {
      await axios.delete('/api/profile/account', { withCredentials: true });
      alert('Your account has been deleted.');
      navigate('/login');
    } catch (error) {
      console.error('Failed to delete account:', error);
      alert('Failed to delete account. Please try again.');
    }
  };

  const onDashboard = location.pathname === '/dashboard';
  const onArchive = location.pathname === '/archive';

  const handleTabClick = (view) => {
    if (onDashboard && setActiveView) {
      setActiveView(view);
    } else {
      navigate('/dashboard');
    }
  };

  return (
    <>
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="logo">Daily Dashboard</h1>
          {user && <span className="user-greeting">Hey, {user.name.split(' ')[0]}! 👋</span>}
        </div>

        <div className="header-actions">
          {onDailyReset && (
            <button
              className="btn-icon"
              onClick={onDailyReset}
              title="Daily Reset"
            >
              📦
            </button>
          )}
          {onToggleChat && (
            <button
              className="btn-icon"
              onClick={onToggleChat}
              title="AI Assistant"
            >
              💬
            </button>
          )}
          <button
            className="btn-icon btn-danger"
            onClick={handleDeleteAccount}
            title="Delete Account"
          >
            ⚠️
          </button>
          <button
            className="btn-icon"
            onClick={handleLogout}
            title="Logout"
          >
            🚪
          </button>
        </div>
      </header>

      <nav className="dashboard-nav">
        <button
          className={`nav-btn ${onDashboard && activeView === 'tasks' ? 'active' : ''}`}
          onClick={() => handleTabClick('tasks')}
        >
          📅 Tasks
          {taskCount > 0 && <span className="badge">{taskCount}</span>}
        </button>
        <button
          className={`nav-btn ${onDashboard && activeView === 'habits' ? 'active' : ''}`}
          onClick={() => handleTabClick('habits')}
        >
          📈 Habits
        </button>
        <button
          className={`nav-btn ${onDashboard && activeView === 'insights' ? 'active' : ''}`}
          onClick={() => handleTabClick('insights')}
        >
          ⚡ Insights
        </button>
        <button
          className={`nav-btn ${onDashboard && activeView === 'recommendations' ? 'active' : ''}`}
          onClick={() => handleTabClick('recommendations')}
        >
          📖 Recommendations
        </button>
        <button
          className={`nav-btn ${onArchive ? 'active' : ''}`}
          onClick={() => navigate('/archive')}
        >
          📚 Archive
        </button>
      </nav>
    </>
  );
}

export default Navbar;
