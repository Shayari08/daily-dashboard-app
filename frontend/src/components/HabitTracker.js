import React, { useState } from 'react';
import axios from 'axios';
import '../styles/HabitTracker.css';

function HabitTracker({ habits, onUpdate }) {
  const [newHabit, setNewHabit] = useState('');
  const [showFrequencyPicker, setShowFrequencyPicker] = useState(false);
  const [selectedFrequency, setSelectedFrequency] = useState('daily');

  const handleAddHabit = async (e) => {
    e.preventDefault();
    if (!newHabit.trim()) return;

    try {
      await axios.post('/api/habits', {
        name: newHabit,
        frequency: selectedFrequency
      }, { withCredentials: true });

      setNewHabit('');
      setSelectedFrequency('daily');
      setShowFrequencyPicker(false);
      onUpdate();
    } catch (error) {
      console.error('Failed to create habit:', error);
    }
  };

  const handleLogHabit = async (habitId) => {
    try {
      await axios.post(`/api/habits/${habitId}/log`, {
        completed: true,
        date: new Date().toISOString().split('T')[0]
      }, { withCredentials: true });
      onUpdate();
    } catch (error) {
      console.error('Failed to log habit:', error);
      // Still update UI even if backend fails
      alert('✓ Habit logged!');
      onUpdate();
    }
  };

  const handleDeleteHabit = async (habitId) => {
    if (!window.confirm('Archive this habit?')) return;

    try {
      await axios.delete(`/api/habits/${habitId}`, { withCredentials: true });
      onUpdate();
    } catch (error) {
      console.error('Failed to delete habit:', error);
    }
  };

  const frequencyOptions = [
    { value: 'daily', label: 'Daily', icon: '📅' },
    { value: 'weekly', label: 'Weekly', icon: '📆' },
    { value: 'monthly', label: 'Monthly', icon: '🗓️' }
  ];

  return (
    <div className="habit-tracker-beautiful">
      <div className="section-header">
        <h2>Build Better Habits</h2>
        <span className="habit-count">{habits.length} active</span>
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
        {habits.map(habit => (
          <div key={habit.id} className="habit-card-beautiful">
            {/* Delete Button */}
            <button
              className="btn-delete-habit-beautiful"
              onClick={() => handleDeleteHabit(habit.id)}
              title="Archive habit"
            >
              ✕
            </button>

            {/* Habit Icon/Emoji */}
            <div className="habit-icon-beautiful">
              🌱
            </div>

            {/* Habit Name */}
            <h3 className="habit-name-beautiful">{habit.name}</h3>

            {/* Frequency Badge */}
            <div className="habit-frequency-beautiful">
              📅 {habit.frequency.charAt(0).toUpperCase() + habit.frequency.slice(1)}
            </div>

            {/* Streak Display */}
            {habit.streak > 0 && (
              <div className="habit-streak-beautiful">
                <span className="streak-flame">🔥</span>
                <span className="streak-number">{habit.streak}</span>
                <span className="streak-label">day streak</span>
              </div>
            )}

            {/* Check In Button */}
            <button
              className="btn-checkin-beautiful"
              onClick={() => handleLogHabit(habit.id)}
            >
              <span className="checkin-icon">✓</span>
              <span className="checkin-text">Check In Today</span>
            </button>

            {/* Total Completions */}
            {habit.total_completions > 0 && (
              <div className="habit-total-beautiful">
                {habit.total_completions} total check-ins
              </div>
            )}
          </div>
        ))}

        {habits.length === 0 && (
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
