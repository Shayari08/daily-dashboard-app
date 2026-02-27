const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const axios = require('axios');
const { isAuthenticated } = require('./auth');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// ================================================
// COMMAND PARSER
// ================================================

async function parseAndExecuteCommand(message, userId, context) {
  const messageLower = message.toLowerCase().trim();

  // Command 1: Add task
  const addTaskMatch = message.match(/^add task:?\s+(.+)$/i);
  if (addTaskMatch) {
    const title = addTaskMatch[1].trim();
    try {
      const result = await pool.query(
        `INSERT INTO tasks (user_id, title, status, created_at)
         VALUES ($1, $2, 'pending', NOW())
         RETURNING *`,
        [userId, title]
      );
      return {
        executed: true,
        response: `✓ Added task: "${title}"`
      };
    } catch (error) {
      return {
        executed: true,
        response: `✗ Failed to add task: ${error.message}`
      };
    }
  }

  // Command 2: Delete task
  const deleteTaskMatch = message.match(/^delete task:?\s+(.+)$/i);
  if (deleteTaskMatch) {
    const title = deleteTaskMatch[1].trim();
    try {
      const result = await pool.query(
        `DELETE FROM tasks
         WHERE user_id = $1 AND title ILIKE $2 AND deleted_at IS NULL
         RETURNING title`,
        [userId, `%${title}%`]
      );

      if (result.rowCount > 0) {
        return {
          executed: true,
          response: `✓ Deleted ${result.rowCount} task(s) matching "${title}"`
        };
      } else {
        return {
          executed: true,
          response: `✗ No tasks found matching "${title}"`
        };
      }
    } catch (error) {
      return {
        executed: true,
        response: `✗ Failed to delete task: ${error.message}`
      };
    }
  }

  // Command 3: Mark done
  const markDoneMatch = message.match(/^mark done:?\s+(.+)$/i);
  if (markDoneMatch) {
    const title = markDoneMatch[1].trim();
    try {
      const result = await pool.query(
        `UPDATE tasks
         SET status = 'completed', completed_at = NOW()
         WHERE user_id = $1 AND title ILIKE $2 AND status = 'pending' AND deleted_at IS NULL
         RETURNING title`,
        [userId, `%${title}%`]
      );

      if (result.rowCount > 0) {
        return {
          executed: true,
          response: `✓ Marked ${result.rowCount} task(s) as complete: "${result.rows[0].title}"`
        };
      } else {
        return {
          executed: true,
          response: `✗ No pending tasks found matching "${title}"`
        };
      }
    } catch (error) {
      return {
        executed: true,
        response: `✗ Failed to mark task done: ${error.message}`
      };
    }
  }

  // Command 4: Clear completed tasks
  if (messageLower.match(/^clear completed tasks?$/)) {
    try {
      const result = await pool.query(
        `UPDATE tasks
         SET archived_at = NOW()
         WHERE user_id = $1 AND status = 'completed' AND archived_at IS NULL
         RETURNING id`,
        [userId]
      );

      return {
        executed: true,
        response: `✓ Archived ${result.rowCount} completed task(s)`
      };
    } catch (error) {
      return {
        executed: true,
        response: `✗ Failed to clear completed tasks: ${error.message}`
      };
    }
  }

  // Command 5: Breakdown task
  const breakdownMatch = message.match(/^breakdown:?\s+(.+)$/i);
  if (breakdownMatch) {
    const title = breakdownMatch[1].trim();
    try {
      // Find the task
      const taskResult = await pool.query(
        `SELECT * FROM tasks
         WHERE user_id = $1 AND title ILIKE $2 AND deleted_at IS NULL
         LIMIT 1`,
        [userId, `%${title}%`]
      );

      if (taskResult.rows.length === 0) {
        return {
          executed: true,
          response: `✗ No task found matching "${title}"`
        };
      }

      const task = taskResult.rows[0];

      // Generate subtasks using LLM (would need to require llmService)
      const llmService = require('../services/llmService');
      const breakdownResult = await llmService.breakdownTask(task, context);

      if (!breakdownResult.success) {
        return {
          executed: true,
          response: `✗ Failed to generate subtasks: ${breakdownResult.error}`
        };
      }

      // Insert subtasks
      let insertedCount = 0;
      for (const subtask of breakdownResult.subtasks) {
        await pool.query(
          `INSERT INTO tasks (user_id, title, description, parent_task_id, status, estimated_duration, created_at)
           VALUES ($1, $2, $3, $4, 'pending', $5, NOW())`,
          [
            userId,
            subtask.title,
            subtask.description || null,
            task.id,
            subtask.estimated_duration || null
          ]
        );
        insertedCount++;
      }

      return {
        executed: true,
        response: `✓ Created ${insertedCount} subtasks for "${task.title}"`
      };
    } catch (error) {
      return {
        executed: true,
        response: `✗ Failed to breakdown task: ${error.message}`
      };
    }
  }

  // Command 6: Add recurring goal
  // Patterns: "add goal: run 3x a week", "goal: read daily", "I want to meditate every day"
  const goalPatterns = [
    /^(?:add )?goal:?\s+(.+?)\s+(\d+)x?\s*(?:a|per)?\s*week$/i,
    /^(?:add )?goal:?\s+(.+?)\s+(?:every\s*day|daily)$/i,
    /^(?:add )?goal:?\s+(.+?)\s+on\s+((?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)(?:\s*,?\s*(?:and\s*)?(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))*)$/i,
    /^i want to\s+(.+?)\s+(\d+)x?\s*(?:a|per)?\s*week$/i,
    /^i want to\s+(.+?)\s+(?:every\s*day|daily)$/i
  ];

  for (const pattern of goalPatterns) {
    const match = message.match(pattern);
    if (match) {
      try {
        let title, frequency, timesPerWeek = 1, specificDays = null;

        if (pattern.source.includes('\\d+')) {
          // X times per week pattern
          title = match[1].trim();
          timesPerWeek = parseInt(match[2]);
          frequency = 'x_per_week';
        } else if (pattern.source.includes('daily')) {
          // Daily pattern
          title = match[1].trim();
          frequency = 'daily';
          timesPerWeek = 7;
        } else if (pattern.source.includes('monday|tuesday')) {
          // Specific days pattern
          title = match[1].trim();
          frequency = 'specific_days';
          const daysStr = match[2].toLowerCase();
          specificDays = daysStr.match(/monday|tuesday|wednesday|thursday|friday|saturday|sunday/g);
          timesPerWeek = specificDays.length;
        }

        const result = await pool.query(
          `INSERT INTO recurring_goals
           (user_id, title, frequency, times_per_week, specific_days, week_start_date)
           VALUES ($1, $2, $3, $4, $5, CURRENT_DATE)
           RETURNING *`,
          [userId, title, frequency, timesPerWeek, specificDays]
        );

        const goal = result.rows[0];
        let scheduleMsg = '';
        if (frequency === 'daily') {
          scheduleMsg = 'every day';
        } else if (frequency === 'x_per_week') {
          scheduleMsg = `${timesPerWeek}x per week`;
        } else if (frequency === 'specific_days') {
          scheduleMsg = `on ${specificDays.join(', ')}`;
        }

        return {
          executed: true,
          response: `✓ Added recurring goal: "${title}" (${scheduleMsg})\n\nI'll generate tasks for this automatically. Say "generate today's tasks" to create tasks now!`
        };
      } catch (error) {
        return {
          executed: true,
          response: `✗ Failed to add goal: ${error.message}`
        };
      }
    }
  }

  // Command 7: List goals
  if (messageLower.match(/^(?:my goals|list goals|show goals|goals)$/)) {
    try {
      const result = await pool.query(
        `SELECT * FROM recurring_goals
         WHERE user_id = $1 AND is_active = true
         ORDER BY created_at DESC`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          executed: true,
          response: `You don't have any recurring goals yet.\n\nTry adding one like:\n• "add goal: run 3x a week"\n• "add goal: read daily"\n• "add goal: meditate on Monday, Wednesday, Friday"`
        };
      }

      let response = `📋 **Your Recurring Goals:**\n\n`;
      for (const goal of result.rows) {
        let scheduleStr = '';
        if (goal.frequency === 'daily') {
          scheduleStr = 'Daily';
        } else if (goal.frequency === 'x_per_week') {
          scheduleStr = `${goal.times_per_week}x/week (${goal.times_completed_this_week}/${goal.times_per_week} done)`;
        } else if (goal.frequency === 'specific_days' && goal.specific_days) {
          scheduleStr = goal.specific_days.map(d => d.slice(0, 3)).join(', ');
        }
        response += `• **${goal.title}** - ${scheduleStr}\n`;
      }

      return { executed: true, response };
    } catch (error) {
      return {
        executed: true,
        response: `✗ Failed to fetch goals: ${error.message}`
      };
    }
  }

  // Command 8: Remove goal
  const removeGoalMatch = message.match(/^(?:remove|delete) goal:?\s+(.+)$/i);
  if (removeGoalMatch) {
    const title = removeGoalMatch[1].trim();
    try {
      const result = await pool.query(
        `DELETE FROM recurring_goals
         WHERE user_id = $1 AND title ILIKE $2
         RETURNING title`,
        [userId, `%${title}%`]
      );

      if (result.rowCount > 0) {
        return {
          executed: true,
          response: `✓ Removed goal: "${result.rows[0].title}"`
        };
      } else {
        return {
          executed: true,
          response: `✗ No goal found matching "${title}"`
        };
      }
    } catch (error) {
      return {
        executed: true,
        response: `✗ Failed to remove goal: ${error.message}`
      };
    }
  }

  // Command 9: Generate today's tasks
  if (messageLower.match(/^(?:generate|create)?\s*(?:today'?s?)?\s*tasks?$/i) ||
      messageLower.match(/^generate tasks for today$/i)) {
    try {
      const today = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][new Date().getDay()];
      const todayDate = new Date().toISOString().split('T')[0];

      // Reset weekly counters if new week
      await pool.query(
        `UPDATE recurring_goals
         SET times_completed_this_week = 0, week_start_date = CURRENT_DATE, tasks_generated_today = FALSE
         WHERE user_id = $1 AND week_start_date < DATE_TRUNC('week', CURRENT_DATE)`,
        [userId]
      );

      // Get goals that need tasks today
      const goalsResult = await pool.query(
        `SELECT * FROM recurring_goals
         WHERE user_id = $1 AND is_active = true
           AND (last_generated_date IS NULL OR last_generated_date < $2)`,
        [userId, todayDate]
      );

      const distributions = {
        1: ['wednesday'], 2: ['tuesday', 'friday'], 3: ['monday', 'wednesday', 'friday'],
        4: ['monday', 'tuesday', 'thursday', 'friday'],
        5: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
        6: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
        7: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
      };

      const tasksCreated = [];
      for (const goal of goalsResult.rows) {
        let shouldGenerate = false;

        if (goal.frequency === 'daily') {
          shouldGenerate = true;
        } else if (goal.frequency === 'specific_days' && goal.specific_days?.includes(today)) {
          shouldGenerate = true;
        } else if ((goal.frequency === 'x_per_week' || goal.frequency === 'weekly') &&
                   goal.times_completed_this_week < goal.times_per_week) {
          const dist = distributions[goal.times_per_week] || distributions[3];
          if (dist.includes(today)) {
            shouldGenerate = true;
          }
        }

        if (shouldGenerate) {
          await pool.query(
            `INSERT INTO tasks (user_id, title, description, category, status, created_at)
             VALUES ($1, $2, $3, $4, 'pending', NOW())`,
            [userId, goal.title, goal.description, goal.category || 'Goals']
          );
          await pool.query(
            `UPDATE recurring_goals SET last_generated_date = $1 WHERE id = $2`,
            [todayDate, goal.id]
          );
          tasksCreated.push(goal.title);
        }
      }

      if (tasksCreated.length === 0) {
        return {
          executed: true,
          response: `No new tasks to generate today. Either all goals are done or already generated!\n\nSay "my goals" to see your recurring goals.`
        };
      }

      return {
        executed: true,
        response: `✓ Generated ${tasksCreated.length} task(s) for today:\n\n${tasksCreated.map(t => `• ${t}`).join('\n')}`
      };
    } catch (error) {
      return {
        executed: true,
        response: `✗ Failed to generate tasks: ${error.message}`
      };
    }
  }

  // No command matched
  return { executed: false };
}

