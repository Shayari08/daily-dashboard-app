import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import '../styles/Archive.css';

function Archive() {
  const navigate = useNavigate();
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [archiveData, setArchiveData] = useState(null);
  const [calendar, setCalendar] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCalendar();
    loadArchiveForDate(selectedDate);
  }, [selectedDate]);

  const loadCalendar = async () => {
    try {
      const response = await axios.get('/api/archive/calendar', {
        withCredentials: true
      });
      setCalendar(response.data.calendar || []);
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

  const getDatesWithData = () => {
    return calendar.map(item => item.date);
  };

  return (
    <div className="archive-page">
      <div className="archive-header">
        <div className="header-left">
          <button className="btn-back" onClick={() => navigate('/dashboard')}>
            ← Back to Dashboard
          </button>
          <h1>Task Archive</h1>
        </div>
      </div>

      <div className="archive-content">
        {/* Date Selector */}
        <div className="date-selector">
          <label>Select Date:</label>
          <input
            type="date"
            value={selectedDate}
            onChange={handleDateChange}
            max={new Date().toISOString().split('T')[0]}
          />
          
          {calendar.length > 0 && (
            <div className="calendar-info">
              <span>📅 {calendar.length} days with completed tasks</span>
            </div>
          )}
        </div>

        {/* Archive Content */}
        {loading ? (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading archive...</p>
          </div>
        ) : (
          <div className="archive-data">
            {/* Summary */}
            {archiveData?.summary && (
              <div className="archive-summary">
                <h2>Daily Summary</h2>
                <div className="summary-stats">
                  <div className="stat">
                    <span className="stat-value">{archiveData.summary.tasks_completed || 0}</span>
                    <span className="stat-label">Tasks Completed</span>
                  </div>
                  <div className="stat">
                    <span className="stat-value">{archiveData.summary.habits_completed || 0}</span>
                    <span className="stat-label">Habits Completed</span>
                  </div>
                </div>
                {archiveData.summary.praise && (
                  <div className="praise-message">
                    💫 {archiveData.summary.praise}
                  </div>
                )}
              </div>
            )}

            {/* Tasks */}
            <div className="archive-section">
              <h3>✓ Completed Tasks ({archiveData?.tasks?.length || 0})</h3>
              {archiveData?.tasks && archiveData.tasks.length > 0 ? (
                <div className="tasks-list">
                  {archiveData.tasks.map(task => (
                    <div key={task.id} className="archive-task">
                      <span className="task-check">✓</span>
                      <div className="task-info">
                        <div className="task-title">{task.title}</div>
                        {task.description && (
                          <div className="task-description">{task.description}</div>
                        )}
                        <div className="task-meta">
                          Completed: {new Date(task.completed_at).toLocaleTimeString()}
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
              <h3>🔥 Logged Habits ({archiveData?.habits?.length || 0})</h3>
              {archiveData?.habits && archiveData.habits.length > 0 ? (
                <div className="habits-list">
                  {archiveData.habits.map(habit => (
                    <div key={habit.id} className="archive-habit">
                      <span className="habit-check">✓</span>
                      <div className="habit-info">
                        <div className="habit-name">{habit.name}</div>
                        {habit.notes && (
                          <div className="habit-notes">{habit.notes}</div>
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
              <div className="empty-archive">
                <div className="empty-icon">📭</div>
                <h3>No activity on this date</h3>
                <p>Try selecting a different date or complete some tasks today!</p>
              </div>
            )}
          </div>
        )}

        {/* Recent Activity */}
        {calendar.length > 0 && (
          <div className="recent-dates">
            <h3>Recent Activity</h3>
            <div className="dates-grid">
              {calendar.slice(0, 7).map(item => (
                <button
                  key={item.date}
                  className={`date-btn ${selectedDate === item.date ? 'active' : ''}`}
                  onClick={() => setSelectedDate(item.date)}
                >
                  <div className="date-day">
                    {new Date(item.date).toLocaleDateString('en-US', { weekday: 'short' })}
                  </div>
                  <div className="date-number">
                    {new Date(item.date).getDate()}
                  </div>
                  <div className="date-count">{item.count} tasks</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Archive;
