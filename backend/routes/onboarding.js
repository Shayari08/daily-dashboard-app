// ============================================
// ONBOARDING BACKEND ROUTES
// File: backend/routes/onboarding.js
// ============================================

const express = require('express');
const router = express.Router();
const { Pool } = require('pg');
const { isAuthenticated } = require('./auth');
const llmService = require('../services/llmService');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// ============================================
// ROUTE: Check if user needs onboarding
// GET /api/onboarding/status
// ============================================
router.get('/status', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT onboarding_completed FROM users WHERE id = $1',
      [req.user.id]
    );

    res.json({
      needsOnboarding: !result.rows[0].onboarding_completed
    });
  } catch (error) {
    console.error('Onboarding status error:', error);
    res.status(500).json({ error: 'Failed to check onboarding status' });
  }
});

// ============================================
// ROUTE: Complete onboarding and generate tasks/habits
// POST /api/onboarding/complete
// ============================================
router.post('/complete', isAuthenticated, async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    const {
      name,
      goalsText,
      goals,
      dailyRoutine,
      preferences,
      workStyle,
      focusAreas
    } = req.body;

    // Analyze free-form text
    const textAnalysis = await analyzeGoalsText(goalsText);

    // Save onboarding data
    const onboardingData = {
      name,
      goalsText,
      textAnalysis,
      goals,
      dailyRoutine,
      preferences,
      workStyle,
      focusAreas,
      completedAt: new Date().toISOString()
    };

    await client.query(
      `UPDATE users
       SET onboarding_completed = true,
           onboarding_data = $1,
           name = COALESCE(NULLIF($3, ''), name)
       WHERE id = $2`,
      [JSON.stringify(onboardingData), req.user.id, name || '']
    );

    // Save structured goals (table may not exist)
    if (goals && goals.length > 0) {
      await client.query('SAVEPOINT user_goals_save');
      try {
        for (const goal of goals) {
          await client.query(
            `INSERT INTO user_goals (user_id, category, goal_text, priority, target_date)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (user_id, category, goal_text) DO NOTHING`,
            [req.user.id, goal.category, goal.text, goal.priority, goal.targetDate]
          );
        }
        await client.query('RELEASE SAVEPOINT user_goals_save');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT user_goals_save');
        console.log('user_goals save failed, skipping:', e.message);
      }
    }

    // Save preferences (table may not exist)
    if (preferences) {
      await client.query('SAVEPOINT preferences_save');
      try {
        for (const [key, value] of Object.entries(preferences)) {
          await client.query(
            `INSERT INTO user_preferences (user_id, preference_key, preference_value)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, preference_key)
             DO UPDATE SET preference_value = $3, updated_at = CURRENT_TIMESTAMP`,
            [req.user.id, key, JSON.stringify(value)]
          );
        }
        await client.query('RELEASE SAVEPOINT preferences_save');
      } catch (e) {
        await client.query('ROLLBACK TO SAVEPOINT preferences_save');
        console.log('user_preferences save failed, skipping:', e.message);
      }
    }

    // Generate tasks and habits (non-fatal — onboarding completes even if generation fails)
    let tasksCreated = [];
    let habitsCreated = [];

    try {
      tasksCreated = await generateInitialTasks(client, req.user.id, goals, focusAreas, textAnalysis, req.body);
    } catch (e) {
      console.error('Task generation failed (non-fatal):', e.message);
    }

    try {
      habitsCreated = await generateInitialHabits(client, req.user.id, dailyRoutine, preferences, focusAreas, textAnalysis, req.body);
    } catch (e) {
      console.error('Habit generation failed (non-fatal):', e.message);
    }

    await client.query('COMMIT');

    res.json({
      success: true,
      message: 'Onboarding completed successfully!',
      tasksCreated: tasksCreated.length,
      habitsCreated: habitsCreated.length,
      tasks: tasksCreated,
      habits: habitsCreated,
      insights: textAnalysis.insights || {}
    });

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Onboarding completion error:', error);
    res.status(500).json({ error: 'Failed to complete onboarding' });
  } finally {
    client.release();
  }
});