// Get chat history
router.get('/history', isAuthenticated, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 50;
    
    const result = await pool.query(
      `SELECT id, role, content, context, created_at 
       FROM chat_messages 
       WHERE user_id = $1 
       ORDER BY created_at DESC 
       LIMIT $2`,
      [req.user.id, limit]
    );

    res.json({ messages: result.rows.reverse() });
  } catch (error) {
    console.error('Get chat history error:', error);
    res.status(500).json({ error: 'Failed to get chat history' });
  }
});

// Send message to AI
router.post('/message', isAuthenticated, async (req, res) => {
  try {
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    console.log('📩 Received message:', message);

    // Save user message
    await pool.query(
      `INSERT INTO chat_messages (user_id, role, content)
       VALUES ($1, $2, $3)`,
      [req.user.id, 'user', message]
    );

    // Get user context (recent tasks, habits, etc.)
    const tasksResult = await pool.query(
      `SELECT title, status, deadline
       FROM tasks
       WHERE user_id = $1 AND deleted_at IS NULL
       ORDER BY created_at DESC LIMIT 10`,
      [req.user.id]
    );

    const habitsResult = await pool.query(
      `SELECT title as name, frequency, streak
       FROM recurring_goals
       WHERE user_id = $1 AND is_active = true
       LIMIT 5`,
      [req.user.id]
    );

    // Build context for AI
    const context = {
      recentTasks: tasksResult.rows,
      activeHabits: habitsResult.rows,
      timestamp: new Date().toISOString()
    };

    console.log('📊 Context:', {
      tasks: context.recentTasks.length,
      habits: context.activeHabits.length
    });

    // Check for commands first
    const commandResult = await parseAndExecuteCommand(message, req.user.id, context);

    let aiResponse;
    if (commandResult.executed) {
      aiResponse = commandResult.response;
      console.log('⚡ Command executed:', aiResponse);
    } else {
      aiResponse = await generateAIResponse(message, context, req.user.id);
      console.log('🤖 AI Response:', aiResponse.substring(0, 100) + '...');
    }

    // Save AI message
    await pool.query(
      `INSERT INTO chat_messages (user_id, role, content, context)
       VALUES ($1, $2, $3, $4)`,
      [req.user.id, 'assistant', aiResponse, JSON.stringify(context)]
    );

    res.json({
      success: true,
      response: aiResponse
    });
  } catch (error) {
    console.error('❌ Chat error:', error.message);
    res.status(500).json({
      error: 'Failed to process message',
      details: error.message
    });
  }
});

