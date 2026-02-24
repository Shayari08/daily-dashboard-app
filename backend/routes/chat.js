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
      `SELECT name, frequency, streak
       FROM habits
       WHERE user_id = $1 AND archived_at IS NULL
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
      // Command was executed, use command response
      aiResponse = commandResult.response;
      console.log('⚡ Command executed:', aiResponse);
    } else {
      // No command, generate AI response
      aiResponse = await generateAIResponse(message, context);
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
// AI Response Generator with Ollama
// ================================================

async function generateAIResponse(userMessage, context) {
  console.log('🔄 Generating AI response...');
  
  // Try Ollama first
  try {
    console.log('🤖 Trying Ollama...');
    return await generateOllamaResponse(userMessage, context);
  } catch (ollamaError) {
    console.log('⚠️ Ollama failed:', ollamaError.message);
    console.log('📝 Using fallback responses...');
    return generateLocalResponse(userMessage, context);
  }
}

async function generateOllamaResponse(userMessage, context) {
  // Build context prompt
  const pendingTasks = context.recentTasks.filter(t => t.status === 'pending');
  const completedTasks = context.recentTasks.filter(t => t.status === 'completed');
  
  const contextPrompt = `You are a helpful productivity assistant. 

The user currently has:
- ${pendingTasks.length} pending tasks
- ${completedTasks.length} completed tasks
- ${context.activeHabits.length} active habits

Recent tasks: ${pendingTasks.slice(0, 3).map(t => t.title).join(', ')}
Active habits: ${context.activeHabits.map(h => h.name).join(', ')}

Provide helpful, concise productivity advice. Keep responses under 100 words. Be encouraging and specific.

User question: ${userMessage}

Your response:`;

  console.log('📤 Sending to Ollama...');
  
  const response = await axios.post('http://localhost:11434/api/generate', {
    model: 'llama3.2',
    prompt: contextPrompt,
    stream: false,
    options: {
      temperature: 0.7,
      num_predict: 200
    }
  }, {
    timeout: 30000 // 30 seconds
  });

  console.log('✓ Ollama responded!');
  
  if (!response.data || !response.data.response) {
    throw new Error('Invalid Ollama response format');
  }

  return response.data.response.trim();
}

// Fallback for when Ollama is not available
function generateLocalResponse(userMessage, context) {
  const message = userMessage.toLowerCase();
  const pendingCount = context.recentTasks.filter(t => t.status === 'pending').length;
  const completedCount = context.recentTasks.filter(t => t.status === 'completed').length;
  const habitsCount = context.activeHabits.length;

  // Task-related responses
  if (message.includes('task') || message.includes('todo')) {
    if (message.includes('how many') || message.includes('count')) {
      return `You have ${pendingCount} pending tasks and ${completedCount} completed. ${pendingCount > 5 ? "That's quite a list! Want help prioritizing?" : "Looking manageable! Need help with any?"}`;
    }
    
    if (message.includes('break down') || message.includes('breakdown')) {
      return "I can help break down a task into smaller steps! Just hover over any task and click the ⚡ Breakdown button, then enter subtasks separated by commas.";
    }
    
    if (message.includes('prioritize') || message.includes('priority')) {
      const urgentTasks = context.recentTasks
        .filter(t => t.status === 'pending' && t.deadline)
        .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));
      
      if (urgentTasks.length > 0) {
        return `Let me help you prioritize! Your most urgent task is "${urgentTasks[0].title}" (due ${new Date(urgentTasks[0].deadline).toLocaleDateString()}). I recommend starting there!`;
      }
      return "Let me help you prioritize! I recommend starting with tasks that have upcoming deadlines or are most important to your goals.";
    }
    
    return `You have ${pendingCount} pending tasks. ${pendingCount > 0 ? 'Would you like help breaking any down or prioritizing?' : 'Great job staying on top of things!'}`;
  }

  // Habit-related responses
  if (message.includes('habit')) {
    if (message.includes('suggest') || message.includes('idea')) {
      return "Great habits to consider:\n• Morning meditation (10 min)\n• Daily reading (20 min)\n• Evening journaling (15 min)\n• Regular exercise (30 min)\n• Drink 8 glasses of water\n\nWhat area of life do you want to improve?";
    }
    
    if (message.includes('streak')) {
      const habitsWithStreaks = context.activeHabits.filter(h => h.streak > 0);
      if (habitsWithStreaks.length > 0) {
        const best = habitsWithStreaks.reduce((max, h) => h.streak > max.streak ? h : max);
        return `Your best streak is "${best.name}" at ${best.streak} days! 🔥 Keep it going!`;
      }
      return "Start building streaks by checking in consistently! Even one day at a time adds up to big progress. 🌱";
    }
    
    return `You're tracking ${habitsCount} habits. ${habitsCount > 0 ? "Keep up the great work! Consistency is key. 🔥" : "Want to start building a new habit? Try starting with just one small thing!"}`;
  }

  // Motivation and encouragement
  if (message.includes('motivat') || message.includes('encourage') || message.includes('stuck')) {
    const responses = [
      `You've completed ${completedCount} tasks recently - that's amazing! Every small step forward is progress. What would you like to tackle next?`,
      `Progress over perfection! You're doing great with ${habitsCount} active habits. Keep showing up, even on the tough days. 💪`,
      `Remember: You don't have to be perfect, just consistent. Small daily actions compound into big results. What's one thing you can do today?`,
      `You've got this! Break down what feels overwhelming into smaller pieces. Which task should we focus on first?`
    ];
    return responses[Math.floor(Math.random() * responses.length)];
  }

  // Help and guidance
  if (message.includes('help') || message.includes('how') || message.includes('what can')) {
    return "I'm here to help! I can:\n\n📝 Tasks\n• Break down into subtasks (click ⚡)\n• Help prioritize work\n• Track deadlines\n\n🌱 Habits\n• Build consistency\n• Track streaks 🔥\n• Suggest new habits\n\n💪 Motivation\n• Provide encouragement\n• Celebrate progress\n\nWhat would you like to work on?";
  }

  // Greeting
  if (message.includes('hi') || message.includes('hello') || message.includes('hey')) {
    return `Hey there! 👋 You have ${pendingCount} tasks and ${habitsCount} active habits. How can I help you be productive today?`;
  }

  // Default friendly response
  const responses = [
    "That's interesting! Tell me more about what you're working on.",
    `I'm here to help you stay productive! With ${pendingCount} pending tasks, what would you like to focus on?`,
    "Great question! How can I support your goals today?",
    `I'm listening! You have ${habitsCount} habits to build and ${pendingCount} tasks to tackle. Where should we start?`
  ];

  return responses[Math.floor(Math.random() * responses.length)];
}

module.exports = router;