// ============================================
// ROUTE: Get user's onboarding data
// GET /api/onboarding/data
// ============================================
router.get('/data', isAuthenticated, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT onboarding_data FROM users WHERE id = $1',
      [req.user.id]
    );

    res.json({
      data: result.rows[0].onboarding_data
    });
  } catch (error) {
    console.error('Get onboarding data error:', error);
    res.status(500).json({ error: 'Failed to get onboarding data' });
  }
});

// ============================================
// FUNCTION: Analyze free-form goals text (AI-powered with fallback)
// ============================================
async function analyzeGoalsText(goalsText) {
  if (!goalsText || goalsText.trim().length < 20) {
    return {
      keywords: [],
      suggestedCategories: [],
      insights: {},
      aiGenerated: false
    };
  }

  try {
    // Use AI to analyze goals
    const result = await llmService.analyzeOnboardingGoals(goalsText);

    if (result.success) {
      return {
        ...result.analysis,
        aiGenerated: true
      };
    } else {
      // Fallback to keyword-based analysis
      console.warn('AI analysis failed, using fallback:', result.error);
      return fallbackAnalyzeGoalsText(goalsText);
    }
  } catch (error) {
    console.error('Error in AI goal analysis:', error);
    return fallbackAnalyzeGoalsText(goalsText);
  }
}

// ============================================
// FUNCTION: Keyword-based analysis fallback
// ============================================
function fallbackAnalyzeGoalsText(goalsText) {
  const text = goalsText.toLowerCase();
  const analysis = {
    keywords: [],
    suggestedCategories: [],
    suggestedTasks: [],
    insights: {
      timeManagement: false,
      healthFocus: false,
      careerFocus: false,
      learningFocus: false,
      socialFocus: false,
      creativeFocus: false,
      financeFocus: false,
      mindfulnessFocus: false
    },
    aiGenerated: false
  };

  // Health & Fitness
  const healthKeywords = ['health', 'fitness', 'exercise', 'workout', 'gym', 'run', 'weight', 'diet', 'nutrition', 'sleep', 'yoga', 'meditation', 'walk'];
  if (healthKeywords.some(keyword => text.includes(keyword))) {
    analysis.insights.healthFocus = true;
    analysis.suggestedCategories.push('Health & Fitness');
    analysis.suggestedTasks.push(
      'Create weekly exercise schedule',
      'Plan healthy meals for the week',
      'Set up sleep routine'
    );
  }

  // Career & Learning
  const careerKeywords = ['career', 'job', 'work', 'learn', 'study', 'course', 'skill', 'coding', 'programming', 'certification', 'training', 'professional'];
  if (careerKeywords.some(keyword => text.includes(keyword))) {
    analysis.insights.careerFocus = true;
    analysis.insights.learningFocus = true;
    analysis.suggestedCategories.push('Career & Learning');
    analysis.suggestedTasks.push(
      'Research relevant courses or training',
      'Dedicate 30 minutes daily for skill practice',
      'Build a portfolio project'
    );
  }

  // Productivity & Time Management
  const productivityKeywords = ['organized', 'productive', 'focus', 'distracted', 'procrastinate', 'time management', 'schedule', 'routine', 'consistent', 'discipline'];
  if (productivityKeywords.some(keyword => text.includes(keyword))) {
    analysis.insights.timeManagement = true;
    analysis.suggestedCategories.push('Productivity');
    analysis.suggestedTasks.push(
      'Set up morning planning routine',
      'Identify and eliminate top 3 distractions',
      'Block focus time for deep work'
    );
  }

  // Personal Growth
  const growthKeywords = ['grow', 'improve', 'better', 'develop', 'mindset', 'habit', 'goal', 'achieve', 'success', 'self-improvement'];
  if (growthKeywords.some(keyword => text.includes(keyword))) {
    analysis.suggestedCategories.push('Personal Growth');
    analysis.suggestedTasks.push(
      'Start daily journaling practice',
      'Read 20 pages of a personal development book daily',
      'Set weekly reflection time'
    );
  }

  // Relationships
  const relationshipKeywords = ['family', 'friends', 'relationship', 'social', 'connect', 'loved ones', 'partner', 'spouse', 'kids', 'children'];
  if (relationshipKeywords.some(keyword => text.includes(keyword))) {
    analysis.insights.socialFocus = true;
    analysis.suggestedCategories.push('Relationships');
    analysis.suggestedTasks.push(
      'Schedule weekly quality time with loved ones',
      'Plan a meaningful activity together',
      'Practice active listening daily'
    );
  }

  // Finance
  const financeKeywords = ['money', 'finance', 'budget', 'save', 'invest', 'debt', 'financial', 'income', 'expense', 'savings'];
  if (financeKeywords.some(keyword => text.includes(keyword))) {
    analysis.insights.financeFocus = true;
    analysis.suggestedCategories.push('Finance');
    analysis.suggestedTasks.push(
      'Create monthly budget spreadsheet',
      'Track all expenses for one week',
      'Set up automatic savings transfer'
    );
  }

  // Creativity
  const creativityKeywords = ['creative', 'art', 'music', 'write', 'paint', 'design', 'project', 'hobby', 'draw', 'craft'];
  if (creativityKeywords.some(keyword => text.includes(keyword))) {
    analysis.insights.creativeFocus = true;
    analysis.suggestedCategories.push('Creativity');
    analysis.suggestedTasks.push(
      'Set up dedicated creative workspace',
      'Schedule 30-minute creative sessions',
      'Start a creative project this week'
    );
  }

  // Mindfulness
  const mindfulnessKeywords = ['meditate', 'mindful', 'calm', 'stress', 'anxiety', 'peace', 'balance', 'mental health', 'overwhelm', 'relax'];
  if (mindfulnessKeywords.some(keyword => text.includes(keyword))) {
    analysis.insights.mindfulnessFocus = true;
    analysis.suggestedTasks.push(
      'Start 5-minute daily meditation',
      'Practice gratitude journaling',
      'Schedule 10-minute relaxation breaks'
    );
  }

  return analysis;
}

