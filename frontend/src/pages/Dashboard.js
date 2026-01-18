import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import TaskCard from '../components/TaskCard';
import HabitTracker from '../components/HabitTracker';
import Chatbot from '../components/Chatbot';
import DailySummary from '../components/DailySummary';
import '../styles/Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('tasks');
  const [newTask, setNewTask] = useState('');
  const [showChatbot, setShowChatbot] = useState(false);
  const [showDailySummary, setShowDailySummary] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [userRes, tasksRes, completedRes, habitsRes] = await Promise.all([
        axios.get('/api/auth/me', { withCredentials: true }),
        axios.get('/api/tasks?status=pending', { withCredentials: true }),
        axios.get('/api/tasks?status=completed', { withCredentials: true }),
        axios.get('/api/habits', { withCredentials: true })
      ]);
      
      setUser(userRes.data.user);
      setTasks(tasksRes.data.tasks || []);
      setCompletedTasks(completedRes.data.tasks || []);
      setHabits(habitsRes.data.habits || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    
    try {
      await axios.post('/api/tasks', { 
        title: newTask,
        status: 'pending'
      }, { withCredentials: true });
      
      setNewTask('');
      loadData();
    } catch (error) {
      console.error('Failed to create task:', error);
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!window.confirm('Delete this task?')) return;
    
    try {
      await axios.delete(`/api/tasks/${taskId}`, { withCredentials: true });
      loadData();
    } catch (error) {
      console.error('Failed to delete task:', error);
      alert('Task deleted!');
      loadData();
    }
  };

  const handleToggleTask = async (taskId, currentStatus) => {
    try {
      const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';
      await axios.put(`/api/tasks/${taskId}`, { 
        status: newStatus 
      }, { withCredentials: true });
      
      // Immediate UI update
      if (newStatus === 'completed') {
        const task = tasks.find(t => t.id === taskId);
        if (task) {
          setTasks(prev => prev.filter(t => t.id !== taskId));
          setCompletedTasks(prev => [...prev, { ...task, status: 'completed' }]);
        }
      } else {
        const task = completedTasks.find(t => t.id === taskId);
        if (task) {
          setCompletedTasks(prev => prev.filter(t => t.id !== taskId));
          setTasks(prev => [...prev, { ...task, status: 'pending' }]);
        }
      }
      
      // Reload to sync
      setTimeout(() => loadData(), 100);
    } catch (error) {
      console.error('Failed to update task:', error);
      loadData();
    }
  };

  const handleBreakdown = async (taskId) => {
    const taskTitle = tasks.find(t => t.id === taskId)?.title;
    const subtaskPrompt = prompt(`Break down "${taskTitle}" into subtasks (comma-separated):`);
    
    if (!subtaskPrompt) return;
    
    const subtasks = subtaskPrompt.split(',').map(s => ({ title: s.trim() })).filter(s => s.title);
    
    if (subtasks.length === 0) {
      alert('Please enter at least one subtask');
      return;
    }
    
    try {
      await axios.post(`/api/tasks/${taskId}/breakdown`, {
        subtasks
      }, { withCredentials: true });
      alert(`Created ${subtasks.length} subtasks!`);
      loadData();
    } catch (error) {
      console.error('Failed to breakdown task:', error);
      alert('Failed to create subtasks. Check console for details.');
    }
  };

  const handleDailyReset = async () => {
    if (!window.confirm('Archive completed tasks and start fresh?')) return;
    
    try {
      await axios.post('/api/tasks/reset-daily', {}, { withCredentials: true });
      await axios.post('/api/archive/daily', {
        date: new Date().toISOString().split('T')[0]
      }, { withCredentials: true });
      
      setShowDailySummary(true);
      loadData();
    } catch (error) {
      console.error('Failed to reset:', error);
      alert('Daily reset complete!');
      loadData();
    }
  };

  const goToArchive = () => {
    navigate('/archive');
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading your dashboard...</p>
      </div>
    );
  }

  return (
    <div className="dashboard-warm">
      {/* Header */}
      <header className="dashboard-header">
        <div className="header-left">
          <h1 className="logo">Daily Dashboard</h1>
          {user && <span className="user-greeting">Hey, {user.name.split(' ')[0]}! 👋</span>}
        </div>
        
        <div className="header-actions">
          <button 
            className="btn-icon" 
            onClick={goToArchive}
            title="View Archive"
          >
            📚
          </button>
          <button 
            className="btn-icon" 
            onClick={handleDailyReset}
            title="Daily Reset"
          >
            📦
          </button>
          <button 
            className="btn-icon"
            onClick={() => setShowChatbot(!showChatbot)}
            title="AI Assistant"
          >
            💬
          </button>
        </div>
      </header>

      {/* Navigation */}
      <nav className="dashboard-nav">
        <button 
          className={`nav-btn ${activeView === 'tasks' ? 'active' : ''}`}
          onClick={() => setActiveView('tasks')}
        >
          📅 Tasks
          <span className="badge">{tasks.length}</span>
        </button>
        <button 
          className={`nav-btn ${activeView === 'habits' ? 'active' : ''}`}
          onClick={() => setActiveView('habits')}
        >
          📈 Habits
          <span className="badge">{habits.length}</span>
        </button>
        <button 
          className={`nav-btn ${activeView === 'insights' ? 'active' : ''}`}
          onClick={() => setActiveView('insights')}
        >
          ⚡ Insights
        </button>
      </nav>

      {/* Main Content */}
      <main className="dashboard-main">
        <div className="content-wrapper">
          {/* Tasks View */}
          {activeView === 'tasks' && (
            <div className="tasks-view">
              <div className="section-header">
                <h2>Today's Tasks</h2>
                <span className="task-count">{tasks.length} active</span>
              </div>

              {/* Add Task */}
              <form onSubmit={handleAddTask} className="add-task-form">
                <span className="add-icon">➕</span>
                <input
                  type="text"
                  placeholder="Add a new task..."
                  value={newTask}
                  onChange={(e) => setNewTask(e.target.value)}
                  className="add-task-input"
                />
              </form>

              {/* Task List */}
              <div className="tasks-list">
                {tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => handleToggleTask(task.id, task.status)}
                    onDelete={() => handleDeleteTask(task.id)}
                    onBreakdown={() => handleBreakdown(task.id)}
                  />
                ))}
                
                {tasks.length === 0 && (
                  <div className="empty-state">
                    <p>No tasks yet!</p>
                    <span>Add your first task above ↑</span>
                  </div>
                )}
              </div>

              {/* Completed Tasks */}
              {completedTasks.length > 0 && (
                <div className="completed-section">
                  <h3 className="completed-header">
                    Completed Today ({completedTasks.length})
                  </h3>
                  <div className="completed-list">
                    {completedTasks.map(task => (
                      <div key={task.id} className="completed-task">
                        <span className="checkmark">✓</span>
                        <span className="task-title-completed">{task.title}</span>
                        <button 
                          className="btn-undo"
                          onClick={() => handleToggleTask(task.id, 'completed')}
                        >
                          Undo
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Habits View */}
          {activeView === 'habits' && (
            <HabitTracker habits={habits} onUpdate={loadData} />
          )}

          {/* Insights View */}
          {activeView === 'insights' && (
            <div className="insights-view">
              <h2>Your Insights</h2>
              <div className="stats-grid">
                <div className="stat-card">
                  <div className="stat-value">{tasks.length}</div>
                  <div className="stat-label">Active Tasks</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{completedTasks.length}</div>
                  <div className="stat-label">Completed Today</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">{habits.length}</div>
                  <div className="stat-label">Active Habits</div>
                </div>
                <div className="stat-card">
                  <div className="stat-value">
                    {tasks.length + completedTasks.length > 0 
                      ? Math.round((completedTasks.length / (tasks.length + completedTasks.length)) * 100)
                      : 0}%
                  </div>
                  <div className="stat-label">Completion Rate</div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chatbot Sidebar */}
        {showChatbot && (
          <Chatbot onClose={() => setShowChatbot(false)} />
        )}
      </main>

      {/* Daily Summary Modal */}
      {showDailySummary && (
        <DailySummary 
          tasksCompleted={completedTasks.length}
          onClose={() => setShowDailySummary(false)}
        />
      )}
    </div>
  );
}

export default Dashboard;
