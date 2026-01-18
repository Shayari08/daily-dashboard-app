# ⚡ INSTANT TEST - 30 Seconds

## Want to just SEE it working? Run this:

### Mac/Linux:
```bash
cd daily-dashboard-app
bash test-mode.sh
```

### Windows:
```cmd
cd daily-dashboard-app
test-mode.bat
```

**That's it!** Opens in browser automatically at http://localhost:3000

---

## What You'll See

✅ **Dashboard with 3 sample tasks**
✅ **Drag and drop** - Grab the ⋮⋮ handle and drag tasks
✅ **Add tasks** - Click the + Add Task button
✅ **Complete tasks** - Click Complete button
✅ **All features working** - No setup needed!

---

## Test Mode Features

✓ **No OAuth needed** - Skips login
✓ **No database needed** - Uses memory
✓ **No Ollama needed** - Mock AI
✓ **Instant startup** - 30 seconds
✓ **Perfect for testing** - See all features work

---

## What to Test

1. **Drag and Drop**
   - Hover over a task
   - Grab the grip handle (⋮⋮)
   - Drag up or down
   - Watch it reorder!

2. **Add Task**
   - Click "+ Add Task"
   - Fill in title
   - Choose energy level (1-5)
   - Click Create Task

3. **Complete Task**
   - Click "Complete" button
   - Task disappears with animation

4. **View Metrics**
   - Open http://localhost:5000/metrics
   - See Prometheus-format metrics

---

## Limitations in Test Mode

⚠️ **Mock data only** - Changes lost on restart
⚠️ **No authentication** - Bypasses OAuth
⚠️ **No AI features** - LLM disabled
⚠️ **No persistence** - In-memory only

**For FULL features, see DEPLOYMENT_WITH_MONITORING.md**

---

## Stop Test Mode

Press `Ctrl+C` in the terminal

---

## After Testing

Ready to deploy for real?

### Option 1: Local with PostgreSQL + Ollama
See `LOCAL_SETUP.md`

### Option 2: Docker (Full Stack)
```bash
docker-compose up -d
```

### Option 3: Cloud (FREE)
See `DEPLOYMENT_WITH_MONITORING.md`

---

## Requirements

Only Node.js needed!
- Node.js 18+ (https://nodejs.org)

Test mode handles everything else.

---

## Troubleshooting

**Port already in use?**
```bash
# Kill existing processes
pkill -f node  # Mac/Linux
taskkill /F /IM node.exe  # Windows
```

**npm install fails?**
```bash
rm -rf node_modules package-lock.json
npm install
```

**Frontend won't start?**
```bash
cd frontend
rm -rf node_modules
npm install
npm start
```

---

## What's Actually Running

**Backend (Port 5000)**
- Express server with mock data
- 3 pre-loaded sample tasks
- All API endpoints working
- Metrics endpoint active

**Frontend (Port 3000)**
- React app
- All UI components
- Drag-and-drop enabled
- Animations working

**Data Storage**
- In-memory JavaScript array
- Resets on restart
- Perfect for quick testing

---

## Next Steps

1. ✅ Test the app (you're here!)
2. → Set up OAuth (see LOCAL_SETUP.md)
3. → Add PostgreSQL database
4. → Deploy to production

---

## Time Investment

- **Test mode:** 30 seconds
- **Local setup:** 15 minutes
- **Docker setup:** 10 minutes
- **Cloud deploy:** 20 minutes

Start with test mode, then upgrade when ready!

---

**🎉 Enjoy testing your productivity dashboard!**