// ============================================
// FUNCTION: Generate initial tasks (AI-powered with fallback)
// ============================================
async function generateInitialTasks(client, userId, goals, focusAreas, textAnalysis, fullOnboardingData) {
  const tasks = [];

  try {
    // Use AI to generate tasks
    const result = await llmService.generateOnboardingTasks({
      goalsText: fullOnboardingData.goalsText,
      focusAreas: focusAreas || [],
      dailyRoutine: fullOnboardingData.dailyRoutine || {},
      preferences: fullOnboardingData.preferences || {},
      aiAnalysis: textAnalysis
    });

    if (result.success && result.tasks && result.tasks.length > 0) {
      // Save AI-generated tasks to database
      for (const taskData of result.tasks) {
        const taskResult = await client.query(
          `INSERT INTO tasks (user_id, title, description, status, created_by)
           VALUES ($1, $2, $3, 'pending', 'ai')
           RETURNING *`,
          [userId, taskData.title, taskData.description]
        );
        tasks.push(taskResult.rows[0]);
      }

      console.log(`✓ Generated ${tasks.length} AI-powered tasks`);
      return tasks;
    } else {
      console.warn('AI task generation failed, using fallback');
      return await fallbackGenerateInitialTasks(client, userId, goals, focusAreas, textAnalysis);
    }
  } catch (error) {
    console.error('Error in AI task generation:', error);
    return await fallbackGenerateInitialTasks(client, userId, goals, focusAreas, textAnalysis);
  }
}

