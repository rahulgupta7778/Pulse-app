# Pulse - (Last Minute Life Saver)

> AI-powered productivity companion — keep pace with your day.

Pulse is a full-stack productivity assistant that combines task management, goal/habit tracking, timetable scheduling, AI-powered chat, gamification (XP/levels/achievements), Google Calendar/Tasks/Gmail sync, push notifications, and a built-in Pomodoro focus mode — all in a single-page app with a Node.js + SQLite backend.

[Deployed Link - https://pulse-1088163571214.asia-southeast1.run.app]
---

## Features

### Task Management
- Create, edit, delete, reorder, and search tasks
- Priority levels: Low, Medium, High, Urgent
- Categories: Work, Study, Personal, Health, Finance, Other
- Due dates/times with duration estimates
- Subtask breakdowns with AI-generated subtasks
- Filters: All, Today, Upcoming, Overdue, Completed
- CSV export

### Daily Roadmap & Timetable
- Weekly planner with fixed time slots (classes, work, sleep, gym)
- Visual day-by-day "Today's Work Roadmap" with progress bar
- Clickable roadmap cards with task detail modals
- AI-powered day optimization — fits tasks into free slots
- AI-powered week optimization
- Smart free-slot detection

### Goals & Habits
- Create weekly goals with target counts and descriptions
- Track habits linked to goals (daily or weekly frequency)
- Habit streaks and best streaks
- Daily habit check-in (toggle completion circle)
- Goal progress tracking with +1 manual increment
- Categories: Personal, Work, Study, Health, Finance, Other
- Location and media/link attachments per goal/habit
- CSV export

### AI Assistant
- Natural-language chat interface with voice input support
- **Groq API** (`llama-3.1-8b-instant`) as primary AI backend
- **Google Gemini** (`@google/genai` SDK) as secondary AI backend
- **Local rule-based fallback** (`geminiAi.js`) — works offline with no API keys — handles add/toggle/delete/update tasks, goals, habits, prioritization, task breakdown, risk analysis, schedule optimization, and motivational coaching
- 17 function-calling tools covering the full app domain
- Quick-action buttons: Add Task, Add Goal, Add Habit, Prioritize, Break Down, Motivate Me, Optimize Day, Check Risks
- Mood-adaptive suggestions

### Dashboard
- Overview stats: Due Today, Overdue, Completed, Productivity Score
- Today's timeline view
- Upcoming deadlines list
- AI productivity recommendations
- Auto-Pilot Mode toggle (background schedule optimization every 5 min)
- Mood logging (6 moods): Energetic, Focused, Neutral, Tired, Stressed, Unmotivated

### Gamification
- XP system: earn XP for creating tasks (5 XP), completing goals (15 XP), unlocking achievements
- Level progression with XP bar and next-level tracking
- 12 achievements: First Task, Task Machine, Productivity Pro, Centurion, Week Warrior, Monthly Master, Goal Setter, Goal Crusher, Early Bird, Laser Focus, Well Organized, Well Connected
- Leaderboard
- XP history chart
- 52-week productivity heatmap
- Achievement gallery with unlock animations

### Focus Mode & Pomodoro Timer
- Built-in Pomodoro timer (15/25/45/60 min + custom duration)
- Session tracking and history
- Start, Pause, Reset controls
- Keyboard shortcut: Ctrl+F for full-screen focus overlay
- Automatic top-priority task suggestion during focus

### Google Integrations
- **Google Calendar** — OAuth 2.0 connect, list/create/update/delete events, respond to invites, bidirectional sync between tasks and calendar events
- **Google Tasks** — OAuth 2.0 connect, one-way sync (Google Tasks → Pulse)
- **Gmail** — OAuth 2.0 connect, read-only inbox access for AI-powered action item extraction
- Connections dropdown with per-service status, sync, and disconnect buttons

### Analytics
- Productivity score (task completion rate)
- Charts: Tasks Completed (bar chart), Focus Hours (bar chart), Score Trend (line chart), Category Breakdown (doughnut chart)
- Canvas-based chart rendering

### Notifications & Reminders
- Web Push Notifications via VAPID (allow push on first visit)
- In-app notification center (bell icon with unread badge)
- 3 reminder windows: 15 min, 1 hour, 24 hours before due
- Daily productivity summary at 8 AM
- Proactive anomaly detection (overdue tasks, no tasks scheduled)
- Mark read / mark all read

### Authentication
- Email/password registration and login
- JWT-based sessions (24-hour expiry)
- DOB-based password reset flow
- Google Sign-In (optional, via GSI)
- Rate-limited auth endpoints (20 req / 15 min)

### User Experience
- Light/Dark theme toggle (persisted in localStorage)
- Animated splash screen with loader
- Aurora wave, shooting star, and floating particle background effects
- Onboarding walkthrough on first visit
- Keyboard shortcuts: `N` = new task/goal, `/` = search, `Shift+N` = new habit, `Ctrl+F` = focus mode
- Toast notifications with auto-dismiss
- Responsive design with mobile hamburger nav
- Bottom navigation for mobile
- Skeleton loading states

### Data & Export
- SQLite database with WAL mode
- CSV export for tasks, goals, and habits
- Firestore sync (optional, via Firebase Admin SDK)
- Profile editing

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla JavaScript (ES6+), HTML5, CSS3 |
| **Backend** | Node.js, Express 4 (CommonJS) |
| **Database** | SQLite via better-sqlite3 (WAL mode) |
| **Authentication** | JWT (jsonwebtoken), bcryptjs |
| **AI (Primary)** | Groq API (`llama-3.1-8b-instant`) |
| **AI (Secondary)** | Google Gemini SDK (`@google/genai` v2.10.0) |
| **AI (Fallback)** | Local rule-based engine (offline, no API key) |
| **Google APIs** | googleapis (Calendar, Tasks, Gmail), google-auth-library |
| **Push Notifications** | web-push (VAPID) |
| **Security** | helmet, express-rate-limit |
| **Cloud Sync** | firebase-admin (Firestore) |
| **Deployment** | Google AI Studio → Cloud Run |

---

## Project Structure

```
pulse/
├── package.json                    # Root package (start: backend/server.js)
├── metadata.json                   # AI Studio applet configuration
├── firebase-applet-config.json     # Firebase project settings
├── firebase-blueprint.json         # Firestore entity schemas
├── firestore.rules                 # Firestore security rules
├── .env.example                    # Environment variable template
├── .dockerignore
├── assets/.aistudio/.gitignore
├── backend/
│   ├── package.json
│   ├── server.js                   # Express entry point (port 8080 default)
│   ├── middleware/
│   │   └── auth.js                 # JWT Bearer token verification
│   ├── config/
│   │   └── db.js                   # SQLite schema (16 tables) + full CRUD
│   ├── routes/
│   │   ├── ai.js                   # AI chat (Groq → Gemini → rule-based) + 17 tools
│   │   ├── analytics.js            # Stats endpoint
│   │   ├── auth.js                 # Login, signup, Google OAuth, password reset
│   │   ├── autopilot.js            # Auto-Pilot toggle
│   │   ├── calendar.js             # Google Calendar OAuth + events CRUD
│   │   ├── export.js               # CSV export (tasks, goals, habits)
│   │   ├── gamification.js         # XP, achievements, leaderboard, history
│   │   ├── goals.js                # Goals + habits CRUD, increment, check-in
│   │   ├── integrations.js         # Gmail + Google Tasks connectors
│   │   ├── mood.js                 # Mood logging (6 moods)
│   │   ├── push.js                 # Push notification subscriptions
│   │   ├── reminders.js            # Notification center CRUD
│   │   ├── scheduler.js            # Day/week optimization, slot suggestion
│   │   ├── slots.js                # Fixed time slots CRUD
│   │   └── tasks.js                # Tasks CRUD, toggle, reorder
│   ├── services/
│   │   ├── geminiAi.js             # Rule-based AI fallback (~638 lines)
│   │   ├── autonomousAgent.js       # Auto-Pilot (5-min cycle)
│   │   ├── reminderServices.js     # Reminder checks (60-sec cycle)
│   │   ├── pushService.js          # Web push sender + cleanup
│   │   ├── googleTasks.js          # Google Tasks sync service
│   │   ├── scheduler.js            # Core scheduling logic
│   │   └── syncService.js          # 10-min sync orchestrator
│   └── tests/
│       ├── run.js                  # Comprehensive test suite
│       └── autopilot_e2e.js        # Autopilot end-to-end tests
├── frontend/
│   ├── index.html                  # SPA shell (804 lines)
│   ├── favicon.svg                 # Star-shaped SVG favicon
│   ├── sw.js                       # Service worker (push events)
│   ├── css/
│   │   ├── style.css               # Global styles, components, animations
│   │   ├── auth.css                # Auth page styling
│   │   ├── dashboard.css           # Dashboard layout
│   │   ├── tasks.css               # Task list styling
│   │   ├── calendar.css            # Timetable/roadmap styling
│   │   ├── goals.css               # Goals & habits styling
│   │   ├── analytics.css           # Charts & score circle
│   │   └── ai-assistant.css        # Chat UI styling
│   └── js/
│       ├── app.js                  # SPA bootstrap, router, focus mode, onboarding
│       ├── utils.js                # Date/time helpers, page routing
│       ├── toast.js                # Toast notification system
│       ├── api.js                  # Fetch wrapper + Store cache
│       ├── auth.js                 # Login/signup/forgot-password UI
│       ├── dashboard.js            # Dashboard render
│       ├── tasks.js                # Task CRUD UI
│       ├── calendar.js             # Timetable/roadmap UI
│       ├── goals.js                # Goals & habits UI
│       ├── analytics.js            # Charts, Pomodoro timer
│       ├── ai-assistant.js         # AI chat UI
│       ├── gamification.js         # XP/level badge
│       ├── progress.js             # Progress page (level, heatmap, achievements)
│       ├── mood.js                 # Mood logging buttons
│       ├── reminders.js            # Notification bell + dropdown
│       ├── integrations.js         # Integrations settings page
│       ├── connections.js          # Global connections dropdown
│       └── media.js                # Geolocation helper
```

---

## Getting Started

### Prerequisites
- Node.js 18+

### Installation

```bash
# Navigate to the project directory
cd "final pulse without zip"

# Install dependencies (from root)
npm install

# Copy environment template
cp .env.example .env
```

### Environment Variables

Edit `.env` with your settings:

```env
PORT=3000                         # Server port (Cloud Run uses PORT env, default 8080)
CORS_ORIGIN=true                  # CORS origin (set to your frontend URL in production)
JWT_SECRET=your-secret-key        # JWT signing secret (change this!)
GOOGLE_CLIENT_ID=                 # For Google Calendar/Tasks/Gmail OAuth
GOOGLE_CLIENT_SECRET=             # For Google Calendar/Tasks/Gmail OAuth
VAPID_PUBLIC_KEY=                 # Web Push notifications (generate with web-push)
VAPID_PRIVATE_KEY=                # Web Push notifications
GROQ_API_KEY=                     # Groq AI (comma-separated for key rotation)
GEMINI_API_KEY=                   # Google Gemini AI (secondary fallback)
APP_URL=                          # Public URL for OAuth redirects (e.g. http://localhost:3000)
```

> **Note:** AI works without any API keys — the local rule-based engine handles all core features. Groq and Gemini keys only unlock more conversational AI responses.

### Run Locally

```bash
npm start
# or
npm run dev    # with --watch mode (autorestart on changes)
```

Open `http://localhost:3000` (or your configured port).

---

## API Overview

All routes are prefixed with `/api/`. Auth routes are rate-limited (20 requests per 15 min). All other routes require a `Bearer <token>` Authorization header.

| Endpoint | Description |
|----------|-------------|
| `POST /api/auth/login` | Login with email/password |
| `POST /api/auth/signup` | Create new account |
| `POST /api/auth/reset-password` | DOB-based password reset |
| `POST /api/auth/google` | Google Sign-In |
| `GET /api/auth/me` | Get current user profile |
| `PUT /api/auth/profile` | Update name |
| `GET /api/config` | Public client config |
| `GET/POST /api/tasks` | List / Create tasks |
| `PUT /api/tasks/:id` | Update task |
| `DELETE /api/tasks/:id` | Delete task |
| `PATCH /api/tasks/:id/toggle` | Toggle completion |
| `PUT /api/tasks/reorder` | Reorder tasks (drag & drop) |
| `GET/POST /api/goals` | List / Create goals |
| `PUT /api/goals/:id` | Update goal |
| `DELETE /api/goals/:id` | Delete goal (with linked habits) |
| `POST /api/goals/:id/increment` | Increment goal progress |
| `GET /api/goals/:id/habits` | Get habits linked to a goal |
| `GET/POST /api/slots` | List / Create fixed slots |
| `PUT /api/slots/:id` | Update slot |
| `DELETE /api/slots/:id` | Delete slot |
| `POST /api/scheduler/optimize-day` | AI-optimize daily schedule |
| `POST /api/scheduler/optimize-week` | AI-optimize weekly schedule |
| `POST /api/scheduler/suggest-slot` | Suggest best slot for a task |
| `POST /api/ai/chat` | AI chat with function calling |
| `GET /api/ai/summarize` | Get AI-generated day summary |
| `GET /api/ai/models` | List available AI model status |
| `GET /api/analytics/stats` | Productivity statistics |
| `POST /api/analytics/log` | Log daily analytics |
| `POST /api/mood/log` | Log mood for today |
| `GET /api/mood/today` | Get today's mood |
| `GET /api/mood/history` | Get mood history |
| `GET /api/gamification/xp` | Get XP, level, next-level XP |
| `GET /api/gamification/achievements` | Get unlocked achievements |
| `POST /api/gamification/check` | Check and unlock achievements |
| `GET /api/gamification/history` | Get XP history |
| `GET /api/gamification/leaderboard` | Get leaderboard |
| `GET /api/calendar/auth-url` | Get Google Calendar OAuth URL |
| `GET /api/calendar/callback` | Calendar OAuth callback |
| `GET /api/calendar/events` | List calendar events |
| `POST /api/calendar/events` | Create calendar event |
| `PUT /api/calendar/events/:id` | Update calendar event |
| `DELETE /api/calendar/events/:id` | Delete calendar event |
| `POST /api/calendar/sync` | Sync calendar events ↔ local tasks |
| `GET /api/integrations/google/auth-url` | Gmail OAuth URL |
| `GET /api/integrations/google/callback` | Gmail OAuth callback |
| `GET /api/integrations/googletasks/auth-url` | Google Tasks OAuth URL |
| `GET /api/integrations/googletasks/callback` | Google Tasks OAuth callback |
| `POST /api/integrations/sync-all` | Sync all connected services |
| `POST /api/integrations/disconnect` | Disconnect a service |
| `GET /api/integrations/status` | Get integration status |
| `GET/POST /api/autopilot` | Get / Toggle auto-pilot |
| `GET /api/reminders` | List notifications |
| `GET /api/reminders/unread` | List unread notifications |
| `POST /api/reminders/:id/read` | Mark notification read |
| `POST /api/reminders/read-all` | Mark all read |
| `POST /api/push/subscribe` | Subscribe to push notifications |
| `POST /api/push/unsubscribe` | Unsubscribe from push |
| `GET /api/export/csv/tasks` | Export tasks as CSV |
| `GET /api/export/csv/goals` | Export goals as CSV |
| `GET /api/export/csv/habits` | Export habits as CSV |

---

## AI Backend Architecture

The AI chat endpoint (`/api/ai/chat`) uses a **three-tier fallback system**:

1. **Groq API** (primary) — `llama-3.1-8b-instant` via REST. Supports multiple API keys (comma-separated) with automatic key rotation on 429/413 rate limits. 30-second cooldown on rate limits.

2. **Google Gemini** (secondary) — `gemini-2.0-flash` via `@google/genai` SDK. Used when Groq is rate-limited or unavailable. 60-second cooldown on rate limits.

3. **Rule-based fallback** (always available) — Local `geminiAi.js` pattern-matching engine (~638 lines). Handles:
   - Task/goal/habit parsing and CRUD
   - Priority and category classification
   - Task prioritization and ordering
   - Task breakdown into steps
   - Risk/deadline analysis
   - Schedule optimization
   - Motivational affirmations
   - Productivity tips
   - Stats and summaries

The system prompt includes the user's top tasks, goals, habits, fixed slots, current mood, and time context.

---

## Background Services

Three services run automatically when the server starts:

| Service | Interval | Purpose |
|---------|----------|---------|
| `reminderServices.js` | 60 seconds | Checks all users' tasks against 3 reminder windows (15 min, 1 hr, 24 hr before due) + daily 8 AM summary notification |
| `autonomousAgent.js` | 5 minutes | For autopilot-enabled users: optimizes daily schedule, detects anomalies (overdue tasks, no tasks scheduled, late wake-up), sends proactive notifications |
| `syncService.js` | 10 minutes | Syncs data from all connected external services (Google Tasks) |

---

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `N` | New task (on Tasks page) / New goal (on Goals page) |
| `Shift+N` | New habit (on Goals page) |
| `/` | Focus task search bar |
| `Ctrl+F` / `Cmd+F` | Toggle Focus Mode |

---
## Tests

```bash
node backend/tests/run.js                # Full test suite
node backend/tests/autopilot_e2e.js      # Autopilot end-to-end tests
```

The test suite covers: goals CRUD, habits CRUD, reminder scheduling, scheduler optimization, autopilot agent, and streak calculations.

---

## Deployed Link

https://pulse-1088163571214.asia-southeast1.run.app

