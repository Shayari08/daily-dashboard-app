import React, { useEffect, useState } from 'react';
import axios from 'axios';
import '../styles/DailySummary.css';

function DailySummary({ tasksCompleted, onClose }) {
  const [praise, setPraise] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDailySummary();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadDailySummary = async () => {
    try {
      const response = await axios.get('/api/archive/today', {
        withCredentials: true
      });
      setPraise(response.data.archive?.praise || generateLocalPraise());
    } catch (error) {
      console.error('Failed to load summary:', error);
      setPraise(generateLocalPraise());
    } finally {
      setLoading(false);
    }
  };

  const generateLocalPraise = () => {
    if (tasksCompleted === 0) {
      return "Every day is a new opportunity. Tomorrow is your fresh start! 🌅";
    } else if (tasksCompleted <= 2) {
      return `You completed ${tasksCompleted} task${tasksCompleted > 1 ? 's' : ''} today. Progress, not perfection! ✨`;
    } else if (tasksCompleted <= 5) {
      return `Excellent work! ${tasksCompleted} tasks completed. You're building great momentum! 🚀`;
    } else {
      return `Incredible! ${tasksCompleted} tasks completed. You're absolutely crushing it! 🎉`;
    }
  };

  if (loading) {
    return null;
  }

  return (
    <div className="daily-summary-overlay" onClick={onClose}>
      <div className="daily-summary-modal" onClick={(e) => e.stopPropagation()}>
        <button className="btn-close-modal" onClick={onClose}>
          ✕
        </button>

        <div className="summary-header">
          <div className="summary-icon">⭐</div>
          <h2>Day Complete!</h2>
        </div>

        <div className="summary-content">
          <div className="summary-stats">
            <div className="stat-large">
              <div className="stat-value">{tasksCompleted}</div>
              <div className="stat-label">Tasks Completed</div>
            </div>
          </div>

          <div className="summary-praise">
            <p>{praise}</p>
          </div>

          <div className="summary-tomorrow">
            <span>📈</span>
            <span>Tomorrow is a fresh start</span>
          </div>
        </div>

        <button className="btn-continue" onClick={onClose}>
          Continue
        </button>
      </div>
    </div>
  );
}

export default DailySummary;
