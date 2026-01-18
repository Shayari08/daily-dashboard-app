# Daily Dashboard - LLM-Powered Adaptive Productivity Application

![Version](https://img.shields.io/badge/version-1.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)
![Node](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen)
![Docker](https://img.shields.io/badge/docker-ready-blue)

## 📋 Overview

Daily Dashboard is an **LLM-powered adaptive productivity web application** that helps users manage tasks, build habits, and optimize their daily workflow. Unlike traditional to-do apps, it:

- ✨ **Dynamically generates tasks** using AI based on your goals
- 🧠 **Learns from your behavior** without removing control
- 🔄 **Adapts to your energy levels** and life circumstances
- 📊 **Provides transparent explanations** for all decisions
- 🎯 **Detects habits automatically** from your patterns
- 💬 **Conversational AI assistant** for task management

Built with **React**, **Node.js**, **PostgreSQL**, and **LLaMA 3** (via Ollama).

---

## 🎯 Key Features

### 1. **AI Task Generation**
- Generate actionable tasks from high-level goals
- Get personalized suggestions based on your context
- Receive explanations for why each task was suggested

### 2. **Intelligent Task Breakdown**
- Automatically break down large tasks into manageable subtasks
- Adapt task size to your preferences and energy levels
- Transparent reasoning for each breakdown

### 3. **Adaptive Priority System**
- Dynamic priority calculation based on:
  - Urgency (deadlines)
  - Energy requirements
  - Historical completion patterns
  - Current user state
- View detailed priority explanations on demand

### 4. **Habit Detection & Tracking**
- Automatic pattern detection from repeated behaviors
- Opt-in habit suggestions with supporting evidence
- Streak tracking without pressure
- Flexible frequency options (daily, weekly, custom)

### 5. **Behavior-Aware Adaptation**
- Log daily energy, pain levels, and cycle phases (all optional)
- System adapts suggestions without making assumptions
- No tasks removed on low-energy days—only reordered

### 6. **Reviews & Insights**
- Daily and weekly behavioral summaries
- Pattern analysis with confidence levels
- Gentle, supportive suggestions
- Complete transparency in observations

### 7. **Conversational AI Assistant**
- Ask questions about your tasks and priorities
- Request task suggestions via natural language
- Get explanations for system decisions
- Context-aware responses

---

## 🏗️ Architecture

### Technology Stack

**Frontend:**
- React 18
- Framer Motion (animations)
- Axios (HTTP client)
- React Router v6
- Lucide React (icons)

**Backend:**
- Node.js 18+ / Express
- PostgreSQL 15
- Passport.js (OAuth authentication)
- Axios (LLM communication)

**AI/LLM:**
- Ollama (LLM runtime)
- LLaMA 3 (default model)
- Fallback support for API-based LLMs

**Infrastructure:**
- Docker & Docker Compose
- Multi-container orchestration
- Volume persistence

### System Design

```
┌─────────────────┐
│  React Frontend │
└────────┬────────┘
         │
    ┌────▼─────┐
    │   API    │
    │ Gateway  │
    └────┬─────┘
         │
    ┌────▼──────────────────────┐
    │   Express Backend API     │
    │                           │
    │  ┌──────────┐            │
    │  │  Auth    │            │
    │  │  Routes  │            │
    │  └──────────┘            │
    │                           │
    │  ┌──────────┐            │
    │  │  Task    │            │
    │  │ Service  │            │
    │  └──────────┘            │
    │                           │
    │  ┌──────────┐            │
    │  │   LLM    │            │
    │  │ Service  │            │
    │  └─────┬────┘            │
    └────────┼──────────────────┘
             │          │
      ┌──────▼───┐  ┌──▼────────┐
      │PostgreSQL│  │  Ollama   │
      │ Database │  │  (LLaMA)  │
      └──────────┘  └───────────┘
```

---

## 🚀 Quick Start

### Prerequisites

- **Docker Desktop** (v20.10+)
- **8GB RAM minimum** (16GB recommended)
- **10GB free disk space**
- **Git** (optional)

### Step 1: Clone or Download

```bash
# If you have git
git clone <repository-url>
cd daily-dashboard-app

# Or extract the provided ZIP file
unzip daily-dashboard-app.zip
cd daily-dashboard-app
```

### Step 2: Configure OAuth (Optional but Recommended)

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and add your OAuth credentials:

**For Google OAuth:**
1. Visit https://console.cloud.google.com/
2. Create project → Enable Google+ API
3. Create OAuth 2.0 credentials
4. Set redirect URI: `http://localhost:5000/api/auth/google/callback`
5. Add credentials to `.env`

**For GitHub OAuth:**
1. Visit https://github.com/settings/developers
2. Register new OAuth app
3. Set callback URL: `http://localhost:5000/api/auth/github/callback`
4. Add credentials to `.env`

### Step 3: Start Application

```bash
docker-compose up -d
```

**First startup takes 10-15 minutes** (downloading images, building containers).

### Step 4: Download LLM Model

```bash
docker exec -it daily-dashboard-ollama ollama pull llama3
```

This downloads the LLaMA 3 model (~4GB). Takes 10-20 minutes depending on connection.

### Step 5: Initialize Database

```bash
docker exec -it daily-dashboard-backend npm run init-db
```

### Step 6: Access Application

Open your browser and navigate to:
- **Application**: http://localhost:3000
- **API Health Check**: http://localhost:5000/health

---

## 📖 Detailed Setup Guide

For comprehensive setup instructions including:
- Development mode setup
- Troubleshooting common issues
- Production deployment guidelines
- API endpoint reference
- Testing checklist

**See:** [SETUP.md](./SETUP.md)

---

## 🎨 Design Philosophy

This application features a **distinctive cyberpunk-inspired aesthetic** with:

- **Typography**: Syne (display) + Space Mono (body)
- **Color Scheme**: Dark theme with electric green (#00ff88) and hot pink (#ff0066) accents
- **Animation**: Smooth transitions and micro-interactions via Framer Motion
- **Layout**: Brutalist grid-based design with bold borders
- **Accessibility**: High contrast, clear focus states, keyboard navigation

The design intentionally avoids generic "AI slop" aesthetics commonly seen in productivity apps.

---

## 📊 Database Schema

### Core Tables

- **users**: User accounts (OAuth)
- **user_profiles**: Goals, preferences, settings
- **tasks**: All tasks and subtasks
- **habits**: Detected and manual habits
- **habit_logs**: Daily habit completions
- **behavioral_logs**: Action tracking for ML
- **daily_states**: Energy, pain, cycle tracking
- **insights**: Generated reviews and patterns

For detailed schema, see `backend/scripts/initDatabase.js`

---

## 🔌 API Endpoints

### Authentication
- `GET /api/auth/google` - Google OAuth
- `GET /api/auth/github` - GitHub OAuth
- `GET /api/auth/me` - Current user
- `POST /api/auth/logout` - Logout

### Tasks
- `GET /api/tasks` - List tasks
- `POST /api/tasks` - Create task
- `POST /api/tasks/generate` - AI generation
- `POST /api/tasks/:id/breakdown` - Break down task
- `PUT /api/tasks/:id` - Update task
- `DELETE /api/tasks/:id` - Delete task
- `GET /api/tasks/:id/priority-explanation` - Priority factors

### Habits
- `GET /api/habits` - List habits
- `POST /api/habits/detect` - Detect patterns
- `POST /api/habits/:id/log` - Log completion
- `GET /api/habits/:id/streak` - Streak info

### Profile
- `GET /api/profile` - Get profile
- `PUT /api/profile` - Update profile
- `POST /api/profile/state` - Log daily state

### Insights
- `POST /api/insights/daily-review` - Daily summary
- `POST /api/insights/weekly-review` - Weekly patterns

### Assistant
- `POST /api/assistant/query` - Ask question
- `GET /api/assistant/health` - LLM status

---

## 🧪 Testing

### Manual Testing Checklist

- [ ] OAuth login (Google/GitHub)
- [ ] Complete onboarding flow
- [ ] Create manual task
- [ ] Generate AI tasks
- [ ] Break down task into subtasks
- [ ] View priority explanation
- [ ] Complete task
- [ ] Log daily energy state
- [ ] Detect habit from patterns
- [ ] Accept/decline habit suggestion
- [ ] Ask AI assistant question
- [ ] Generate daily review
- [ ] Generate weekly review

### Automated Testing

```bash
# Backend tests (if implemented)
cd backend
npm test

# Frontend tests (if implemented)
cd frontend
npm test
```

---

## 🐛 Troubleshooting

### Common Issues

**1. Containers won't start:**
```bash
docker-compose down
docker-compose up -d --build
```

**2. Database connection error:**
```bash
docker-compose restart postgres
docker exec -it daily-dashboard-backend npm run init-db
```

**3. LLM not responding:**
```bash
docker exec -it daily-dashboard-ollama ollama list
docker exec -it daily-dashboard-ollama ollama pull llama3
docker-compose restart ollama
```

**4. Frontend can't reach backend:**
- Check backend is running: `curl http://localhost:5000/health`
- Check logs: `docker-compose logs backend`
- Restart: `docker-compose restart backend`

**5. OAuth fails:**
- Verify credentials in `backend/.env`
- Ensure redirect URIs match exactly
- Restart backend: `docker-compose restart backend`

---

## 📈 Performance Optimization

### LLM Response Time
- **Typical**: 3-8 seconds per request
- **Hardware dependent**: Better CPU/GPU = faster responses
- **Consider**: Smaller models like `phi` for faster but less capable responses

### Database Queries
- Indexes already optimized for common queries
- Monitor slow queries in production
- Consider read replicas for scale

### Frontend
- Code splitting implemented
- Lazy loading for heavy components
- Optimistic UI updates

---

## 🔒 Security Considerations

### Current Implementation
- OAuth-based authentication
- Session-based auth (HTTP-only cookies)
- CORS protection
- Rate limiting on API routes
- Helmet.js security headers

### Production Recommendations
- Enable HTTPS (required)
- Use strong SESSION_SECRET
- Implement CSRF protection
- Add input sanitization
- Set up monitoring/alerting
- Regular security audits

---

## 🚀 Deployment

### Docker Production

```bash
# Build for production
docker-compose -f docker-compose.prod.yml build

# Deploy
docker-compose -f docker-compose.prod.yml up -d
```

### Cloud Platforms

**Recommended:**
- **Backend & Database**: Railway, Render, Fly.io
- **Frontend**: Vercel, Netlify
- **LLM**: Self-hosted Ollama or OpenAI API fallback

See `SETUP.md` for detailed deployment guide.

---

## 🛠️ Development

### Running Locally (Without Docker)

**Backend:**
```bash
cd backend
npm install
cp .env.example .env
# Edit .env with local PostgreSQL URL
npm run init-db
npm run dev
```

**Frontend:**
```bash
cd frontend
npm install
npm start
```

**Ollama:**
```bash
ollama serve
ollama pull llama3
```

---

## 📝 Contributing

Contributions are welcome! This is a portfolio project designed to demonstrate:

- Full-stack development
- LLM integration
- Database design
- Docker containerization
- OAuth authentication
- React best practices
- API design

Feel free to fork and extend!

---

## 📄 License

MIT License - Free for personal and commercial use

---

## 🙏 Acknowledgments

- **Anthropic** - Claude for architecture guidance
- **Meta** - LLaMA 3 model
- **Ollama** - Local LLM runtime
- **Open Source Community** - All the amazing libraries

---

## 📧 Support

For issues, questions, or feedback:
- Check [SETUP.md](./SETUP.md) for detailed guides
- Review Docker logs: `docker-compose logs`
- Verify all services: `docker-compose ps`

---

## 🗺️ Roadmap

### Planned Features
- [ ] Calendar integration (Google Calendar, Outlook)
- [ ] Mobile app (React Native)
- [ ] Voice input for tasks
- [ ] Team collaboration features
- [ ] Advanced analytics dashboard
- [ ] Wearable integration (optional)
- [ ] Multi-language support
- [ ] Dark/light theme toggle
- [ ] Export data (JSON, CSV)
- [ ] Backup & restore

### Under Consideration
- Native desktop app (Electron)
- Browser extension
- Slack/Discord integration
- Public API for third-party apps

---

**Built with ❤️ for real humans with real variability**

Not idealized productivity. Just better days.
