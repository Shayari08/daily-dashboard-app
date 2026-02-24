import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import '../styles/Dashboard.css';
import '../styles/Archive.css';

function Archive() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [archiveData, setArchiveData] = useState(null);
  const [calendar, setCalendar] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    loadCalendar();
    loadArchiveForDate(selectedDate);
  }, [selectedDate]);

  const loadUser = async () => {
    try {
      const res = await axios.get('/api/auth/me', { withCredentials: true });
      setUser(res.data.user);
    } catch (error) {
      if (error.response?.status === 401) {
        navigate('/login');
      }
    }
  };

  const loadCalendar = async () => {
    try {
      const response = await axios.get('/api/archive/calendar', {
        withCredentials: true
      });
      const cal = (response.data.calendar || []).map(item => ({
        ...item,
        date: typeof item.date === 'string' && item.date.includes('T')
          ? item.date.split('T')[0]
          : String(item.date).split('T')[0]
      }));
      setCalendar(cal);
    } catch (error) {
      console.error('Failed to load calendar:', error);
    }
  };

  const loadArchiveForDate = async (date) => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/archive/date/${date}`, {
        withCredentials: true
      });
      setArchiveData(response.data);
    } catch (error) {
      console.error('Failed to load archive:', error);
      setArchiveData({ tasks: [], habits: [], summary: null });
    } finally {
      setLoading(false);
    }
  };

  const handleDateChange = (e) => {
    setSelectedDate(e.target.value);
  };

  return (
    <div className="dashboard-warm">
      <Navbar user={user} />

      <main className="dashboard-main">
        <div className="content-wrapper">
          <div className="archive-card">
            {/* Page Title + Date Selector */}
            <div className="section-header">
              <h2>Task Archive</h2>
              {calendar.length > 0 && (
                <span className="task-count">
                  {calendar.length} days with activity
                </span>
              )}
            </div>

            <div className="date-selector">
              <label>Select Date:</label>
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                max={new Date().toISOString().split('T')[0]}
              />
            </div>

            {/* Recent Activity Dates */}
            {calendar.length > 0 && (
              <div className="dates-grid">
                {calendar.slice(0, 7).map(item => {
                  const dateStr = typeof item.date === 'string' && item.date.includes('T')
                    ? item.date.split('T')[0]
                    : String(item.date).split('T')[0];
                  const dateObj = new Date(dateStr + 'T12:00:00');
                  return (
                    <button
                      key={dateStr}
                      className={`date-btn ${selectedDate === dateStr ? 'active' : ''}`}
                      onClick={() => setSelectedDate(dateStr)}
                    >
                      <div className="date-day">
                        {dateObj.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div className="date-number">
                        {dateObj.getDate()}
                      </div>
                      <div className="date-count">{item.count} tasks</div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Archive Content */}
            {loading ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>Loading archive...</p>
              </div>
            ) : (
              <div className="archive-data">
                {/* Summary */}
                {(archiveData?.summary || archiveData?.tasks?.length > 0 || archiveData?.habits?.length > 0) && (
                  <div className="archive-summary">
                    <h3>Daily Summary</h3>
                    <div className="summary-stats">
                      <div className="stat-card-mini">
                        <span className="stat-card-mini-value">{archiveData?.tasks?.length || 0}</span>
                        <span className="stat-card-mini-label">Tasks Completed</span>
                      </div>
                      <div className="stat-card-mini">
                        <span className="stat-card-mini-value">{archiveData?.habits?.length || 0}</span>
                        <span className="stat-card-mini-label">Habits Completed</span>
                      </div>
                    </div>
                    {archiveData?.summary?.praise && (
                      <div className="praise-message">
                        {archiveData.summary.praise}
                      </div>
                    )}
                  </div>
                )}

                {/* Tasks */}
                <div className="archive-section">
                  <h3>Completed Tasks ({archiveData?.tasks?.length || 0})</h3>
                  {archiveData?.tasks && archiveData.tasks.length > 0 ? (
                    <div className="archive-list">
                      {archiveData.tasks.map(task => (
                        <div key={task.id} className="archive-item">
                          <span className="archive-check">✓</span>
                          <div className="archive-item-info">
                            <div className="archive-item-title">{task.title}</div>
                            {task.description && (
                              <div className="archive-item-desc">{task.description}</div>
                            )}
                            <div className="archive-item-meta">
                              Completed at {new Date(task.completed_at).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-message">No tasks completed on this date</p>
                  )}
                </div>

                {/* Habits */}
                <div className="archive-section">
                  <h3>Logged Habits ({archiveData?.habits?.length || 0})</h3>
                  {archiveData?.habits && archiveData.habits.length > 0 ? (
                    <div className="archive-list">
                      {archiveData.habits.map(habit => (
                        <div key={habit.id} className="archive-item">
                          <span className="archive-check">✓</span>
                          <div className="archive-item-info">
                            <div className="archive-item-title">{habit.name}</div>
                            {habit.notes && (
                              <div className="archive-item-desc">{habit.notes}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-message">No habits logged on this date</p>
                  )}
                </div>

                {/* Empty State */}
                {(!archiveData?.tasks || archiveData.tasks.length === 0) &&
                 (!archiveData?.habits || archiveData.habits.length === 0) && (
                  <div className="empty-state">
                    <p>No activity on this date</p>
                    <span>Try selecting a different date or complete some tasks today!</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

export default Archive;
