import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';

function Navbar({ user, activeView, setActiveView, taskCount, onDailyReset, onToggleChat }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteInput, setDeleteInput] = useState('');
  const [deleteStep, setDeleteStep] = useState(1); // 1 = type DELETE, 2 = final confirm
  const [deleteError, setDeleteError] = useState('');

  const handleLogout = async () => {
    try {
      await axios.post('/api/auth/logout', {}, { withCredentials: true });
      navigate('/login');
    } catch (error) {
      console.error('Failed to logout:', error);
      navigate('/login');
    }
  };

  const openDeleteModal = () => {
    setShowDeleteModal(true);
    setDeleteInput('');
    setDeleteStep(1);
    setDeleteError('');
  };

  const closeDeleteModal = () => {
    setShowDeleteModal(false);
    setDeleteInput('');
    setDeleteStep(1);
    setDeleteError('');
  };

  const handleDeleteStep1 = () => {
    if (deleteInput !== 'DELETE') {
      setDeleteError('You must type DELETE exactly (all caps).');
      return;
    }
    setDeleteStep(2);
    setDeleteError('');
  };

  const handleDeleteConfirm = async () => {
    try {
      await axios.delete('/api/profile/account', { withCredentials: true });
      closeDeleteModal();
      navigate('/login');
    } catch (error) {
      console.error('Failed to delete account:', error);
      if (error.response?.status === 401) {
        setDeleteError('You are not logged in. Please log in and try again.');
      } else if (!error.response) {
        setDeleteError('Cannot reach the server. Make sure the backend is running.');
      } else {
        setDeleteError('Failed to delete account. Please try again.');
      }
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

  const isActive = (view) => onDashboard && activeView === view;

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
            onClick={openDeleteModal}
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

      {/* Top nav — hidden on mobile, replaced by bottom nav */}
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

      {/* Bottom nav — visible on mobile only */}
      <nav className="bottom-nav">
        <button
          className={`bottom-nav-btn ${isActive('tasks') ? 'active' : ''}`}
          onClick={() => handleTabClick('tasks')}
        >
          <span className="bnav-icon">📅</span>
          Tasks
          {taskCount > 0 && <span className="bnav-badge">{taskCount}</span>}
        </button>
        <button
          className={`bottom-nav-btn ${isActive('habits') ? 'active' : ''}`}
          onClick={() => handleTabClick('habits')}
        >
          <span className="bnav-icon">📈</span>
          Habits
        </button>
        <button
          className={`bottom-nav-btn ${isActive('insights') ? 'active' : ''}`}
          onClick={() => handleTabClick('insights')}
        >
          <span className="bnav-icon">⚡</span>
          Insights
        </button>
        <button
          className={`bottom-nav-btn ${isActive('recommendations') ? 'active' : ''}`}
          onClick={() => handleTabClick('recommendations')}
        >
          <span className="bnav-icon">📖</span>
          Recs
        </button>
        <button
          className={`bottom-nav-btn ${onArchive ? 'active' : ''}`}
          onClick={() => navigate('/archive')}
        >
          <span className="bnav-icon">📚</span>
          Archive
        </button>
      </nav>

      {/* Delete Account Modal */}
      {showDeleteModal && (
        <div className="modal-overlay" onClick={closeDeleteModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>⚠️ Delete Account</h3>
              <button className="modal-close" onClick={closeDeleteModal}>×</button>
            </div>
            <div className="modal-body">
              {deleteStep === 1 ? (
                <>
                  <p className="modal-instruction">
                    This will permanently delete your account and <strong>ALL your data</strong>. This cannot be undone.
                  </p>
                  <p className="modal-instruction" style={{ marginTop: '16px' }}>
                    Type <strong>DELETE</strong> to continue:
                  </p>
                  <input
                    type="text"
                    value={deleteInput}
                    onChange={(e) => { setDeleteInput(e.target.value); setDeleteError(''); }}
                    placeholder="Type DELETE here"
                    style={{
                      width: '100%',
                      padding: '12px',
                      border: '2px solid rgba(217, 119, 87, 0.2)',
                      borderRadius: '10px',
                      fontSize: '15px',
                      marginTop: '8px',
                      fontFamily: 'inherit',
                      background: 'var(--cream)',
                      color: 'var(--charcoal)',
                      outline: 'none',
                    }}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleDeleteStep1()}
                  />
                  {deleteError && (
                    <p style={{ color: '#C96847', fontSize: '13px', marginTop: '8px' }}>{deleteError}</p>
                  )}
                </>
              ) : (
                <>
                  <p className="modal-instruction">
                    Are you <strong>absolutely sure</strong>? Every task, habit, and insight will be gone forever.
                  </p>
                  {deleteError && (
                    <p style={{ color: '#C96847', fontSize: '13px', marginTop: '8px' }}>{deleteError}</p>
                  )}
                </>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeDeleteModal}>Cancel</button>
              {deleteStep === 1 ? (
                <button
                  className="btn-primary"
                  onClick={handleDeleteStep1}
                  style={{ background: '#C96847' }}
                >
                  Continue
                </button>
              ) : (
                <button
                  className="btn-primary"
                  onClick={handleDeleteConfirm}
                  style={{ background: '#C96847' }}
                >
                  Delete My Account
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default Navbar;
