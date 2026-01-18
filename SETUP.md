# Daily Dashboard - LLM-Powered Adaptive Productivity App

## Setup Instructions for Testing

### Prerequisites

Before you begin, ensure you have the following installed:

1. **Docker Desktop** (version 20.10+)
   - Download from: https://www.docker.com/products/docker-desktop
   - Ensure Docker Compose is included (comes with Docker Desktop)

2. **Git** (for cloning if needed)
   - Download from: https://git-scm.com/downloads

3. **System Requirements**:
   - Minimum 8GB RAM (16GB recommended for Ollama LLM)
   - 10GB free disk space
   - Stable internet connection for initial setup

---

## Quick Start (Docker - Recommended)

### Step 1: Navigate to Project Directory

```bash
cd daily-dashboard-app
```

### Step 2: Configure Environment Variables

1. Copy the backend environment template:
```bash
cp backend/.env.example backend/.env
```

2. (Optional) Edit `backend/.env` to configure OAuth:
   - For Google OAuth: Add your `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`
   - For GitHub OAuth: Add your `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`
   - If you skip this, you can still test with one OAuth provider by setting up just one

**Getting OAuth Credentials:**

**Google OAuth:**
1. Go to https://console.cloud.google.com/
2. Create a new project or select existing
3. Enable "Google+ API"
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Add authorized redirect URI: `http://localhost:5000/api/auth/google/callback`
6. Copy Client ID and Client Secret to `.env`

**GitHub OAuth:**
1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Add authorization callback URL: `http://localhost:5000/api/auth/github/callback`
4. Copy Client ID and Client Secret to `.env`

### Step 3: Start the Application

```bash
docker-compose up -d
```

This will:
- Start PostgreSQL database
- Start Ollama LLM service
- Build and start the backend API
- Build and start the frontend React app

**Note:** First startup may take 10-15 minutes as it downloads Docker images and builds containers.

### Step 4: Download LLM Model (Required)

Once containers are running, download the LLaMA 3 model:

```bash
docker exec -it daily-dashboard-ollama ollama pull llama3
```

This may take 10-20 minutes depending on your internet speed (model is ~4GB).

To verify the model is downloaded:
```bash
docker exec -it daily-dashboard-ollama ollama list
```

### Step 5: Initialize Database

```bash
docker exec -it daily-dashboard-backend npm run init-db
```

You should see output confirming all tables and indexes were created.

### Step 6: Access the Application

Open your browser and navigate to:
- **Frontend**: http://localhost:3000
- **Backend API**: http://localhost:5000
- **Health Check**: http://localhost:5000/health

---

## Testing the Application

### 1. Authentication Flow

1. Click "Continue with Google" or "Continue with GitHub"
2. Authenticate with your provider
3. You'll be redirected to the onboarding page (first-time users)

### 2. Onboarding Flow

Complete the onboarding steps:
- **Step 1**: Enter short-term and long-term goals
  - Example: "Learn machine learning", "Get healthier"
- **Step 2**: Set lifestyle preferences
  - Work hours, preferred task length, energy patterns
- **Step 3**: Optional state tracking (energy, pain, hormonal cycle)
- **Step 4**: Notification preferences

### 3. Main Dashboard Testing

Once onboarded, test these features:

#### Task Management
- **Create Manual Task**: Click "Add Task" button
- **AI Task Generation**: Click "Generate Tasks" and provide context
- **Task Breakdown**: Right-click a task and select "Break Down"
- **Priority Explanation**: Click "Why is this prioritized?" on any task
- **Complete/Skip Tasks**: Mark tasks as done or skip them

#### Habit Tracking
- **Habit Detection**: Complete the same task 3+ days in a row
- **View Suggestions**: Check "Habits" tab for AI-detected patterns
- **Accept/Decline**: Respond to habit suggestions
- **Manual Habit Creation**: Add a habit manually
- **Log Habit**: Mark daily completion

#### Daily State
- **Log Energy**: Click "Log Today's State"
- **Set Energy Level**: Rate 1-5
- **Add Pain Level**: If tracking pain (0-10)
- **View History**: See past state logs

#### AI Assistant
- **Ask Questions**: Click assistant button, ask about tasks or priorities
- **Natural Language**: Try "Add a task to read research papers"
- **Get Explanations**: Ask "Why was this task suggested?"

#### Insights & Reviews
- **Daily Review**: Available each evening
- **Weekly Review**: Generated every 7 days
- **View Patterns**: Check behavioral insights

---

## Monitoring & Logs

### View Container Logs

**All services:**
```bash
docker-compose logs -f
```

**Specific service:**
```bash
docker-compose logs -f backend
docker-compose logs -f frontend
docker-compose logs -f ollama
```

### Check Service Status

```bash
docker-compose ps
```

All services should show "Up" status.

### Database Connection

To connect to PostgreSQL:
```bash
docker exec -it daily-dashboard-db psql -U postgres -d daily_dashboard
```

Common queries:
```sql
-- View users
SELECT * FROM users;

-- View tasks
SELECT * FROM tasks;

-- View habits
SELECT * FROM habits;
```

---

## Troubleshooting

### Issue: Containers won't start

