import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import TaskCard from '../components/TaskCard';
import HabitTracker from '../components/HabitTracker';
import Chatbot from '../components/Chatbot';
import DailySummary from '../components/DailySummary';
import InsightsView from '../components/InsightsView';
import RecurringGoals from '../components/RecurringGoals';
import RecommendationsView from '../components/RecommendationsView';
import Navbar from '../components/Navbar';
import '../styles/Dashboard.css';

function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [completedTasks, setCompletedTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('tasks');
  const [newTask, setNewTask] = useState('');
  const [showChatbot, setShowChatbot] = useState(false);
  const [showDailySummary, setShowDailySummary] = useState(false);
  const [archivedTaskCount, setArchivedTaskCount] = useState(0);
  const [generatingTasks, setGeneratingTasks] = useState(false);
  const [breakdownTaskId, setBreakdownTaskId] = useState(null);
  const [subtaskInput, setSubtaskInput] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // Check onboarding status first
      const onboardingStatus = await axios.get('/api/onboarding/status', { withCredentials: true });
      if (onboardingStatus.data.needsOnboarding) {
        navigate('/onboarding');
        return;
      }

      const [userRes, tasksRes, completedRes] = await Promise.all([
        axios.get('/api/auth/me', { withCredentials: true }),
        axios.get('/api/tasks?status=pending', { withCredentials: true }),
        axios.get('/api/tasks?status=completed', { withCredentials: true })
      ]);

      setUser(userRes.data.user);
      setTasks(tasksRes.data.tasks || []);
      setCompletedTasks(completedRes.data.tasks || []);
    } catch (error) {
      console.error('Failed to load data:', error);
      if (error.response?.status === 401) {
        navigate('/login');
      }
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

  const handleBreakdown = (taskId) => {
    setBreakdownTaskId(taskId);
    setSubtaskInput('');
  };

  const submitBreakdown = async () => {
    if (!subtaskInput.trim()) {
      alert('Please enter at least one subtask');
      return;
    }

    const subtasks = subtaskInput
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0)
      .map(s => ({ title: s.replace(/^\d+\.\s*/, '') })); // Remove leading numbers

    if (subtasks.length === 0) {
      alert('Please enter at least one subtask');
      return;
    }

    try {
      await axios.post(`/api/tasks/${breakdownTaskId}/breakdown`, {
        subtasks
      }, { withCredentials: true });
      alert(`Created ${subtasks.length} subtasks!`);
      setBreakdownTaskId(null);
      setSubtaskInput('');
      loadData();
    } catch (error) {
      console.error('Failed to breakdown task:', error);
      alert('Failed to create subtasks. Check console for details.');
    }
  };

  const handleAIBreakdown = async (taskId) => {
    if (!window.confirm('Use AI to break down this task into subtasks?')) return;

    try {
      const response = await axios.post(
        `/api/tasks/${taskId}/ai-breakdown`,
        {},
        { withCredentials: true }
      );

      if (response.data.success) {
        alert(`AI generated ${response.data.count} subtasks!`);
        loadData();
      }
    } catch (error) {
      console.error('Failed to AI breakdown task:', error);
      alert('Failed to generate subtasks. Make sure you have onboarding data or try manual breakdown.');
    }
  };

  const handleDailyReset = async () => {
    if (!window.confirm('Archive completed tasks and start fresh?')) return;

    // Capture count BEFORE archiving
    const countToShow = completedTasks.length;

    try {
      await axios.post('/api/tasks/reset-daily', {}, { withCredentials: true });
      await axios.post('/api/archive/daily', {
        date: new Date().toISOString().split('T')[0]
      }, { withCredentials: true });

      setArchivedTaskCount(countToShow);
      setShowDailySummary(true);
      loadData();
    } catch (error) {
      console.error('Failed to reset:', error);
      setArchivedTaskCount(countToShow);
      setShowDailySummary(true);
      loadData();
    }
  };

  const handleClearAllTasks = async () => {
    if (!window.confirm('Delete ALL tasks? This cannot be undone!')) return;

    try {
      const response = await axios.delete('/api/tasks/clear-all', { withCredentials: true });
      alert(`Deleted ${response.data.count} tasks`);
      loadData();
    } catch (error) {
      console.error('Failed to clear tasks:', error);
      alert('Failed to clear tasks. Please try again.');
    }
  };

  const handleResetGoals = async () => {
    if (!window.confirm('Reset all your goals? This will clear your onboarding data.')) return;

    try {
      await axios.delete('/api/profile/goals', { withCredentials: true });
      alert('Goals have been reset successfully!');
      loadData();
    } catch (error) {
      console.error('Failed to reset goals:', error);
      alert('Failed to reset goals. Please try again.');
    }
  };

  const handleGenerateTasks = async () => {
    setGeneratingTasks(true);

    try {
      const response = await axios.post('/api/tasks/generate-and-save', {}, { withCredentials: true });

      if (response.data.success) {
        alert(`Generated ${response.data.count} new tasks based on your goals!`);
        loadData();
      } else {
        alert('Failed to generate tasks. Please try again.');
      }
    } catch (error) {
      console.error('Failed to generate tasks:', error);
      alert('Failed to generate tasks. Make sure you have completed onboarding.');
    } finally {
      setGeneratingTasks(false);
    }
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
      <Navbar
        user={user}
        activeView={activeView}
        setActiveView={setActiveView}
        taskCount={tasks.length}
        onDailyReset={handleDailyReset}
        onToggleChat={() => setShowChatbot(!showChatbot)}
      />

      {/* Main Content */}
      <main className="dashboard-main">
        <div className="content-wrapper">
          {/* Tasks View */}
          {activeView === 'tasks' && (
            <div className="tasks-view">
              <div className="section-header">
                <div>
                  <h2>Today's Tasks</h2>
                  <span className="task-count">{tasks.length} active</span>
                </div>
                {tasks.length > 0 && (
                  <button
                    className="btn-secondary"
                    onClick={handleClearAllTasks}
                    title="Delete all tasks"
                  >
                    🗑️ Clear All
                  </button>
                )}
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

              {/* AI Task Generation */}
              <div className="ai-task-generation">
                <button
                  className="btn-ai-generate"
                  onClick={handleGenerateTasks}
                  disabled={generatingTasks}
                >
                  {generatingTasks ? '⏳ Generating Tasks...' : '✨ Generate Tasks for Me'}
                </button>
              </div>

              {/* Recurring Goals */}
              <RecurringGoals onTasksGenerated={loadData} />

              {/* Task List */}
              <div className="tasks-list">
                {tasks.map(task => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onToggle={() => handleToggleTask(task.id, task.status)}
                    onDelete={() => handleDeleteTask(task.id)}
                    onBreakdown={() => handleBreakdown(task.id)}
                    onAIBreakdown={() => handleAIBreakdown(task.id)}
                    onRefresh={loadData}
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
            <HabitTracker onUpdate={loadData} />
          )}

          {/* Insights View */}
          {activeView === 'insights' && (
            <div className="insights-view">
              <div className="section-header">
                <h2>Your Insights</h2>
                <button
                  className="btn-secondary"
                  onClick={handleResetGoals}
                  title="Reset your goals and start fresh"
                >
                  🔄 Reset Goals
                </button>
              </div>
              <InsightsView userId={user?.id} />
            </div>
          )}

          {/* Recommendations View */}
          {activeView === 'recommendations' && (
            <div className="recommendations-view-container">
              <RecommendationsView onTaskAdded={loadData} />
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
          tasksCompleted={archivedTaskCount}
          onClose={() => setShowDailySummary(false)}
        />
      )}

      {/* Task Breakdown Modal */}
      {breakdownTaskId && (
        <div className="modal-overlay" onClick={() => setBreakdownTaskId(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Break Down Task</h3>
              <button
                className="modal-close"
                onClick={() => setBreakdownTaskId(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p className="modal-instruction">
                Enter subtasks, one per line:
              </p>
              <textarea
                className="subtask-textarea"
                placeholder="1. First subtask&#10;2. Second subtask&#10;3. Third subtask"
                value={subtaskInput}
                onChange={(e) => setSubtaskInput(e.target.value)}
                rows={8}
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <button
                className="btn-secondary"
                onClick={() => setBreakdownTaskId(null)}
              >
                Cancel
              </button>
              <button
                className="btn-primary"
                onClick={submitBreakdown}
              >
                Create Subtasks
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
