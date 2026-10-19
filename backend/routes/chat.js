const express = require('express');
const router = express.Router();
const axios = require('axios');
const { isAuthenticated } = require('./auth');

const pool = require('../config/db');

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

  // Command 10: List / Show tasks
  const isShowTasksCommand = (
    messageLower.match(/^(?:what (?:are|is) (?:my )?tasks?(?: for today| today)?|what tasks? (?:do i have|are there)(?: today)?|show (?:my )?tasks?|list (?:my )?tasks?|my tasks?|tasks? today|today'?s? tasks?|what should i (?:work on|do)(?: today)?|what do i (?:have|need) to do(?: today)?)$/i) ||
    messageLower.includes('what are my tasks') ||
    messageLower.includes('what tasks do i have') ||
    messageLower.includes('tasks for today') ||
    messageLower.includes('show my tasks') ||
    messageLower.includes('list my tasks') ||
    messageLower === 'tasks' ||
    messageLower === 'show tasks' ||
    messageLower === 'list tasks' ||
    messageLower === 'my tasks'
  );

  if (isShowTasksCommand) {
    try {
      const result = await pool.query(
        `SELECT id, title, description, estimated_duration, priority, energy_required
         FROM tasks
         WHERE user_id = $1 AND status = 'pending' AND deleted_at IS NULL AND archived_at IS NULL
         ORDER BY priority_score DESC NULLS LAST, created_at ASC`,
        [userId]
      );

      if (result.rows.length === 0) {
        return {
          executed: true,
          response: `You don't have any pending tasks right now! 🎉\n\nYou're all caught up. Say "add task: [task name]" if you'd like to plan something, or "generate today's tasks" to create tasks from your recurring goals.`
        };
      }

      let response = `📋 **Here are your active tasks for today (${result.rows.length}):**\n\n`;
      result.rows.forEach((t, i) => {
        const meta = [];
        if (t.estimated_duration) meta.push(`${t.estimated_duration}m`);
        if (t.priority && t.priority !== 'medium') meta.push(t.priority);
        const metaStr = meta.length > 0 ? ` (${meta.join(', ')})` : '';
        response += `${i + 1}. **${t.title}**${metaStr}\n`;
        if (t.description) response += `   *${t.description}*\n`;
      });
      response += `\nWhich one would you like to focus on? You can say "mark done: [title]" when finished or "breakdown: [title]" for subtasks!`;

      return { executed: true, response };
    } catch (error) {
      return {
        executed: true,
        response: `✗ Failed to retrieve tasks: ${error.message}`
      };
    }
  }

  // Command 11: Progress / Summary
  if (messageLower.match(/^(?:how am i doing(?: today)?|my progress|progress|summary|today'?s? progress)$/i)) {
    try {
      const summaryResult = await pool.query(
        `SELECT 
           COUNT(*) FILTER (WHERE status = 'completed' AND (completed_at >= CURRENT_DATE OR updated_at >= CURRENT_DATE)) as completed_today,
           COUNT(*) FILTER (WHERE status = 'pending' AND deleted_at IS NULL AND archived_at IS NULL) as pending_today
         FROM tasks
         WHERE user_id = $1`,
        [userId]
      );

      const completed = parseInt(summaryResult.rows[0]?.completed_today || 0);
      const pending = parseInt(summaryResult.rows[0]?.pending_today || 0);

      let response = `📊 **Today's Overview:**\n\n`;
      response += `• ✅ Completed today: **${completed}** task${completed !== 1 ? 's' : ''}\n`;
      response += `• ⏳ In progress: **${pending}** task${pending !== 1 ? 's' : ''}\n\n`;

      if (completed > 0 && pending === 0) {
        response += `Incredible work! You've finished everything on your plate today. Time to relax! 🌟`;
      } else if (completed > 0) {
        response += `Great momentum! Keep chipping away at your list one step at a time. 💪`;
      } else if (pending > 0) {
        response += `Ready to start? Pick just one small task to build your initial momentum! 🚀`;
      } else {
        response += `A fresh, clear day! Say "add task: [name]" or "generate today's tasks" when you're ready. ✨`;
      }

      return { executed: true, response };
    } catch (error) {
      return {
        executed: true,
        response: `✗ Failed to retrieve progress: ${error.message}`
      };
    }
  }

  // Command 12: Help
  if (messageLower === 'help' || messageLower === 'commands' || messageLower === 'what can you do') {
    const helpMsg = `🤖 **Commands you can use anytime:**\n\n` +
      `• **"what tasks do i have today?"** - View all pending tasks\n` +
      `• **"add task: [title]"** - Quickly add a task\n` +
      `• **"mark done: [title]"** - Complete a task\n` +
      `• **"delete task: [title]"** - Remove a task\n` +
      `• **"breakdown: [title]"** - Split task into smaller steps\n` +
      `• **"my goals"** - List your recurring goals\n` +
      `• **"add goal: [e.g. read 3x a week]"** - Create a recurring goal\n` +
      `• **"generate today's tasks"** - Auto-create tasks from active goals\n` +
      `• **"how am i doing today?"** - View today's completed vs pending count\n\n` +
      `Or just chat with me normally about whatever's on your mind! 🌿`;
    return { executed: true, response: helpMsg };
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
// AI Response Generator — Gemini-powered companion
// ================================================

async function generateAIResponse(userMessage, context, userId) {
  const geminiApiKey = process.env.GEMINI_API_KEY;
  const configuredGeminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
  const geminiModel = configuredGeminiModel.replace(/^models\//, '');

  const groqApiKey = process.env.GROQ_API_KEY;
  const configuredGroqModel = process.env.GROQ_MODEL || 'llama-3.1-8b-instant';
  const groqModel = configuredGroqModel === 'llama-3.1-70b-versatile' ? 'llama-3.3-70b-versatile' : configuredGroqModel;

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

  // Method 1: Try Direct Gemini if API key is present
  if (geminiApiKey) {
    try {
      const historyResult = await pool.query(
        `SELECT role, content FROM chat_messages
         WHERE user_id = $1
         ORDER BY created_at DESC
         OFFSET 1
         LIMIT 8`,
        [userId]
      );
      const previousHistory = historyResult.rows.reverse();

      const contents = [];
      for (const msg of previousHistory) {
        const role = msg.role === 'assistant' ? 'model' : 'user';
        const text = (msg.content || '').trim();
        if (!text) continue;

        if (contents.length > 0 && contents[contents.length - 1].role === role) {
          contents[contents.length - 1].parts[0].text += `\n${text}`;
        } else {
          contents.push({
            role,
            parts: [{ text }]
          });
        }
      }

      // Ensure history starts with user turn
      while (contents.length > 0 && contents[0].role !== 'user') {
        contents.shift();
      }

      // Append current user message
      contents.push({
        role: 'user',
        parts: [{ text: userMessage }]
      });

      const response = await axios.post(
        `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent?key=${geminiApiKey}`,
        {
          systemInstruction: {
            parts: [{ text: systemPrompt }]
          },
          contents,
          generationConfig: {
            temperature: 0.85,
            maxOutputTokens: 300
          }
        },
        {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );

      const generated = response.data?.candidates?.[0]?.content?.parts
        ?.map(p => p.text)
        .join('')
        ?.trim();
      if (generated) return generated;
    } catch (geminiError) {
      console.warn('Direct Gemini chat attempt failed, trying fallback:', geminiError.message);
      if (geminiError.response?.data) {
        console.warn('Gemini response data:', JSON.stringify(geminiError.response.data));
      }
    }
  }

  // Method 1b: Try Direct Groq if Gemini is not set and Groq API key is present
  if (groqApiKey && !geminiApiKey) {
    try {
      const historyResult = await pool.query(
        `SELECT role, content FROM chat_messages
         WHERE user_id = $1
         ORDER BY created_at DESC
         OFFSET 1
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

      const generated = response.data.choices?.[0]?.message?.content?.trim();
      if (generated) return generated;
    } catch (groqError) {
      console.warn('Direct Groq chat attempt failed, trying llmService:', groqError.message);
    }
  }

  // Method 2: Try general llmService (Ollama / HuggingFace / Fallback)
  try {
    const llmService = require('../services/llmService');
    const prompt = `${systemPrompt}\n\nUser: ${userMessage}\nCompanion:`;
    const serviceRes = await llmService.generateCompletion(prompt, { temperature: 0.8, max_tokens: 250 });
    if (serviceRes && serviceRes.success && !serviceRes.fallback && serviceRes.text) {
      return serviceRes.text.trim();
    }
  } catch (serviceErr) {
    console.warn('llmService chat attempt failed:', serviceErr.message);
  }

  // Method 3: Smart contextual fallback with randomized empathetic variety
  const lowerMsg = userMessage.toLowerCase().trim();
  const pending = pendingTasks.length;
  const completed = completedTasks.length;

  // Greetings
  if (lowerMsg.match(/^(?:hi|hello|hey|good morning|good afternoon|good evening|yo|sup)\b/)) {
    const greetingReplies = [
      `Hey! Great to see you. How is your energy feeling today?`,
      `Hi there! Hope your day is treating you well so far. What's on your mind?`,
      `Hello! I'm right here with you. Taking things one step at a time today?`
    ];
    return greetingReplies[Math.floor(Math.random() * greetingReplies.length)];
  }

  // User asking what to do / how to start
  if (lowerMsg.includes('what should i') || lowerMsg.includes('where to start') || lowerMsg.includes('what next')) {
    if (pending > 0) {
      return `You've got ${pending} task${pending !== 1 ? 's' : ''} on your radar right now, starting with "${pendingTasks[0].title}". Want to tackle just 10 minutes of that to get some easy momentum?`;
    }
    return `Your task board is completely clear right now! You can add a new task anytime, or simply enjoy a quiet break.`;
  }

  // User venting or tired
  if (lowerMsg.includes('tired') || lowerMsg.includes('exhausted') || lowerMsg.includes('overwhelm') || lowerMsg.includes('stressed') || lowerMsg.includes('hard')) {
    return `I hear you. Take a deep breath — you don't have to carry the whole day at once. Even pausing for 5 minutes with a glass of water can help reset things. What's the heaviest thing on your plate?`;
  }

  // User sharing a win
  if (lowerMsg.includes('done') || lowerMsg.includes('finished') || lowerMsg.includes('finally') || lowerMsg.includes('yay') || lowerMsg.includes('completed')) {
    return `That's wonderful! Celebrate that win — every completed step builds real momentum. Take a moment to appreciate what you just finished. 🎉`;
  }

  // General companion fallbacks
  const generalReplies = [
    pending > 0
      ? `I'm right here with you! You have ${pending} task${pending !== 1 ? 's' : ''} in progress. How are you feeling about tackling them?`
      : `I'm right here! Your active task list is clear right now. What would you like to focus on?`,
    completed > 0
      ? `You've already knocked out ${completed} task${completed !== 1 ? 's' : ''} today. How are your energy levels holding up?`
      : `I'm listening. Tell me what's on your mind or what you'd like to work towards today.`,
    `Always here in your corner. Need a sounding board, a quick breakdown of a task, or just a minute to reset?`
  ];

  return generalReplies[Math.floor(Math.random() * generalReplies.length)];
}

module.exports = router;