// ============================================
// FUNCTION: Fallback task generation
// ============================================
async function fallbackGenerateInitialTasks(client, userId, goals, focusAreas, textAnalysis) {
  const tasks = [];

  // Map focus area IDs to categories for filtering
  const focusAreaToCategory = {
    'health': 'Health & Fitness',
    'career': 'Career & Learning',
    'productivity': 'Productivity',
    'relationships': 'Relationships',
    'creativity': 'Creativity',
    'finance': 'Finance',
    'mindfulness': 'Mindfulness'
  };
  const selectedCategories = (focusAreas || []).map(id => focusAreaToCategory[id] || id);

  // Generate from structured goals
  if (goals && goals.length > 0) {
    for (const goal of goals) {
      const taskTitle = `${goal.category}: ${goal.text}`;
      const description = `Work towards: ${goal.text}`;

      const result = await client.query(
        `INSERT INTO tasks (user_id, title, description, status, deadline, created_by)
         VALUES ($1, $2, $3, 'pending', $4, 'ai')
         RETURNING *`,
        [userId, taskTitle, description, goal.targetDate]
      );

      tasks.push(result.rows[0]);

      // Generate subtasks only if goal category matches selected focus areas
      if (selectedCategories.includes(goal.category)) {
        const subtasks = generateSubtasksForGoal(goal);

        for (const subtask of subtasks) {
          const subtaskResult = await client.query(
            `INSERT INTO tasks (user_id, title, description, status, parent_task_id, created_by)
             VALUES ($1, $2, $3, 'pending', $4, 'ai')
             RETURNING *`,
            [userId, subtask.title, subtask.description, result.rows[0].id]
          );

          await client.query(
            'UPDATE tasks SET subtask_count = subtask_count + 1 WHERE id = $1',
            [result.rows[0].id]
          );

          tasks.push(subtaskResult.rows[0]);
        }
      }
    }
  }

  // Generate from text analysis — only tasks matching selected focus areas
  if (textAnalysis && textAnalysis.suggestedTasks && textAnalysis.suggestedTasks.length > 0) {
    // Filter: only include tasks whose category is in the selected focus areas
    const categoryForTask = {};
    if (textAnalysis.suggestedCategories) {
      for (const cat of textAnalysis.suggestedCategories) {
        if (selectedCategories.includes(cat)) {
          categoryForTask[cat] = true;
        }
      }
    }

    // Only generate text-analysis tasks if at least one matching category exists
    if (Object.keys(categoryForTask).length > 0) {
      for (const taskTitle of textAnalysis.suggestedTasks) {
        const result = await client.query(
          `INSERT INTO tasks (user_id, title, description, status, created_by)
           VALUES ($1, $2, $3, 'pending', 'ai')
           RETURNING *`,
          [userId, taskTitle, 'Generated from your goals']
        );
        tasks.push(result.rows[0]);
      }
    }
  }

  // Focus area tasks — use readable labels
  if (focusAreas && focusAreas.length > 0) {
    for (const area of focusAreas) {
      const label = focusAreaToCategory[area] || area;
      const areaTask = await client.query(
        `INSERT INTO tasks (user_id, title, description, status, created_by)
         VALUES ($1, $2, $3, 'pending', 'ai')
         RETURNING *`,
        [userId, `Focus on ${label}`, `Dedicate time to improving ${label}`]
      );
      tasks.push(areaTask.rows[0]);
    }
  }

  return tasks;
}

