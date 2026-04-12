# Daily Dashboard App — Complete Technical Reference

> Everything about how this app works, from the database to the browser. Written so you can reason about any part of the system confidently.

---

## Table of Contents

1. [What the App Is](#1-what-the-app-is)
2. [Tech Stack](#2-tech-stack)
3. [High-Level Architecture](#3-high-level-architecture)
4. [Directory Structure](#4-directory-structure)
5. [Database Schema](#5-database-schema)
6. [Backend — Server & Middleware](#6-backend--server--middleware)
7. [Authentication](#7-authentication)
8. [Routes (API Endpoints)](#8-routes-api-endpoints)
9. [AI / LLM Service](#9-ai--llm-service)
10. [Frontend — Pages & Components](#10-frontend--pages--components)
11. [Feature Data Flows](#11-feature-data-flows)
12. [Deployment](#12-deployment)
13. [Environment Variables](#13-environment-variables)
14. [Monitoring & Logging](#14-monitoring--logging)

---

## 1. What the App Is

A personal productivity dashboard with an AI backbone. Users log in with Google or GitHub, go through a one-time onboarding that captures their goals and preferences, and land on a dashboard that gives them:

- **Tasks** — daily to-dos, optionally broken down into subtasks by AI
- **Recurring Goals** — habits/commitments on a schedule (daily, specific days, X times/week)
- **AI Companion (Chatbot)** — a warm conversational partner that also understands commands ("add task: ...", "breakdown: ...")
- **Insights** — behavioral analytics (productivity trends, procrastination patterns, habit streaks)
- **Recommendations** — curated learning resources matched to their goals
- **Archive** — calendar view of every day's completed tasks and habits

Everything is personalized. The AI knows the user's goals, focus areas, work style, and recurring commitments from onboarding, and uses that context whenever it generates tasks, gives advice, or recommends resources.

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, React Router v6, Axios, Framer Motion |
| Backend | Node.js, Express 4 |
| Database | PostgreSQL 15 |
| Auth | Passport.js — Google OAuth 2.0 + GitHub OAuth |
| Sessions | express-session (server-side sessions stored in memory) |
| AI/LLM | Groq API (cloud) + Ollama (local) + Hugging Face (fallback) |
| Logging | Winston + daily rotating files |
| Metrics | Prometheus + Grafana |
| Deployment | Render (single Docker container — frontend served as static files by the backend) |
| Containerization | Docker (multi-stage build), docker-compose for local dev |

---

## 3. High-Level Architecture

```
Browser (React SPA)
       │
       │  HTTP requests (Axios, same origin — /api/*)
       │
       ▼
Express Server (port 5000)
       │
       ├── Serves React's built static files for all non-API routes
       │
       ├── /api/auth        ── Passport.js OAuth
       ├── /api/tasks        ── Task CRUD + AI breakdown
       ├── /api/recurring-goals ── Recurring habits/goals
       ├── /api/chat         ── AI Companion
       ├── /api/insights     ── Analytics + LLM insights
       ├── /api/recommendations ── LLM-generated resources
       ├── /api/onboarding   ── First-run setup
       ├── /api/archive      ── Historical data
       ├── /api/profile      ── User settings
       └── /api/assistant    ── Freeform AI queries
               │
               ├── PostgreSQL (pg pool)
               │
               └── LLM API (Groq / Ollama / HuggingFace)
```

**Key architectural decision:** This is a monolith served from one container. The React app is built at Docker image build time and its static files (`frontend/build/`) are served by Express. There is no separate frontend server in production — the browser just hits `https://your-app.onrender.com`, gets the React HTML/JS, and then makes API calls back to the same domain at `/api/*`. This avoids CORS complexity in production.

---

## 4. Directory Structure

```
daily-dashboard-app/
│
├── backend/
│   ├── server.js                  # Express app entry point
│   ├── config/
│   │   ├── passport.js            # OAuth strategies (Google, GitHub)
│   │   └── logger.js              # Winston logging setup
│   ├── middleware/
│   │   └── metrics.js             # Prometheus metrics middleware
│   ├── routes/
│   │   ├── auth.js                # Login, logout, /me
│   │   ├── tasks-enhanced.js      # Main task management (CRUD, AI)
│   │   ├── tasks.js               # Legacy task routes (minimal)
│   │   ├── habits-enhanced.js     # Habit logging and streaks
│   │   ├── recurring-goals.js     # Recurring goals (schedule-based)
│   │   ├── chat.js                # AI Companion chatbot
│   │   ├── assistant.js           # Freeform AI Q&A
│   │   ├── insights.js            # Behavioral analytics + LLM insights
│   │   ├── recommendations.js     # Resource recommendations
│   │   ├── onboarding.js          # First-run onboarding flow
│   │   ├── archive.js             # Historical completions view
│   │   └── profile.js             # User profile and daily state
│   ├── services/
│   │   └── llmService.js          # All AI/LLM logic lives here
│   ├── database/
│   │   ├── setup-onboarding.sql   # Onboarding-related tables
│   │   ├── recurring-goals.sql    # recurring_goals + goal_completion_logs
│   │   ├── migration-complete.sql # chat_messages, daily_archives, enhancements
│   │   ├── merge-habits-goals.sql # Migrates habits → recurring_goals
│   │   └── setup-recommendations.sql # recommendations table
│   └── scripts/
│       ├── initDatabase.js        # Creates all tables on first run
│       └── migrate.js             # Runs SQL migration files
│
├── frontend/
│   └── src/
│       ├── App.js                 # Router setup
│       ├── pages/
│       │   ├── Login.js           # Login page
│       │   ├── Onboarding.js      # 4-step onboarding wizard
│       │   ├── Dashboard.js       # Main app shell (tabs + state)
│       │   └── Archive.js         # Archive calendar view
│       ├── components/
│       │   ├── TaskCard.js        # Individual task UI
│       │   ├── Chatbot.js         # AI Companion panel
│       │   ├── RecurringGoals.js  # Goals list + completion
│       │   ├── HabitTracker.js    # Habit logging UI
│       │   ├── InsightsView.js    # Analytics display
│       │   ├── RecommendationsView.js # Resource cards
│       │   ├── DailySummary.js    # Today's stats card
│       │   ├── Navbar.js          # Top navigation
│       │   └── PrivateRoute.js    # Auth guard wrapper
│       └── styles/                # One .css file per component/page
│
├── Dockerfile                     # Multi-stage: build React → run Node
├── docker-compose.yml             # Full local stack (DB + Ollama + monitoring)
├── render.yaml                    # Render deployment config
└── .env.example                   # All required env vars documented
```

---

## 5. Database Schema

### How the DB is initialized

On container startup, `backend/scripts/initDatabase.js` runs automatically (called from `server.js`). It creates all tables if they don't exist, using `CREATE TABLE IF NOT EXISTS` so it's safe to run repeatedly. The SQL migration files in `database/` were run manually during development to add columns/tables incrementally.

---

### Table: `users`

The core identity table. Created by Passport when a user first logs in via OAuth.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | `gen_random_uuid()` |
| `email` | VARCHAR(255) UNIQUE | From OAuth provider |
| `name` | VARCHAR(255) | Display name |
| `avatar_url` | TEXT | Profile picture URL from Google/GitHub |
| `google_id` | VARCHAR(255) | Google OAuth sub ID |
| `github_id` | VARCHAR(255) | GitHub OAuth user ID |
| `onboarding_completed` | BOOLEAN | Whether they've done onboarding |
| `onboarding_data` | JSONB | Raw onboarding payload (goals, prefs) |
| `last_login` | TIMESTAMP | Updated on every login |
| `created_at` | TIMESTAMP | Account creation time |

A user can have a Google ID, GitHub ID, or both — they're not mutually exclusive.

---

### Table: `user_profiles`

Extended preferences and settings, one row per user.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | `ON DELETE CASCADE` |
| `goals_text` | TEXT | Free-form goals from onboarding |
| `focus_areas` | TEXT[] | Array: ['health', 'career', ...] |
| `work_style` | VARCHAR(50) | e.g., 'deep-focus', 'balanced' |
| `morning_routine` | BOOLEAN | Preference flag |
| `evening_routine` | BOOLEAN | Preference flag |
| `exercise_days` | INTEGER | 0–7 days/week |
| `learning_minutes` | INTEGER | Target daily minutes |
| `sleep_hours` | FLOAT | Target sleep hours |
| `mindfulness` | BOOLEAN | Preference flag |
| `energy_pattern` | VARCHAR(50) | 'morning-person', 'night-owl', etc. |
| `preferred_work_hours` | JSONB | Work hour preferences |
| `notification_preferences` | JSONB | Notification settings |
| `daily_reset_time` | TIME | When daily reset triggers |
| `onboarding_step` | INTEGER | Tracks onboarding progress |
| `onboarding_data` | JSONB | Full onboarding payload copy |
| `created_at` / `updated_at` | TIMESTAMP | |

---

### Table: `tasks`

Every to-do item. Supports parent/subtask hierarchy through `parent_task_id`.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `parent_task_id` | UUID FK → tasks | NULL = top-level task |
| `title` | VARCHAR(500) | Task title |
| `description` | TEXT | Optional details |
| `status` | VARCHAR(50) | `'pending'`, `'in_progress'`, `'completed'` |
| `priority` | VARCHAR(50) | `'low'`, `'medium'`, `'high'` |
| `category` | VARCHAR(100) | e.g., 'health', 'career' |
| `energy_required` | VARCHAR(50) | 'low', 'medium', 'high' |
| `estimated_minutes` | INTEGER | Time estimate |
| `deadline` | TIMESTAMP | Optional due date |
| `recurring_goal_id` | UUID FK → recurring_goals | Set if generated from a goal |
| `completed_date` | DATE | Date it was marked complete |
| `deleted_at` | TIMESTAMP | Soft delete (NULL = not deleted) |
| `archived_at` | TIMESTAMP | Soft archive after daily reset |
| `created_at` / `updated_at` | TIMESTAMP | |

**Parent/subtask relationship:** A subtask has `parent_task_id` set to its parent's `id`. The GET /api/tasks endpoint fetches top-level tasks and joins their subtasks in a single query using a subquery alias `subtask_count` and a JSON aggregation.

**Indexes:**
- `idx_tasks_user_status` on `(user_id, status) WHERE deleted_at IS NULL` — the most common query pattern
- `idx_tasks_completed_date` on `(user_id, completed_date) WHERE completed_date IS NOT NULL`
- `idx_tasks_recurring_goal` on `(recurring_goal_id)`

---

### Table: `recurring_goals`

The unified table for habits and recurring commitments. The old `habits` table was migrated into this.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `title` | VARCHAR(255) | Goal name |
| `description` | TEXT | Optional |
| `category` | VARCHAR(100) | 'General', 'health', etc. |
| `frequency` | VARCHAR(50) | `'daily'`, `'weekly'`, `'specific_days'`, `'x_per_week'` |
| `times_per_week` | INTEGER | For `x_per_week` frequency |
| `specific_days` | TEXT[] | For `specific_days` frequency: ['Monday', 'Wednesday'] |
| `times_completed_this_week` | INTEGER | Resets each Monday |
| `week_start_date` | DATE | Tracks when week started |
| `last_generated_date` | DATE | Last time a task was auto-generated |
| `tasks_generated_today` | BOOLEAN | Prevents duplicate daily task gen |
| `preferred_time` | VARCHAR(50) | 'morning', 'evening', etc. |
| `duration_minutes` | INTEGER | Expected time to complete |
| `streak` | INTEGER | Current streak (days/weeks) |
| `best_streak` | INTEGER | All-time best streak |
| `last_completed_date` | DATE | Last date marked complete |
| `is_active` | BOOLEAN | FALSE = archived/deleted |
| `created_at` / `updated_at` | TIMESTAMP | |

---

### Table: `goal_completion_logs`

One row per (goal, date) completion. Replaces the old `habit_logs` table.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `goal_id` | UUID FK → recurring_goals | |
| `user_id` | UUID FK → users | |
| `date` | DATE | The date of completion |
| `completed` | BOOLEAN | Always TRUE in practice |
| `notes` | TEXT | Optional completion notes |
| `created_at` | TIMESTAMP | |

**Unique constraint:** `(goal_id, date)` — prevents logging the same goal twice on the same day.

---

### Table: `chat_messages`

Full chat history between the user and the AI Companion.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `role` | VARCHAR(20) | `'user'` or `'assistant'` |
| `content` | TEXT | The message text |
| `context` | JSONB | Optional context data attached to message |
| `created_at` | TIMESTAMP | |

When the AI is called, the route fetches the last 8 messages from this table to build the conversation history for the Groq API.

---

### Table: `recommendations`

Each row is one recommended resource from a generation batch.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `title` | VARCHAR(500) | Resource title |
| `description` | TEXT | What the user will learn |
| `resource_type` | VARCHAR(50) | `'video'`, `'article'`, `'paper'`, `'book'`, `'podcast'`, `'course'` |
| `search_query` | VARCHAR(500) | Pre-built query to find it on Google/YouTube |
| `author_or_source` | VARCHAR(255) | Author, channel, or publication |
| `relevance_reason` | TEXT | Why it matters for this user's specific goals |
| `reaction` | VARCHAR(20) | `'liked'`, `'disliked'`, or NULL |
| `added_to_tasks` | BOOLEAN | Whether user added it to their task list |
| `batch_id` | UUID | Groups all recs from one generation call |
| `created_at` / `updated_at` | TIMESTAMP | |

The GET endpoint finds the most recent `batch_id` via `ORDER BY created_at DESC LIMIT 1` and returns all rows with that batch_id. When you click Regenerate, a new batch is inserted — old ones stay in the DB (for the feedback loop) but aren't shown.

---

### Table: `daily_archives`

One row per (user, date) — a summary of what was accomplished that day.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `archive_date` | DATE | The day being summarized |
| `tasks_completed` | INTEGER | Count of tasks completed |
| `habits_completed` | INTEGER | Count of goals logged |
| `summary` | TEXT | Optional text summary |
| `praise` | TEXT | Encouraging message generated based on counts |
| `created_at` | TIMESTAMP | |

**Unique constraint:** `(user_id, archive_date)` — one summary per day.

---

### Table: `insights`

Saved AI-generated insights from daily/weekly reviews.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `content` | TEXT | The insight text |
| `insight_date` | DATE | The date the insight covers |
| `insight_type` | VARCHAR(50) | `'daily'` or `'weekly'` |
| `metrics` | JSONB | Quantitative data included with the insight |
| `created_at` | TIMESTAMP | |

---

### Table: `daily_states`

Tracks how the user felt each day — used for personalized AI context.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID PK | |
| `user_id` | UUID FK → users | |
| `date` | DATE | |
| `energy_level` | INTEGER | 1–5 |
| `pain_level` | INTEGER | 1–5 |
| `cycle_phase` | VARCHAR(50) | Menstrual cycle phase (optional) |
| `notes` | TEXT | |
| `created_at` | TIMESTAMP | |

---

### Table: `habits` (Legacy — migrated to `recurring_goals`)

The original habits table. Its data was migrated into `recurring_goals` via `merge-habits-goals.sql`. The old `habit_logs` table data was migrated into `goal_completion_logs`. These tables still exist but are no longer the source of truth — all queries now use `recurring_goals` and `goal_completion_logs`.

---

### Entity Relationships Summary

```
users
  ├── user_profiles (1:1)
  ├── tasks (1:many, self-referential for subtasks)
  ├── recurring_goals (1:many)
  │     └── goal_completion_logs (1:many per goal)
  ├── chat_messages (1:many)
  ├── recommendations (1:many, grouped by batch_id)
  ├── daily_archives (1:many, one per date)
  ├── insights (1:many)
  └── daily_states (1:many, one per date)
```

---

## 6. Backend — Server & Middleware

### `server.js`

The entry point. It:

1. Loads env vars via `dotenv`
2. Creates the Express `app`
3. Applies middleware in order:
   - `helmet()` — sets secure HTTP headers
   - `cors()` — allows the frontend origin (configured via `FRONTEND_URL` env var)
   - `express-rate-limit` — 100 requests per 15 minutes per IP
   - `express.json()` — parses JSON request bodies
   - `express-session` — server-side sessions (session data lives in memory, session ID in a cookie)
   - `passport.initialize()` + `passport.session()` — attaches `req.user` to authenticated requests
   - metrics middleware — records Prometheus metrics for every request
4. Registers all route files under `/api/*`
5. Calls `initDatabase()` to create tables if missing
6. In production, serves `frontend/build` as static files and catches all `*` routes with `index.html` (so React Router works)
7. Starts listening on `PORT` (default 5000)

### Authentication Guard

Every protected route uses this middleware (defined inline in most route files):

```js
const requireAuth = (req, res, next) => {
  if (!req.isAuthenticated()) return res.status(401).json({ error: 'Not authenticated' });
  next();
};
```

`req.isAuthenticated()` is provided by Passport — it checks if the session contains a valid deserialized user.

### Database Connection

A `pg.Pool` is created in each route file (or a shared module) using `DATABASE_URL` from env. Queries use parameterized statements (`$1`, `$2`, ...) throughout — no string interpolation, no SQL injection risk.

---

## 7. Authentication

### Flow — Google OAuth

```
1. User clicks "Login with Google"
   → GET /api/auth/google
   → Passport redirects to accounts.google.com

2. User approves
   → Google redirects to GET /api/auth/google/callback

3. Passport receives the OAuth code, exchanges it for tokens,
   gets the user's profile (name, email, avatar, google_id)

4. Passport's verify callback runs:
   - Checks if user with this google_id already exists in DB
   - If yes: returns existing user, updates last_login
   - If no: INSERT new row into users table

5. Passport serializes user.id into the session
   (session stored server-side, session ID in HTTP-only cookie)

6. Redirect to:
   - /onboarding  → if onboarding_completed = false
   - /dashboard   → otherwise
```

### Session Lifecycle

- Session created on login, destroyed on `POST /api/auth/logout`
- `passport.serializeUser` saves just `user.id` to the session
- `passport.deserializeUser` runs on every request: `SELECT * FROM users WHERE id = $1`
- This means every authenticated request hits the DB once to re-hydrate `req.user`

### `GET /api/auth/me`

Returns the current user object from `req.user`. The frontend calls this on app load to check if a session exists (if it 401s, redirect to login).

---

## 8. Routes (API Endpoints)

### `/api/tasks` — `routes/tasks-enhanced.js`

This is the main task management route. All endpoints require `requireAuth`.

**`GET /api/tasks`**

Fetches all active tasks for the user. The query:
- Filters `WHERE user_id = $1 AND status != 'completed' AND deleted_at IS NULL AND archived_at IS NULL`
- Joins subtask data using a subquery: counts subtasks and aggregates them as JSON
- Returns parent tasks each with a `subtasks` array attached

**`POST /api/tasks`**

Creates a new task. Accepts `title`, `description`, `priority`, `deadline`, `category`, `energy_required`, `estimated_minutes`, `parent_task_id`. Returns the created task.

**`PUT /api/tasks/:id`**

Updates any field of a task. Handles the status transition to `'completed'` specially — sets `completed_date = CURRENT_DATE`. This is the endpoint the TaskCard uses for both editing and checking off a task (via checkbox).

**`DELETE /api/tasks/:id`**

Soft delete: sets `deleted_at = NOW()`. The task is never actually removed from the DB.

**`POST /api/tasks/:id/breakdown`**

Manually creates subtasks. Accepts `{ subtasks: ['title1', 'title2', ...] }`. Inserts each as a row with `parent_task_id = id`.

**`POST /api/tasks/:id/ai-breakdown`**

Calls `llmService.breakdownTask(title)` to generate 3–5 subtask titles, then inserts them the same way as manual breakdown. Returns the created subtasks.

**`POST /api/tasks/generate-and-save`**

Calls `llmService.generateDailyTasks(context)` where context includes:
- User's goals, focus areas, work style from `user_profiles`
- Their active recurring goals
- Tasks already completed recently (to avoid repeating)
- Today's date and day of week

The LLM returns 5–7 task titles with priorities/categories, and they're bulk-inserted into `tasks`.

**`POST /api/tasks/archive-daily`**

Marks all completed tasks as archived: `SET archived_at = NOW() WHERE status = 'completed'`. Also creates/updates a row in `daily_archives` with counts of completed tasks.

---

### `/api/recurring-goals` — `routes/recurring-goals.js`

**`GET /api/recurring-goals`**

Returns all active goals (`is_active = true`) with today's completion status joined from `goal_completion_logs`.

**`POST /api/recurring-goals/:id/complete`**

Inserts a row into `goal_completion_logs` with today's date. Updates the goal's `last_completed_date` and increments `times_completed_this_week`. Also recalculates the streak by counting consecutive days/weeks.

**`POST /api/recurring-goals/generate-daily-tasks`**

Looks at each active goal and checks if a task should be generated for it today:
- `daily` goals: generate every day
- `specific_days` goals: generate only if today is in `specific_days`
- `x_per_week` goals: generate if `times_completed_this_week < times_per_week` and it's been distributed sensibly across the week

For each qualifying goal, creates a task with `recurring_goal_id` set, linking the task back to the goal.

---

### `/api/chat` — `routes/chat.js`

The AI Companion. Every message goes through a **command parser first** — if it matches a command pattern, it executes the action directly (no LLM call). Otherwise it calls the Groq API.

**Command patterns parsed:**
```
"add task: buy groceries"          → inserts task
"delete task: buy groceries"       → soft deletes matching task
"mark done: buy groceries"         → marks task completed
"clear completed tasks"            → archives all completed tasks
"breakdown: write the report"      → calls AI breakdown endpoint
"add goal: run 3x a week"          → creates recurring_goal (daily/x_per_week parsed from text)
"goal: meditate on Monday, Wednesday"  → creates specific_days goal
"my goals" / "show goals"          → returns list of goals
"remove goal: meditate"            → deletes matching goal
"generate today's tasks"           → triggers task generation
```

If no command matches, **`POST /api/chat/message`**:
1. Saves the user message to `chat_messages`
2. Fetches the last 8 messages from `chat_messages` for this user (conversation history)
3. Fetches context: pending tasks, active goals, user profile
4. Calls Groq API (`llama-3.1-8b-instant` model) with:
   - System prompt (warm companion persona, NOT a productivity tool)
   - Recent message history as the `messages` array
   - User's current context embedded in the system prompt
5. Saves the AI response to `chat_messages`
6. Returns `{ response: "..." }`

**`GET /api/chat/history`**

Returns the last 50 messages for this user, ordered oldest-first (so the UI renders them in chronological order).

---

### `/api/recommendations` — `routes/recommendations.js`

**`GET /api/recommendations`**

Finds the most recent `batch_id` from this user's recommendations, returns all rows with that batch_id. If none exist, returns an empty array (frontend shows the "Generate" empty state).

**`POST /api/recommendations/generate`**

This is the main generation endpoint. It:
1. Fetches user context from `user_profiles` (goals, focus areas, work style)
2. Fetches active `recurring_goals`
3. Fetches recent pending `tasks`
4. Fetches past reactions (liked/disliked) from the `recommendations` table — this is the **feedback loop**
5. Calls `llmService.generateRecommendations(context)` — see Section 9
6. Generates a new `batch_id` (UUID)
7. Bulk-inserts the 5 returned recommendations with that batch_id
8. Returns the new batch

**`POST /api/recommendations/:id/react`**

Accepts `{ reaction: 'liked' | 'disliked' | null }`. If the same reaction is sent again (e.g., clicking "liked" when already liked), it toggles to null (unlike). Updates the `reaction` column.

**`POST /api/recommendations/:id/add-to-tasks`**

Creates a task from the recommendation:
```
title: recommendation.title
description: recommendation.description + "\n\nFind it: " + recommendation.search_query
```
Marks `added_to_tasks = true` on the recommendation row.

---

### `/api/insights` — `routes/insights.js`

**`GET /api/insights/behavioral`**

Runs 4 analytics queries, all in parallel:

1. **Productivity trends** — counts tasks completed per day over the last `N` days, computes a trend direction by comparing first half vs second half
2. **Time-of-day patterns** — groups task completions by hour, finds peak hour
3. **Procrastination analysis** — calculates average hours between task creation and completion, percentage of tasks completed >24h after creation
4. **Habit consistency** — queries `recurring_goals` joined with `goal_completion_logs`, returns each goal's streak and log count over the period

All queries filter by `user_id` and use the `recurring_goals`/`goal_completion_logs` tables (not the old `habits`/`habit_logs`).

**`POST /api/insights/daily-review`** and **`POST /api/insights/weekly-review`**

Fetches the same behavioral metrics, then calls `llmService.generateInsight(type, metrics, userProfile)` which produces an empathetic, personalized text insight. Saves it to the `insights` table.

---

### `/api/onboarding` — `routes/onboarding.js`

**`GET /api/onboarding/status`**

Returns `{ needsOnboarding: true/false }` based on `users.onboarding_completed`.

**`POST /api/onboarding/preview`**

Takes the onboarding form data (goals text, focus areas, preferences) and calls the LLM to generate preview tasks and habits — but doesn't save anything. Used in Step 4 of the wizard so the user can see what they'll get before confirming.

**`POST /api/onboarding/complete`**

The full save:
1. Updates `users.onboarding_completed = true` and saves `onboarding_data`
2. Upserts `user_profiles` with all preferences
3. Calls `llmService.generateOnboardingTasks()` — generates 5–7 starter tasks
4. Calls `llmService.generateOnboardingHabits()` — generates 3–5 starter recurring goals
5. Bulk-inserts tasks and recurring_goals
6. Returns success

If the LLM fails at any point, fallback tasks/habits are generated from keyword matching on the goals text.

---

### `/api/profile` — `routes/profile.js`

**`GET /api/profile`** — Returns `user_profiles` row for the current user.

**`PUT /api/profile`** — Updates any fields in `user_profiles`.

**`POST /api/profile/state`** — Creates/upserts a row in `daily_states` for today. Used for tracking energy, pain, cycle phase.

**`GET /api/profile/state-history`** — Returns last 30 days of `daily_states`.

**`DELETE /api/profile/goals`** — Nuclear reset: deletes all tasks, recurring_goals, chat_messages, recommendations for this user. Sets `onboarding_completed = false`.

---

### `/api/archive` — `routes/archive.js`

**`GET /api/archive/date/:date`**

For a given date (`YYYY-MM-DD`):
- Fetches completed tasks: `WHERE user_id = $1 AND completed_date = $2`
- Fetches completed goals: joins `recurring_goals` + `goal_completion_logs` WHERE `date = $2`

**`GET /api/archive/calendar`**

Returns a list of dates where the user completed at least one thing — used to render the calendar highlights in the Archive page.

---

## 9. AI / LLM Service

Everything AI lives in `backend/services/llmService.js`. It's a class with methods for each AI operation. The backend never calls the LLM API directly — it always goes through this service.

### Providers

| Provider | Used For | Config |
|----------|----------|--------|
| Groq | Onboarding, recommendations, chat, insights | `GROQ_API_KEY`, `LLM_PROVIDER=groq` |
| Ollama | Local dev fallback | `OLLAMA_URL`, `LLM_MODEL` |
| Hugging Face | Secondary fallback | `HUGGINGFACE_API_KEY` |

The provider is selected by `LLM_PROVIDER` env var. For onboarding specifically, `ONBOARDING_LLM_PROVIDER` can override it (so you can use a more powerful model just for onboarding).

### `generateCompletion(prompt, options)`

The base method. Takes a prompt string, returns `{ success: bool, text: string }`. Internally routes to the configured provider's API. All other methods call this.

### `generateOnboardingCompletion(prompt, options)`

Same as above but with a higher token limit (2048 vs 1024) — onboarding and recommendations prompts are longer and need more output.

### `extractJSON(text)`

A smart parser that handles the LLM returning JSON wrapped in markdown code blocks (` ```json ... ``` `), plain JSON, or JSON embedded in prose. Tries multiple extraction strategies before throwing.

---

### Key LLM Methods

**`generateOnboardingTasks(userContext)`**

Prompt gives the LLM: goals text, focus areas, work style, daily routine preferences, specific metrics (exercise days, learning minutes).

Asks for 5–7 tasks. Each task has: title, description, priority, category, energy_required, estimated_minutes.

Example output for "I want to get fitter and learn programming":
```json
[
  { "title": "30 min run", "priority": "high", "category": "health", "energy_required": "high" },
  { "title": "Complete LeetCode problem", "priority": "medium", "category": "career", "energy_required": "medium" }
]
```

---

**`generateOnboardingHabits(userContext)`**

Asks for 3–5 recurring goals. Returns: title, frequency (`daily`/`x_per_week`/`specific_days`), times_per_week, specific_days array, preferred_time, duration_minutes, category.

---

**`breakdownTask(title, context)`**

Given a task title, returns 3–5 subtask titles that together constitute completing the parent task.

---

**`generateDailyTasks(context)`**

More context-rich than onboarding tasks. Context includes: user profile, recurring goals, recently completed tasks (to avoid repeats), current date/day. Returns 5–7 tasks tailored to today.

---

**`generateRecommendations(context)`**

See the prompt in detail below. Context: goals text, focus areas, work style, active recurring goals, current tasks, past liked/disliked recommendations.

**The prompt logic:**
- Establishes the LLM as a "knowledgeable mentor and curator"
- Feeds all user context
- Feeds the feedback loop: liked resources → recommend more like these, disliked → avoid
- **Critical instruction:** match the resource FORMAT to what the goal actually NEEDS:
  - "Stay current" goals → papers, newsletters, researcher blogs, conference talks
  - "Learn/master a skill" goals → courses, practice sheets, problem sets, textbooks
  - "Build something" goals → project walkthroughs, case studies, repos
  - "Understand deeply" goals → foundational papers, lecture series, long-form explainers
  - "Habits/mindset" goals → books, podcasts, essays from practitioners
- Asks for exactly 5 recommendations as a JSON array
- Each has: title, description, resource_type, search_query, author_or_source, relevance_reason

The `search_query` field is what the frontend turns into a clickable link: YouTube search for videos, Google Scholar for papers, Google for everything else.

---

**`generateInsight(type, metrics, profile)`**

Takes raw analytics data (task counts, streak averages, procrastination percentages) and generates a 2–3 paragraph insight that:
- Acknowledges specific patterns (e.g., "You tend to complete tasks in the evening")
- Frames things empathetically, not judgmentally
- Offers one or two actionable suggestions

---

## 10. Frontend — Pages & Components

### State Management

There is **no Redux or global state library**. State lives in React component state (`useState`). The Dashboard component holds most of the top-level state and passes down props + callbacks.

The pattern throughout is:
1. Component mounts → `useEffect` fires → Axios GET → `setState`
2. User action → Axios POST/PUT/DELETE → on success → refetch or update state locally
3. For optimistic UI (like reactions): update state immediately, call API in background

---

### `App.js`

Sets up React Router. Routes:

| Path | Component | Notes |
|------|-----------|-------|
| `/` | Redirect to `/login` | |
| `/login` | `Login` | No auth required |
| `/onboarding` | `Onboarding` | Wrapped in `PrivateRoute` |
| `/dashboard` | `Dashboard` | Wrapped in `PrivateRoute` |
| `/archive` | `Archive` | Wrapped in `PrivateRoute` |

`PrivateRoute` calls `GET /api/auth/me` — if it 401s, redirects to `/login`.

---

### `pages/Login.js`

A single-page marketing/login screen. No form submission — just an anchor tag pointing to `/api/auth/google`. The backend handles the full OAuth redirect from there.

---

### `pages/Onboarding.js`

A 4-step wizard with a progress bar. Local state tracks the current step and all form data. Nothing is sent to the backend until Step 4.

- **Step 1:** Name + free-form goals text
- **Step 2:** Focus area multi-select (health, career, productivity, relationships, creativity, finance, mindfulness)
- **Step 3:** Preferences (morning/evening routine, exercise frequency, learning minutes, sleep hours, mindfulness toggle, work style)
- **Step 4:** Preview — calls `POST /api/onboarding/preview` to show AI-generated tasks and habits before the user confirms. If they like it, `POST /api/onboarding/complete` is called, then redirect to `/dashboard`.

---

### `pages/Dashboard.js`

The main shell. Manages which "view" is active via `activeView` state. Views are:

| `activeView` value | What renders |
|---------------------|-------------|
| `'tasks'` | Task list + TaskCard components |
| `'habits'` | `RecurringGoals` component |
| `'insights'` | `InsightsView` component |
| `'recommendations'` | `RecommendationsView` component |
| `'archive'` | Quick archive summary (full archive is its own page) |

The Chatbot (`Chatbot` component) is an overlay panel, toggled by a button — it's always mounted once open, separate from the tab system.

Dashboard also:
- Fetches tasks on mount and after any task mutation
- Handles the task creation form (title input + submit)
- Handles the "Generate AI Tasks" button → `POST /api/tasks/generate-and-save`
- Passes down callbacks to TaskCard (`onUpdate`, `onDelete`, `onComplete`)

---

### `components/TaskCard.js`

Renders one task. Key behavior:

- Completion checkbox → calls `PUT /api/tasks/:id` with `{ status: 'completed' }`
- "Break down" button (manual) → shows an input form, submits to `POST /api/tasks/:id/breakdown`
- "AI Break" button → calls `POST /api/tasks/:id/ai-breakdown`
- Subtasks expand/collapse toggle
- Each subtask has its own checkbox → `PUT /api/tasks/:id` on the subtask

**The subtask sync problem (fixed):**
`useState(task.subtasks || [])` only initializes from props once. After the parent refetches tasks and passes new `task.subtasks`, the local state doesn't update. Fixed with:
```js
useEffect(() => {
  setSubtasks(task.subtasks || []);
  if (task.subtasks?.length > 0) setShowSubtasks(true);
}, [task.subtasks]);
```
This runs whenever the `subtasks` prop changes, keeping the card in sync without requiring a page reload.

---

### `components/Chatbot.js`

An overlay panel (not a full page). The panel is positioned fixed over the dashboard.

**Message display:** Messages are rendered from state. Each message is either `role: 'user'` or `role: 'assistant'`. Newlines in content are split on `\n` and rendered with `<br />` tags.

**Auto-scroll:** Uses a ref on the messages container div and sets `scrollTop = scrollHeight` after every message update. (NOT `scrollIntoView()` — that would scroll the entire page.)

**History loading:** On mount, calls `GET /api/chat/history`. If history exists, shows it. If not, shows the welcome message.

**Send flow:**
1. User types + submits
2. User message added to state immediately (optimistic)
3. `POST /api/chat/message` called
4. Response added to state
5. Error → shows a "having trouble connecting" message in the chat (doesn't break the UI)

---

### `components/RecurringGoals.js`

Lists active recurring goals with completion state. For each goal:
- Shows title, frequency description, streak
- "Done today" button → `POST /api/recurring-goals/:id/complete`
- Disabled if `last_completed_date = today` (can't complete twice in one day)

---

### `components/InsightsView.js`

Fetches `GET /api/insights/behavioral` on mount. Displays:
- Productivity chart (tasks/day trend)
- Peak hour visualization
- Procrastination rate
- Habit streak averages

Has a "Generate Insight" button that calls `POST /api/insights/daily-review` and adds the LLM-generated text to the display.

---

### `components/RecommendationsView.js`

**Empty state:** Shows a large "Get My Recommendations" button if no recs exist.

**Cards:** Each recommendation shows:
- Resource type badge (icon + label: video/article/paper/etc.)
- Title + author
- Description + relevance reason
- "Find Resource" link → opens a search URL in a new tab:
  - Videos → `https://www.youtube.com/results?search_query=...`
  - Papers → `https://scholar.google.com/scholar?q=...`
  - Everything else → `https://www.google.com/search?q=...`
- Like/dislike buttons (toggle, optimistic UI)
- "Add to Tasks" button → `POST /api/recommendations/:id/add-to-tasks`, changes to "Added ✓"

**Footer:** "Regenerate" button → calls `POST /api/recommendations/generate`, replaces displayed cards.

---

### Design System

All components use a consistent warm color palette defined as CSS variables:

| Token | Color | Usage |
|-------|-------|-------|
| Terracotta | `#c17f5e` approx | Primary buttons, accents |
| Gold | `#d4a853` approx | Highlights, badges |
| Sage | `#7a9b76` approx | Success states, habits, liked cards |
| Cream | `#f5f0e8` approx | Backgrounds, card surfaces |
| Dark brown | `#3d2b1f` approx | Primary text |

No CSS framework (no Tailwind, no Bootstrap). All styles are hand-written per component.

---

## 11. Feature Data Flows

### Flow: User completes a task

```
1. User clicks checkbox on TaskCard
2. TaskCard calls PUT /api/tasks/:id { status: 'completed' }
3. Backend: UPDATE tasks SET status='completed', completed_date=CURRENT_DATE WHERE id=$1
4. Backend returns updated task
5. Dashboard receives callback, re-fetches task list
6. Completed task disappears from active list
   (GET /api/tasks filters WHERE status != 'completed')
```

---

### Flow: AI generates daily tasks

```
1. User clicks "Generate Tasks" in Dashboard
2. Dashboard calls POST /api/tasks/generate-and-save
3. Backend fetches from DB:
   - user_profiles (goals_text, focus_areas, work_style, preferences)
   - recurring_goals WHERE is_active=true
   - tasks WHERE completed_date > NOW() - 7 days (recent completions to avoid repeats)
4. Backend calls llmService.generateDailyTasks(context)
5. LLM returns JSON array of 5-7 tasks
6. Backend bulk-inserts tasks into tasks table
7. Returns { tasks: [...] }
8. Dashboard re-fetches task list
9. New tasks appear
```

---

### Flow: Recommendations with feedback

```
First generation:
1. User clicks "Get My Recommendations"
2. POST /api/recommendations/generate
3. Backend: no past reactions yet, pastFeedback = []
4. LLM generates 5 recs based on goals/focus areas alone
5. Recs inserted with batch_id=UUID1
6. Frontend shows 5 cards

User reacts:
7. User clicks 👍 on "Attention is All You Need"
8. POST /api/recommendations/:id/react { reaction: 'liked' }
9. DB: UPDATE recommendations SET reaction='liked' WHERE id=...

User clicks Regenerate:
10. POST /api/recommendations/generate
11. Backend: fetches pastFeedback = [{ title: "Attention is All You Need", reaction: 'liked', resource_type: 'paper' }]
12. LLM prompt includes:
    "Resources they LIKED: - "Attention is All You Need" (paper)"
    "Since they liked certain resources, lean into that style and topic depth."
13. LLM generates 5 new recs, biased toward papers/research
14. Recs inserted with batch_id=UUID2
15. Frontend GET fetches latest batch (UUID2), shows new cards
```

---

### Flow: Chat command execution

```
1. User types "add goal: meditate every morning"
2. POST /api/chat/message { message: "add goal: meditate every morning" }
3. Backend command parser: matches "add goal:" pattern
4. Parser detects "every morning" → preferred_time: 'morning', frequency: 'daily'
5. INSERT INTO recurring_goals (user_id, title, frequency, preferred_time, ...)
6. Returns { response: "Done! I've added 'Meditate every morning' as a daily goal. 🌱" }
7. No LLM call made — command executed directly
8. Response shown in chat
```

---

### Flow: Archive daily

```
(Happens when user clicks "Reset Day" or manually triggers archive)

1. POST /api/tasks/archive-daily
2. Backend:
   a. Counts completed tasks for today: SELECT COUNT(*) WHERE status='completed' AND completed_date=TODAY
   b. Counts completed goals: SELECT COUNT(*) FROM goal_completion_logs WHERE date=TODAY
   c. Generates praise text based on counts (e.g., "Fantastic day! 5 tasks, 3 habits!")
   d. UPDATE tasks SET archived_at=NOW() WHERE status='completed'
   e. UPSERT INTO daily_archives (user_id, archive_date, tasks_completed, habits_completed, praise)
3. Returns summary
4. User can later visit Archive and see this day's summary
```

---

## 12. Deployment

### Production: Render

Single container deployment. The Dockerfile is a multi-stage build:

**Stage 1 (builder):** Node 18 Alpine. Copies `frontend/`, runs `npm install` + `npm run build`. Output: `frontend/build/` with compiled static files.

**Stage 2 (runtime):** Node 18 Alpine. Copies the backend code + the `frontend/build/` from stage 1. Runs as a non-root user (`nodejs`, UID 1001).

On container start:
1. Runs `node scripts/migrate.js` — executes any pending SQL migrations
2. Runs `node server.js` — starts Express, which calls `initDatabase()` then starts listening

Express serves the React static files from `frontend/build/` and handles all API routes. No nginx needed.

**render.yaml** defines:
- Service name, Docker build, region (Oregon), plan (free)
- Health check path: `/health` (returns `{ status: 'ok' }`)
- All env vars (OAuth keys, Groq key, session secret, DB URL)
- A managed PostgreSQL database (free tier, same region)

### Local Development: Docker Compose

`docker-compose.yml` runs:
- PostgreSQL 15 (port 5432)
- Ollama (port 11434) — for local LLM inference without API keys
- Backend (port 5000) with hot reload
- Frontend dev server (port 3000) with hot reload + proxy to backend
- Prometheus (port 9090), Grafana (port 3001), Node Exporter, PG Exporter

The frontend dev server proxies `/api/*` to `http://backend:5000` via the `proxy` field in `frontend/package.json`.

---

## 13. Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | No | Express port (default 5000) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Signs session cookies — must be random and secret |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth app ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth secret |
| `GITHUB_CLIENT_ID` | No | GitHub OAuth (optional auth method) |
| `GITHUB_CLIENT_SECRET` | No | GitHub OAuth secret |
| `GROQ_API_KEY` | Yes (prod) | Groq API for LLM calls |
| `LLM_PROVIDER` | No | `groq`, `ollama`, or `huggingface` (default: groq) |
| `ONBOARDING_LLM_PROVIDER` | No | Override provider for onboarding specifically |
| `OLLAMA_URL` | No | Ollama server URL (default: http://ollama:11434) |
| `LLM_MODEL` | No | Model name for Ollama (default: llama3) |
| `ENABLE_FALLBACK` | No | Fall back to keyword logic if LLM fails (default: true) |
| `FRONTEND_URL` | No | Frontend URL for CORS (default: http://localhost:3000) |
| `BACKEND_URL` | No | Backend URL for OAuth callbacks |

---

## 14. Monitoring & Logging

### Winston Logging (`config/logger.js`)

Logs are written to:
- `backend/logs/error.log` — errors only, daily rotation
- `backend/logs/combined.log` — all levels, daily rotation
- Console — colored, human-readable output

Log levels: `error` → `warn` → `info` → `http` → `debug`

The logger has helper methods for specific events:
- `logger.logRequest(req, res, duration)` — HTTP request log
- `logger.logLLM(operation, model, duration, success)` — LLM call log
- `logger.logDB(query, duration)` — DB query log

### Prometheus Metrics (`middleware/metrics.js`)

The metrics middleware runs on every request and records:

| Metric | Type | Labels |
|--------|------|--------|
| `http_request_duration_seconds` | Histogram | method, route, status |
| `http_requests_total` | Counter | method, route, status |
| `llm_request_duration_seconds` | Histogram | model, operation |
| `tasks_created_total` | Counter | |
| `tasks_completed_total` | Counter | |
| `habits_logged_total` | Counter | |
| `active_users_total` | Gauge | |
| `db_pool_total` / `db_pool_idle` | Gauge | |

Metrics are exposed at `GET /metrics` in Prometheus text format. Grafana is configured to scrape this endpoint and render dashboards.

---

*This document reflects the state of the codebase as of the last deployment (commit 92f04bc, February 2026).*
