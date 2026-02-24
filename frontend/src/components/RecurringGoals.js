import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/RecurringGoals.css';

function RecurringGoals({ onTasksGenerated }) {
  const [goals, setGoals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newGoal, setNewGoal] = useState({ title: '', frequency: 'x_per_week', timesPerWeek: 3 });

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    try {
      const response = await axios.get('/api/recurring-goals/today-status', {
        withCredentials: true
      });
      if (response.data.success) {
        setGoals(response.data.goals);
      }
    } catch (error) {
      console.error('Failed to load goals:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateTasks = async () => {
    setGenerating(true);
    try {
      const response = await axios.post('/api/recurring-goals/generate-daily-tasks', {}, {
        withCredentials: true
      });
      if (response.data.success) {
        alert(`Generated ${response.data.tasks.length} task(s) for today!`);
        loadGoals();
        if (onTasksGenerated) onTasksGenerated();
      }
    } catch (error) {
      console.error('Failed to generate tasks:', error);
      alert('Failed to generate tasks');
    } finally {
      setGenerating(false);
    }
  };

  const handleAddGoal = async (e) => {
    e.preventDefault();
    if (!newGoal.title.trim()) return;

    try {
      await axios.post('/api/recurring-goals', {
        title: newGoal.title,
        frequency: newGoal.frequency,
        timesPerWeek: newGoal.frequency === 'daily' ? 7 : newGoal.timesPerWeek
      }, { withCredentials: true });

      setNewGoal({ title: '', frequency: 'x_per_week', timesPerWeek: 3 });
      setShowAddForm(false);
      loadGoals();
    } catch (error) {
      console.error('Failed to add goal:', error);
      alert('Failed to add goal');
    }
  };

  const handleCompleteGoal = async (goalId) => {
    try {
      await axios.post(`/api/recurring-goals/${goalId}/complete`, {}, { withCredentials: true });
      loadGoals();
    } catch (error) {
      console.error('Failed to complete goal:', error);
    }
  };

  const handleDeleteGoal = async (goalId) => {
    if (!window.confirm('Remove this recurring goal?')) return;

    try {
      await axios.delete(`/api/recurring-goals/${goalId}`, { withCredentials: true });
      loadGoals();
    } catch (error) {
      console.error('Failed to delete goal:', error);
    }
  };

  const getFrequencyLabel = (goal) => {
    if (goal.frequency === 'daily') return 'Daily';
    if (goal.frequency === 'specific_days' && goal.specific_days) {
      return goal.specific_days.map(d => d.slice(0, 3)).join(', ');
    }
    return `${goal.times_per_week}x/week`;
  };

  const getProgressPercent = (goal) => {
    if (goal.frequency === 'daily') return goal.tasks_generated_today ? 100 : 0;
    return Math.round((goal.times_completed_this_week / goal.times_per_week) * 100);
  };

  if (loading) {
    return (
      <div className="recurring-goals-loading">
        <div className="spinner"></div>
      </div>
    );
  }

  return (
    <div className="recurring-goals-container">
      <div className="recurring-goals-header">
        <div>
          <h3>Recurring Goals</h3>
          <p className="recurring-goals-subtitle">Auto-generates tasks based on your schedule</p>
        </div>
        <div className="recurring-goals-actions">
          <button
            className="btn-generate-today"
            onClick={handleGenerateTasks}
            disabled={generating}
          >
            {generating ? '⏳' : '✨'} Generate Today's Tasks
          </button>
        </div>
      </div>

      {goals.length === 0 ? (
        <div className="recurring-goals-empty">
          <p>No recurring goals yet!</p>
          <span>Add goals like "run 3x a week" or "read daily"</span>
        </div>
      ) : (
        <div className="recurring-goals-list">
          {goals.map((goal) => (
            <div
              key={goal.id}
              className={`recurring-goal-card ${goal.due_today ? 'due-today' : ''}`}
            >
              <div className="goal-info">
                <div className="goal-title">{goal.title}</div>
                <div className="goal-frequency">{getFrequencyLabel(goal)}</div>
              </div>

              <div className="goal-progress">
                {goal.frequency !== 'daily' && (
                  <div className="progress-text">
                    {goal.times_completed_this_week}/{goal.times_per_week}
                  </div>
                )}
                <div className="progress-bar-mini">
                  <div
                    className="progress-fill-mini"
                    style={{ width: `${getProgressPercent(goal)}%` }}
                  ></div>
                </div>
              </div>

              <div className="goal-actions">
                {goal.completed_today && (
                  <span className="completed-badge">✓ Done today</span>
                )}
                {!goal.completed_today && goal.due_today && (
                  <button
                    className="btn-complete-goal"
                    onClick={() => handleCompleteGoal(goal.id)}
                    title="Mark done for today"
                  >
                    ✓ Done
                  </button>
                )}
                {!goal.completed_today && !goal.due_today && goal.times_completed_this_week >= goal.times_per_week && (
                  <span className="completed-badge">✓ Done this week</span>
                )}
                <button
                  className="btn-delete-goal"
                  onClick={() => handleDeleteGoal(goal.id)}
                  title="Remove goal"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Goal Form */}
      {showAddForm ? (
        <form className="add-goal-form" onSubmit={handleAddGoal}>
          <input
            type="text"
            placeholder="Goal title (e.g., Go running)"
            value={newGoal.title}
            onChange={(e) => setNewGoal({ ...newGoal, title: e.target.value })}
            autoFocus
          />
          <select
            value={newGoal.frequency}
            onChange={(e) => setNewGoal({ ...newGoal, frequency: e.target.value })}
          >
            <option value="daily">Daily</option>
            <option value="x_per_week">X times per week</option>
          </select>
          {newGoal.frequency === 'x_per_week' && (
            <select
              value={newGoal.timesPerWeek}
              onChange={(e) => setNewGoal({ ...newGoal, timesPerWeek: parseInt(e.target.value) })}
            >
              {[1, 2, 3, 4, 5, 6].map(n => (
                <option key={n} value={n}>{n}x per week</option>
              ))}
            </select>
          )}
          <div className="form-buttons">
            <button type="submit" className="btn-save-goal">Add Goal</button>
            <button type="button" className="btn-cancel" onClick={() => setShowAddForm(false)}>Cancel</button>
          </div>
        </form>
      ) : (
        <button className="btn-add-goal" onClick={() => setShowAddForm(true)}>
          + Add Recurring Goal
        </button>
      )}
    </div>
  );
}

export default RecurringGoals;
