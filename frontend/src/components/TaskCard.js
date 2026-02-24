import React, { useState } from 'react';
import axios from 'axios';
import '../styles/TaskCard.css';

function TaskCard({ task, onToggle, onDelete, onBreakdown, onAIBreakdown, onRefresh }) {
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [subtasks, setSubtasks] = useState(task.subtasks || []);

  const handleToggleSubtask = async (subtaskId, currentStatus) => {
    const newStatus = currentStatus === 'completed' ? 'pending' : 'completed';

    try {
      await axios.patch(`/api/tasks/${subtaskId}`, {
        status: newStatus
      }, { withCredentials: true });

      // Update local state
      setSubtasks(subtasks.map(st =>
        st.id === subtaskId ? { ...st, status: newStatus } : st
      ));

      // Refresh parent if needed
      if (onRefresh) onRefresh();
    } catch (error) {
      console.error('Failed to toggle subtask:', error);
    }
  };

  const completedSubtasks = subtasks.filter(st => st.status === 'completed').length;

  return (
    <div
      className="task-card-cute"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="task-main-cute">
        {/* Cute Checkbox */}
        <button
          className={`task-checkbox-cute ${task.status === 'completed' ? 'checked' : ''}`}
          onClick={onToggle}
          aria-label="Toggle task completion"
        >
          <span className="checkbox-inner">
            {task.status === 'completed' && (
              <span className="checkmark-cute">✓</span>
            )}
          </span>
        </button>

        {/* Content */}
        <div className="task-content-cute">
          <div className={`task-title-cute ${task.status === 'completed' ? 'completed' : ''}`}>
            {task.title}
          </div>
          {task.description && (
            <div className="task-description-cute">{task.description}</div>
          )}
          {task.deadline && (
            <div className="task-deadline-cute">
              📅 {new Date(task.deadline).toLocaleDateString()}
            </div>
          )}
          {subtasks.length > 0 && (
            <button
              className="task-subtasks-toggle-cute"
              onClick={() => setShowSubtasks(!showSubtasks)}
            >
              {showSubtasks ? '▼' : '▶'} {completedSubtasks}/{subtasks.length} subtasks
            </button>
          )}
        </div>

        {/* Actions */}
        <div className={`task-actions-cute ${isHovered ? 'visible' : ''}`}>
          <button
            className="btn-action-cute btn-breakdown-cute"
            onClick={onBreakdown}
            title="Break down into subtasks"
          >
            <span className="action-icon">⚡</span>
            <span className="action-label">Break</span>
          </button>
          <button
            className="btn-action-cute btn-ai-breakdown-cute"
            onClick={onAIBreakdown}
            title="AI-powered breakdown"
          >
            <span className="action-icon">🤖</span>
            <span className="action-label">AI Break</span>
          </button>
          <button
            className="btn-action-cute btn-delete-cute"
            onClick={onDelete}
            title="Delete task"
          >
            <span className="action-icon">🗑️</span>
            <span className="action-label">Delete</span>
          </button>
        </div>
      </div>

      {/* Subtasks List */}
      {showSubtasks && subtasks.length > 0 && (
        <div className="subtasks-list">
          {subtasks.map((subtask) => (
            <div
              key={subtask.id}
              className={`subtask-item ${subtask.status === 'completed' ? 'completed' : ''}`}
              onClick={() => handleToggleSubtask(subtask.id, subtask.status)}
            >
              <span className="subtask-bullet">
                {subtask.status === 'completed' ? '✓' : '○'}
              </span>
              <span className="subtask-title">{subtask.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TaskCard;
