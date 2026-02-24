import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/Insights.css';

function InsightsView({ userId }) {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeframe, setTimeframe] = useState(30);

  useEffect(() => {
    if (userId) {
      loadInsights();
    }
  }, [userId, timeframe]);

  const loadInsights = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`/api/insights/behavioral?days=${timeframe}`, {
        withCredentials: true
      });

      if (response.data.success) {
        setInsights(response.data.insights);
      }
    } catch (error) {
      console.error('Failed to load insights:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="insights-loading">
        <div className="loading-spinner"></div>
        <p>Analyzing your productivity patterns...</p>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="insights-empty">
        <p>No insights available yet. Complete some tasks to see your patterns!</p>
      </div>
    );
  }

  const { productivityTrends, timeOfDay, procrastination, habitConsistency } = insights;

  return (
    <div className="insights-view-detailed">
      {/* Timeframe Selector */}
      <div className="timeframe-selector">
        <button
          className={timeframe === 7 ? 'active' : ''}
          onClick={() => setTimeframe(7)}
        >
          7 Days
        </button>
        <button
          className={timeframe === 30 ? 'active' : ''}
          onClick={() => setTimeframe(30)}
        >
          30 Days
        </button>
        <button
          className={timeframe === 90 ? 'active' : ''}
          onClick={() => setTimeframe(90)}
        >
          90 Days
        </button>
      </div>

      {/* Insights Cards */}
      <div className="insights-grid">
        {/* Productivity Trends */}
        <div className="insight-card">
          <div className="insight-header">
            <span className="insight-icon">📊</span>
            <h3>Productivity Trends</h3>
          </div>
          <div className="insight-content">
            <div className="insight-stat-large">
              {productivityTrends.avgTasksPerDay}
              <span className="insight-unit">tasks/day</span>
            </div>
            <div className="insight-trend">
              {productivityTrends.trend === 'improving' && (
                <span className="trend-up">↗ Improving</span>
              )}
              {productivityTrends.trend === 'declining' && (
                <span className="trend-down">↘ Declining</span>
              )}
              {productivityTrends.trend === 'stable' && (
                <span className="trend-stable">→ Stable</span>
              )}
            </div>
          </div>
        </div>

        {/* Time of Day Patterns */}
        <div className="insight-card">
          <div className="insight-header">
            <span className="insight-icon">🕒</span>
            <h3>Time-of-Day Patterns</h3>
          </div>
          <div className="insight-content">
            <p className="insight-summary">{timeOfDay.summary}</p>
            {timeOfDay.peakHour !== null && (
              <div className="insight-detail">
                Peak hour: <strong>{timeOfDay.peakHour}:00</strong>
              </div>
            )}
            {/* Simple hourly distribution bars */}
            {timeOfDay.hourlyDistribution.length > 0 && (
              <div className="hourly-chart">
                {timeOfDay.hourlyDistribution.map((item) => {
                  const maxCount = Math.max(...timeOfDay.hourlyDistribution.map(i => i.count));
                  const heightPercent = (item.count / maxCount) * 100;
                  return (
                    <div key={item.hour} className="hourly-bar-container">
                      <div
                        className="hourly-bar"
                        style={{ height: `${heightPercent}%` }}
                        title={`${item.hour}:00 - ${item.count} tasks`}
                      ></div>
                      <span className="hourly-label">{item.hour}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Task Completion Speed */}
        <div className="insight-card">
          <div className="insight-header">
            <span className="insight-icon">⏱️</span>
            <h3>Task Completion Speed</h3>
          </div>
          <div className="insight-content">
            <div className="insight-stat-large">
              {procrastination.avgHours}
              <span className="insight-unit">hours avg</span>
            </div>
            <div className="insight-detail">
              {procrastination.delayedPercent}% delayed (>1 day)
            </div>
            <p className="insight-summary">{procrastination.summary}</p>
          </div>
        </div>

        {/* Habit Consistency */}
        <div className="insight-card">
          <div className="insight-header">
            <span className="insight-icon">🔥</span>
            <h3>Habit Consistency</h3>
          </div>
          <div className="insight-content">
            {habitConsistency.habits.length > 0 ? (
              <>
                <div className="insight-stat-large">
                  {habitConsistency.avgStreak}
                  <span className="insight-unit">day avg streak</span>
                </div>
                <div className="habits-list">
                  {habitConsistency.habits.slice(0, 3).map((habit, idx) => (
                    <div key={idx} className="habit-item">
                      <span className="habit-name">{habit.name}</span>
                      <span className="habit-streak">{habit.streak} day streak</span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="insight-summary">No active habits yet. Start building habits to see your consistency!</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default InsightsView;
