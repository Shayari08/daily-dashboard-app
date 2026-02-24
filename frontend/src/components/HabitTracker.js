import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/HabitTracker.css';

function HabitTracker({ onUpdate }) {
  const [goals, setGoals] = useState([]);
  const [newHabit, setNewHabit] = useState('');
  const [showFrequencyPicker, setShowFrequencyPicker] = useState(false);
  const [selectedFrequency, setSelectedFrequency] = useState('daily');

  useEffect(() => {
    loadGoals();
  }, []);

  const loadGoals = async () => {
    try {
      const res = await axios.get('/api/recurring-goals/today-status', { withCredentials: true });
      setGoals(res.data.goals || []);
    } catch (error) {
      console.error('Failed to load goals:', error);
    }
  };

  const handleAddHabit = async (e) => {
    e.preventDefault();
    if (!newHabit.trim()) return;

    const frequencyMap = {
      daily: { frequency: 'daily', timesPerWeek: 7 },
      weekly: { frequency: 'x_per_week', timesPerWeek: 1 },
      monthly: { frequency: 'x_per_week', timesPerWeek: 1 }
    };

    const mapped = frequencyMap[selectedFrequency] || frequencyMap.daily;

    try {
      await axios.post('/api/recurring-goals', {
        title: newHabit,
        frequency: mapped.frequency,
        timesPerWeek: mapped.timesPerWeek
      }, { withCredentials: true });

      setNewHabit('');
      setSelectedFrequency('daily');
      setShowFrequencyPicker(false);
      loadGoals();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Failed to create habit:', error);
    }
  };

  const handleLogHabit = async (goalId) => {
    try {
      await axios.post(`/api/recurring-goals/${goalId}/complete`, {}, { withCredentials: true });
      loadGoals();
      if (onUpdate) onUpdate();
    } catch (error) {
      if (error.response?.data?.alreadyDone) {
        alert('Already checked in today!');
      } else {
        console.error('Failed to log habit:', error);
      }
    }
  };

  const handleDeleteHabit = async (goalId) => {
    if (!window.confirm('Delete this habit?')) return;

    try {
      await axios.delete(`/api/recurring-goals/${goalId}`, { withCredentials: true });
      loadGoals();
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Failed to delete habit:', error);
    }
  };

  const frequencyOptions = [
    { value: 'daily', label: 'Daily', icon: '📅' },
    { value: 'weekly', label: 'Weekly', icon: '📆' },
    { value: 'monthly', label: 'Monthly', icon: '🗓️' }
  ];

  const getFrequencyLabel = (goal) => {
    if (goal.frequency === 'daily') return 'Daily';
    if (goal.frequency === 'x_per_week' && goal.times_per_week === 1) return 'Weekly';
    if (goal.frequency === 'x_per_week') return `${goal.times_per_week}x/week`;
    if (goal.frequency === 'specific_days') return 'Specific Days';
    return goal.frequency;
  };

  return (
    <div className="habit-tracker-beautiful">
      <div className="section-header">
        <h2>Build Better Habits</h2>
        <span className="habit-count">{goals.length} active</span>
      </div>

      {/* Add Habit Form */}
      <form onSubmit={handleAddHabit} className="add-habit-form-beautiful">
        <div className="habit-input-group-beautiful">
          <span className="add-icon-habit">➕</span>
          <input
            type="text"
            placeholder="Start a new habit..."
            value={newHabit}
            onChange={(e) => setNewHabit(e.target.value)}
            onFocus={() => setShowFrequencyPicker(true)}
            className="add-habit-input-beautiful"
          />
        </div>

        {showFrequencyPicker && (
          <div className="frequency-picker-beautiful">
            <span className="frequency-label-beautiful">How often?</span>
            <div className="frequency-options-beautiful">
              {frequencyOptions.map(option => (
                <button
                  key={option.value}
                  type="button"
                  className={`frequency-btn-beautiful ${selectedFrequency === option.value ? 'active' : ''}`}
                  onClick={() => setSelectedFrequency(option.value)}
                >
                  <span className="freq-icon">{option.icon}</span>
                  <span className="freq-label">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </form>

      {/* Habits Grid */}
      <div className="habits-grid-beautiful">
        {goals.map(goal => (
          <div key={goal.id} className={`habit-card-beautiful ${goal.completed_today ? 'completed' : ''}`}>
            {/* Delete Button */}
            <button
              className="btn-delete-habit-beautiful"
              onClick={() => handleDeleteHabit(goal.id)}
              title="Delete habit"
            >
              ✕
            </button>

            {/* Habit Icon */}
            <div className="habit-icon-beautiful">
              {goal.completed_today ? '✅' : '🌱'}
            </div>

            {/* Habit Name */}
            <h3 className="habit-name-beautiful">{goal.title}</h3>

            {/* Frequency Badge */}
            <div className="habit-frequency-beautiful">
              📅 {getFrequencyLabel(goal)}
            </div>

            {/* Streak Display */}
            {goal.streak > 0 && (
              <div className="habit-streak-beautiful">
                <span className="streak-flame">🔥</span>
                <span className="streak-number">{goal.streak}</span>
                <span className="streak-label">day streak</span>
              </div>
            )}

            {/* Check In Button */}
            <button
              className={`btn-checkin-beautiful ${goal.completed_today ? 'checked' : ''}`}
              onClick={() => handleLogHabit(goal.id)}
              disabled={goal.completed_today}
            >
              <span className="checkin-icon">{goal.completed_today ? '✓' : '○'}</span>
              <span className="checkin-text">{goal.completed_today ? 'Done Today' : 'Check In Today'}</span>
            </button>

            {/* Total Completions */}
            {goal.total_completions > 0 && (
              <div className="habit-total-beautiful">
                {goal.total_completions} total check-ins
              </div>
            )}
          </div>
        ))}

        {goals.length === 0 && (
          <div className="empty-state-habits-beautiful">
            <div className="empty-icon-habits">🌱</div>
            <p>No habits yet!</p>
            <span>Start building a new habit above ↑</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default HabitTracker;
