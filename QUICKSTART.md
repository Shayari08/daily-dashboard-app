# ⚡ QUICKSTART GUIDE

Get Daily Dashboard running in **5 simple commands**.

## Prerequisites
- Docker Desktop installed and running
- 10GB free disk space
- 30 minutes for first-time setup

---

## 🚀 Start in 5 Commands

### 1. Navigate to project
```bash
cd daily-dashboard-app
```

### 2. Copy environment file
```bash
cp backend/.env.example backend/.env
```

### 3. Start all services
```bash
docker-compose up -d
```
⏱️ *Takes 10-15 min first time*

### 4. Download AI model
```bash
docker exec -it daily-dashboard-ollama ollama pull llama3
```
⏱️ *Takes 10-20 min (downloads 4GB)*

### 5. Initialize database
```bash
docker exec -it daily-dashboard-backend npm run init-db
```
⏱️ *Takes <1 min*

---

## ✅ You're Ready!

Open browser: **http://localhost:3000**

---

## 🔑 OAuth Setup (Optional but Recommended)

Without OAuth, you can't log in. Choose one:

### Quick Option: GitHub OAuth (5 minutes)

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Fill in:
   - **Application name**: Daily Dashboard Local
   - **Homepage URL**: http://localhost:3000
   - **Authorization callback URL**: http://localhost:5000/api/auth/github/callback
4. Click "Register application"
5. Copy **Client ID** and **Client Secret**
6. Edit `backend/.env`:
   ```
   GITHUB_CLIENT_ID=your_client_id_here
   GITHUB_CLIENT_SECRET=your_client_secret_here
   ```
7. Restart backend:
   ```bash
   docker-compose restart backend
   ```

### Alternative: Google OAuth (10 minutes)

1. Go to https://console.cloud.google.com/
2. Create new project (or select existing)
3. Enable "Google+ API"
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client ID"
5. Configure consent screen (external, test mode)
6. Create OAuth client ID:
   - **Application type**: Web application
   - **Authorized redirect URIs**: http://localhost:5000/api/auth/google/callback
7. Copy **Client ID** and **Client Secret**
8. Edit `backend/.env`:
   ```
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   ```
9. Restart backend:
   ```bash
   docker-compose restart backend
   ```

---

## 📱 First Login

1. Go to http://localhost:3000
2. Click "Continue with GitHub" or "Continue with Google"
3. Authorize the app
4. Complete onboarding (4 quick steps)
5. Start using your dashboard!

---

## 🧪 Quick Feature Test

1. **Add a task**: Click "+ Add Task"
2. **Log your state**: Set today's energy level
3. **Ask the AI**: Click assistant, ask "What should I work on?"
4. **Complete a task**: Mark one done
5. **Check insights**: Generate a daily review

---

## 🛑 Stop Everything

```bash
docker-compose down
```

To delete all data and start fresh:
```bash
docker-compose down -v
```

---

## ❓ Troubleshooting

**Can't access http://localhost:3000?**
```bash
docker-compose ps
# All services should show "Up"
```

**OAuth not working?**
- Check credentials in `backend/.env`
- Verify redirect URLs match exactly
- Restart: `docker-compose restart backend`

**Slow AI responses?**
- Normal on first use (model loading)
- Expect 5-10 seconds per request
- Hardware dependent

**Need more help?**
- See [SETUP.md](./SETUP.md) for detailed guide
- Check logs: `docker-compose logs backend`

---

## 📚 Next Steps

- Read [README.md](./README.md) for full documentation
- See [SETUP.md](./SETUP.md) for advanced configuration
- Explore the API endpoints
- Customize the design

---

**Ready to boost your productivity! 🎯**