// Clear chat history
router.delete('/history', isAuthenticated, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM chat_messages WHERE user_id = $1',
      [req.user.id]
    );

    res.json({ success: true, message: 'Chat history cleared' });
  } catch (error) {
    console.error('Clear chat error:', error);
    res.status(500).json({ error: 'Failed to clear chat history' });
  }
});

// ================================================
// AI Response Generator — Groq-powered companion
// ================================================

async function generateAIResponse(userMessage, context, userId) {
  const groqApiKey = process.env.GROQ_API_KEY;
  const groqModel = 'llama-3.1-8b-instant';

  const pendingTasks = context.recentTasks.filter(t => t.status === 'pending');
  const completedTasks = context.recentTasks.filter(t => t.status === 'completed');

  const taskSummary = pendingTasks.length > 0
    ? pendingTasks.slice(0, 5).map(t => `"${t.title}"`).join(', ')
    : 'none right now';
  const completedSummary = completedTasks.length > 0
    ? completedTasks.slice(0, 3).map(t => `"${t.title}"`).join(', ')
    : 'none yet today';
  const habitSummary = context.activeHabits.length > 0
    ? context.activeHabits.slice(0, 3).map(h => `"${h.name}"`).join(', ')
    : 'none set up yet';

  const systemPrompt = `You are a warm, caring companion sitting with the user while they work. You are NOT a productivity tool or assistant — you are a friend who genuinely cares about how they're doing as a person.

What you know about them right now:
- Pending tasks (${pendingTasks.length}): ${taskSummary}
- Recently completed (${completedTasks.length}): ${completedSummary}
- Active habits (${context.activeHabits.length}): ${habitSummary}

How to show up:
- Lead with warmth and humanity first — check in on how they're feeling, not just what they're doing
- When they vent or share something hard, acknowledge it before offering anything practical
- When they share a win (even small), genuinely celebrate it — don't rush past it
- Be curious about them as a person, not just their to-do list
- Keep responses short and natural (2-4 sentences) — like a real conversation, not a report
- If they ask for help with tasks, help them — but don't turn every conversation into task management
- Never start a response with "Great!" or hollow affirmations
- Never lecture, never unsolicited advice, never list things unless asked
- Sound like a real person, not a bot`;

  try {
    // Include recent conversation history for continuity
    const historyResult = await pool.query(
      `SELECT role, content FROM chat_messages
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 8`,
      [userId]
    );
    const recentHistory = historyResult.rows.reverse();

    const messages = [
      { role: 'system', content: systemPrompt },
      ...recentHistory.map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: userMessage }
    ];

    const response = await axios.post(
      'https://api.groq.com/openai/v1/chat/completions',
      { model: groqModel, messages, temperature: 0.85, max_tokens: 300 },
      {
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    );

    return response.data.choices?.[0]?.message?.content?.trim()
      || "I'm here with you! What's on your mind?";
  } catch (error) {
    console.error('Groq chat error:', error.message);
    const pending = pendingTasks.length;
    return pending > 0
      ? `I'm right here! You've got ${pending} task${pending !== 1 ? 's' : ''} going — what do you want to focus on?`
      : "I'm here with you! What are you working on today?";
  }
}

module.exports = router;