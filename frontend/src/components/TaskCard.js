import React, { useState } from 'react';
import '../styles/TaskCard.css';

function TaskCard({ task, onToggle, onDelete, onBreakdown }) {
  const [showSubtasks, setShowSubtasks] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

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
          {task.subtask_count > 0 && (
            <button 
              className="task-subtasks-toggle-cute"
              onClick={() => setShowSubtasks(!showSubtasks)}
            >
              {showSubtasks ? '▼' : '▶'} {task.subtask_count} subtask{task.subtask_count > 1 ? 's' : ''}
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
            className="btn-action-cute btn-delete-cute"
            onClick={onDelete}
            title="Delete task"
          >
            <span className="action-icon">🗑️</span>
            <span className="action-label">Delete</span>
          </button>
        </div>
      </div>

      {/* Subtasks */}
      {showSubtasks && task.subtask_count > 0 && (
        <div className="task-subtasks-cute">
          <p className="subtasks-placeholder-cute">
            Subtasks will appear here
          </p>
        </div>
      )}
    </div>
  );
}

export default TaskCard;