// ============================================
// FUNCTION: Generate subtasks for goals
// ============================================
function generateSubtasksForGoal(goal) {
  const subtasksMap = {
    'Health & Fitness': [
      { title: 'Set up workout schedule', description: 'Plan when and how to exercise' },
      { title: 'Research healthy meal plans', description: 'Find recipes and nutrition info' },
      { title: 'Track water intake', description: 'Stay hydrated throughout the day' }
    ],
    'Career & Learning': [
      { title: 'Identify key skills to learn', description: 'List specific skills needed' },
      { title: 'Find learning resources', description: 'Courses, books, tutorials' },
      { title: 'Set weekly learning time', description: 'Block time for studying' }
    ],
    'Personal Growth': [
      { title: 'Start journaling practice', description: 'Reflect daily on progress' },
      { title: 'Read personal development books', description: 'Choose 1-2 books to start' },
      { title: 'Practice mindfulness', description: 'Begin meditation or reflection' }
    ],
    'Productivity': [
      { title: 'Set up task management system', description: 'Organize your workflow' },
      { title: 'Identify time wasters', description: 'Track and eliminate distractions' },
      { title: 'Create daily routine', description: 'Structure your day effectively' }
    ],
    'Relationships': [
      { title: 'Schedule quality time', description: 'Plan activities with loved ones' },
      { title: 'Practice active listening', description: 'Be present in conversations' },
      { title: 'Show appreciation', description: 'Express gratitude regularly' }
    ],
    'Finance': [
      { title: 'Create budget plan', description: 'Track income and expenses' },
      { title: 'Set savings goals', description: 'Define short and long-term targets' },
      { title: 'Review financial habits', description: 'Identify areas to improve' }
    ],
    'Creativity': [
      { title: 'Set up creative space', description: 'Designate area for creative work' },
      { title: 'Schedule creative time', description: 'Block regular time for projects' },
      { title: 'Gather inspiration', description: 'Build collection of ideas' }
    ]
  };

  return subtasksMap[goal.category] || [
    { title: 'Break down goal into steps', description: 'Plan actionable milestones' },
    { title: 'Set weekly targets', description: 'Define what to accomplish weekly' }
  ];
}

// ============================================
// FUNCTION: Generate initial habits (AI-powered with fallback)
// ============================================
async function generateInitialHabits(client, userId, dailyRoutine, preferences, focusAreas, textAnalysis, fullOnboardingData) {
  const habits = [];

  try {
    // Use AI to generate habits
    const result = await llmService.generateOnboardingHabits({
      goalsText: fullOnboardingData.goalsText,
      focusAreas: focusAreas || [],
      dailyRoutine: dailyRoutine || {},
      preferences: preferences || {},
      aiAnalysis: textAnalysis
    });

    if (result.success && result.habits && result.habits.length > 0) {
      // Save AI-generated habits as recurring goals
      for (const habitData of result.habits) {
        const freq = habitData.frequency === 'daily' ? 'daily' : 'x_per_week';
        const timesPerWeek = habitData.frequency === 'daily' ? 7 : 1;
        const habitResult = await client.query(
          `INSERT INTO recurring_goals (user_id, title, frequency, times_per_week, streak, best_streak, week_start_date)
           VALUES ($1, $2, $3, $4, 0, 0, CURRENT_DATE)
           RETURNING *`,
          [userId, habitData.name, freq, timesPerWeek]
        );
        habits.push(habitResult.rows[0]);
      }

      console.log(`✓ Generated ${habits.length} AI-powered habits`);
      return habits;
    } else {
      console.warn('AI habit generation failed, using fallback');
      return await fallbackGenerateInitialHabits(client, userId, dailyRoutine, preferences, focusAreas, textAnalysis);
    }
  } catch (error) {
    console.error('Error in AI habit generation:', error);
    return await fallbackGenerateInitialHabits(client, userId, dailyRoutine, preferences, focusAreas, textAnalysis);
  }
}