**Solution:**
```bash
docker-compose down
docker-compose up -d --build
```

### Issue: Database connection error

**Check PostgreSQL is running:**
```bash
docker-compose ps postgres
```

**Restart PostgreSQL:**
```bash
docker-compose restart postgres
```

### Issue: Ollama/LLM not responding

**Check Ollama status:**
```bash
docker exec -it daily-dashboard-ollama ollama list
```

**If model is missing:**
```bash
docker exec -it daily-dashboard-ollama ollama pull llama3
```

**Restart Ollama:**
```bash
docker-compose restart ollama
```

### Issue: Frontend shows "Cannot connect to backend"

**Check backend is running:**
```bash
curl http://localhost:5000/health
```

**Check backend logs:**
```bash
docker-compose logs backend
```

### Issue: OAuth authentication fails

1. Verify OAuth credentials in `backend/.env`
2. Ensure redirect URIs match exactly in OAuth provider settings
3. Restart backend after changing `.env`:
```bash
docker-compose restart backend
```

### Issue: Slow LLM responses

- LLaMA 3 requires significant resources
- On slower machines, responses may take 5-10 seconds
- Consider using smaller models: `docker exec -it daily-dashboard-ollama ollama pull phi`
- Update `backend/.env`: `LLM_MODEL=phi`

---

## Stopping the Application

### Stop all services:
```bash
docker-compose down
```

### Stop and remove volumes (⚠️ deletes all data):
```bash
docker-compose down -v
```

### Stop specific service:
```bash
docker-compose stop backend
```

---

## Development Mode (Without Docker)

If you prefer running services locally:

### Prerequisites
- Node.js 18+
- PostgreSQL 15+
- Ollama (https://ollama.ai/)

### Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your local database URL
npm run init-db
npm run dev
```

### Frontend Setup

```bash
cd frontend
npm install
npm start
```

### Ollama Setup

```bash
# Install Ollama from https://ollama.ai/
ollama serve
ollama pull llama3
```

---

## Testing Checklist

- [ ] OAuth login works (Google or GitHub)
- [ ] Onboarding flow completes successfully
- [ ] Manual task creation works
- [ ] AI task generation produces relevant suggestions
- [ ] Task breakdown creates subtasks
- [ ] Priority explanation shows factors
- [ ] Tasks can be completed/skipped
- [ ] Habit detection identifies patterns
- [ ] Habit suggestions can be accepted/declined
- [ ] Daily state logging saves energy levels
- [ ] AI assistant answers questions
- [ ] Daily review generates insights
- [ ] Weekly review shows behavioral patterns

---

## API Endpoints (For Testing)

### Authentication
- `GET /api/auth/google` - Google OAuth
- `GET /api/auth/github` - GitHub OAuth
- `GET /api/auth/me` - Get current user
- `POST /api/auth/logout` - Logout

### Tasks
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `POST /api/tasks/generate` - AI task generation
- `POST /api/tasks/:id/breakdown` - Break down task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `GET /api/tasks/:id/priority-explanation` - Get priority factors

### Habits
- `GET /api/habits` - List habits
- `POST /api/habits/detect` - Detect habit patterns
- `POST /api/habits/:id/log` - Log habit completion
- `GET /api/habits/:id/streak` - Get streak info

### Profile
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update profile
- `POST /api/profile/state` - Log daily state
- `GET /api/profile/state-history` - Get state history

### Insights
- `GET /api/insights` - List insights
- `POST /api/insights/daily-review` - Generate daily review
- `POST /api/insights/weekly-review` - Generate weekly review

### Assistant
- `POST /api/assistant/query` - Ask AI assistant
- `GET /api/assistant/health` - Check LLM status

---

## Production Deployment Notes

For production deployment:

1. **Environment Variables:**
   - Generate strong `SESSION_SECRET`
   - Use production database credentials
   - Configure proper OAuth redirect URLs

2. **Database:**
   - Use managed PostgreSQL (AWS RDS, Google Cloud SQL, etc.)
   - Enable SSL connections
   - Set up automated backups

3. **LLM Service:**
   - Consider using API-based LLMs for scalability
   - Implement request queuing for high load
   - Cache common responses

4. **Security:**
   - Enable HTTPS
   - Implement rate limiting
   - Add CSRF protection
   - Sanitize all user inputs

5. **Monitoring:**
   - Set up error tracking (Sentry)
   - Monitor API response times
   - Track LLM performance
   - Database query optimization

---

## Support & Resources

- **Documentation**: See `/docs` folder for detailed guides
- **API Reference**: See backend route files
- **LLM Integration**: See `backend/services/llmService.js`
- **Database Schema**: See `backend/scripts/initDatabase.js`

---

## License

This project is open-source and free to use for personal and commercial purposes.

---

## Next Steps

After testing locally, you can:

1. **Customize the Design**: Edit CSS files in `frontend/src`
2. **Add Features**: Extend routes and components
3. **Integrate Calendar**: Add calendar sync
4. **Mobile App**: Use React Native with same backend
5. **Advanced Analytics**: Add data visualization
6. **Multi-language**: Add i18n support

---

**Enjoy your adaptive productivity dashboard!** 🚀
