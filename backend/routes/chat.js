const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const axios = require('axios');
const { isAuthenticated } = require('./auth');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

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

    // Generate AI response
    const aiResponse = await generateAIResponse(message, context);

    console.log('🤖 AI Response:', aiResponse.substring(0, 100) + '...');

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