// ============================================
// FUNCTION: Fallback habit generation
// ============================================
async function fallbackGenerateInitialHabits(client, userId, dailyRoutine, preferences, focusAreas, textAnalysis) {
  const habits = [];

  // Helper to insert a habit as a recurring goal
  const insertGoal = async (name, frequency) => {
    const freq = frequency === 'daily' ? 'daily' : 'x_per_week';
    const timesPerWeek = frequency === 'daily' ? 7 : 1;
    const result = await client.query(
      `INSERT INTO recurring_goals (user_id, title, frequency, times_per_week, streak, best_streak, week_start_date)
       VALUES ($1, $2, $3, $4, 0, 0, CURRENT_DATE)
       RETURNING *`,
      [userId, name, freq, timesPerWeek]
    );
    habits.push(result.rows[0]);
  };

  // Morning routine habits
  if (dailyRoutine?.morningRoutine) {
    await insertGoal('🌅 Morning Wake-up', 'daily');
    await insertGoal('💧 Drink Water', 'daily');
    await insertGoal('🧘 Morning Meditation', 'daily');
  }

  // Work/productivity habits
  if (preferences?.workStyle === 'focused' || focusAreas?.includes('productivity')) {
    await insertGoal('🎯 Deep Work Session', 'daily');
    await insertGoal('📝 Daily Planning', 'daily');
    await insertGoal('🚫 Minimize Distractions', 'daily');
  }

  // Health & fitness habits
  if (focusAreas?.includes('health')) {
    await insertGoal('🏃 Exercise', dailyRoutine?.exerciseFrequency || 'daily');
    await insertGoal('🥗 Eat Healthy Meal', 'daily');
    await insertGoal('😴 Sleep On Time', 'daily');
  }

  // Learning habits
  if (focusAreas?.includes('career')) {
    await insertGoal('📚 Study/Learn', 'daily');
    await insertGoal('📖 Read', 'daily');
    await insertGoal('✍️ Practice Skills', 'daily');
  }

  // Evening routine habits
  if (dailyRoutine?.eveningRoutine) {
    await insertGoal('📓 Evening Reflection', 'daily');
    await insertGoal('📱 No Screens Before Bed', 'daily');
    await insertGoal('🛏️ Consistent Bedtime', 'daily');
  }

  // Mindfulness habits
  if (preferences?.mindfulness || textAnalysis?.insights?.mindfulnessFocus) {
    await insertGoal('🧘 Meditation', 'daily');
    await insertGoal('🙏 Gratitude Practice', 'daily');
    await insertGoal('✨ Positive Affirmations', 'daily');
  }

  // Habits from text analysis insights
  if (textAnalysis?.insights?.timeManagement) {
    await insertGoal('📅 Daily Planning', 'daily');
    await insertGoal('🎯 Time Blocking', 'daily');
  }

  return habits;
}

// ============================================
// ROUTE: Preview AI-generated tasks/habits (before final save)
// POST /api/onboarding/preview
// ============================================
router.post('/preview', isAuthenticated, async (req, res) => {
  try {
    const { goalsText, focusAreas, dailyRoutine, preferences } = req.body;

    console.log('📝 Preview request received:');
    console.log('  - Goals text length:', goalsText?.length || 0);
    console.log('  - Focus areas:', focusAreas);
    console.log('  - Daily routine:', dailyRoutine);
    console.log('  - Preferences:', preferences);

    // Analyze goals
    const textAnalysis = await analyzeGoalsText(goalsText);
    console.log('🔍 Text analysis complete:', textAnalysis.aiGenerated ? 'AI-powered' : 'Fallback');

    // Generate preview (don't save to DB)
    console.log('🤖 Generating tasks...');
    const tasksResult = await llmService.generateOnboardingTasks({
      goalsText,
      focusAreas,
      dailyRoutine,
      preferences,
      aiAnalysis: textAnalysis
    });
    console.log('  ✓ Tasks result:', tasksResult.success ? `${tasksResult.tasks?.length} tasks` : `Failed: ${tasksResult.error}`);

    console.log('🤖 Generating habits...');
    const habitsResult = await llmService.generateOnboardingHabits({
      goalsText,
      focusAreas,
      dailyRoutine,
      preferences,
      aiAnalysis: textAnalysis
    });
    console.log('  ✓ Habits result:', habitsResult.success ? `${habitsResult.habits?.length} habits` : `Failed: ${habitsResult.error}`);

    res.json({
      success: true,
      preview: {
        tasks: tasksResult.success ? tasksResult.tasks : [],
        habits: habitsResult.success ? habitsResult.habits : [],
        analysis: textAnalysis,
        aiStatus: {
          tasks: tasksResult.success,
          habits: habitsResult.success,
          tasksError: tasksResult.error,
          habitsError: habitsResult.error
        }
      }
    });

  } catch (error) {
    console.error('❌ Onboarding preview error:', error);
    res.status(500).json({ error: 'Failed to generate preview', details: error.message });
  }
});

module.exports = router;
