# Pulse - (Last Minute Life Saver)

> AI-powered productivity companion — keep pace with your day.

Pulse is a full-stack productivity assistant that combines task management, goal/habit tracking, timetable scheduling, AI-powered chat, gamification (XP/levels/achievements), Google Calendar/Tasks/Gmail sync, push notifications, and a built-in Pomodoro focus mode — all in a single-page app with a Node.js + SQLite backend.

[Live Application](https://pulse-1088163571214.asia-southeast1.run.app)

---

## Features

### Task Management
- **CRUD Operations**: Create, edit, delete, reorder, and search tasks.
- **Priority & Categorization**: Low, Medium, High, Urgent priorities; Work, Study, Personal, Health, Finance, Other categories.
- **Due Dates & Estimates**: Set due dates/times with duration estimates.
- **Subtask Breakdown**: View subtask checklists with AI-generated step-by-step breakdowns.
- **Status Filters**: Filter tasks quickly by All, Today, Upcoming, Overdue, and Completed.
- **CSV Export**: Export all tasks instantly to CSV files.

### Daily Roadmap & Timetable
- **Weekly Planner**: Fixed time slots (classes, work, sleep, gym).
- **Today's Roadmap**: Visual day-by-day "Today's Work Roadmap" with a dynamic progress bar.
- **Task Modals**: Clickable roadmap cards displaying rich task detail modals.
- **AI-Powered Optimization**: Smart optimization fits your tasks dynamically into free slots.
- **Free-Slot Detection**: Auto-detects empty calendar windows to suggest perfect times.

### Goals & Habits
- **Goal Setting**: Create weekly goals with target counts, descriptions, locations, and attachments.
- **Habit Tracking**: Link habits directly to weekly goals with daily/weekly frequencies.
- **Streak Counters**: Displays current habit streaks and best streak records.
- **Daily Check-Ins**: Toggle habit completion with intuitive progress circle indicators.
- **Goal Increments**: Manual +1 increment buttons to track real-world completions.

### AI Assistant
- **Natural-Language Chat**: Seamless conversation with integrated voice input support.
- **Groq API**: Primary LLM backend using `llama-3.1-8b-instant` with automatic key rotation on rate limits (429/413).
- **Google Gemini SDK**: Secondary LLM backend using the official `@google/genai` library.
- **Rule-Based Fallback**: Fully offline fallback engine (`geminiAi.js`) that handles task/goal updates, prioritization, breakdown, schedule optimization, and motivational coaching without API keys.
- **Function Calling**: 17 built-in tools covering full application domains.
- **Quick Actions**: Hotbuttons for Quick Add, Prioritize, Break Down, Motivate, Optimize Day, and Check Risks.

### Dashboard & Analytics
- **At-a-Glance Metrics**: Displays Due Today, Overdue, Completed, and a real-time Productivity Score.
- **Visual Timelines**: Interactive view of today's schedule and upcoming deadlines.
- **AI Recommendations**: Personalized, proactive productivity and habit-building tips.
- **Auto-Pilot Mode**: Toggles continuous background schedule optimization every 5 minutes.
- **Mood Logging**: Log daily states across 6 moods (Energetic, Focused, Neutral, Tired, Stressed, Unmotivated) with historic tracking.
- **Canvas Charts**: Native canvas-based renderers for Tasks Completed, Focus Hours, Score Trends, and Category Breakdowns.

### Gamification & Focus Mode
- **XP Progression**: Earn XP for task additions (5 XP), goal completions (15 XP), and unlocking achievements.
- **Level Engine**: Responsive XP levels with fluid progress bars and transition animations.
- **Achievement Gallery**: 12 unlockable milestones with interactive toast triggers.
- **Visual Heatmap**: 52-week productivity activity grid.
- **Pomodoro Timer**: Custom focus blocks (15/25/45/60 min) with start, pause, reset, and focus target selections.

### Google Integrations & Notifications
- **Google Calendar Sync**: OAuth 2.0 connection enabling bidirectional event-to-task sync.
- **Google Tasks Sync**: One-way import sync from Google Tasks into Pulse.
- **Gmail Extraction**: Read-only inbox scanning to extract action items via AI.
- **Web Push Notifications**: Standard VAPID push subscriptions, in-app notifications, and custom reminder windows (15m, 1h, 24h).

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | Vanilla ES6+ JavaScript, HTML5, CSS3 |
| **Backend** | Node.js, Express 4 (CommonJS) |
| **Database** | SQLite via `better-sqlite3` (WAL mode enabled) |
| **Authentication** | JWT (jsonwebtoken), bcryptjs |
| **Primary AI** | Groq API (`llama-3.1-8b-instant`) |
| **Secondary AI** | Google Gemini API (`@google/genai` SDK) |
| **Offline AI** | Built-in offline rule-based parser |
| **Integrations** | `googleapis`, `google-auth-library` |
| **Push Gateway** | `web-push` (VAPID) |
| **Security** | `helmet`, `express-rate-limit` |
| **Cloud Sync** | `firebase-admin` (optional Cloud Firestore backup) |

---

## Project Structure

```
pulse/
├── package.json                      # Root config (CommonJS, start: backend/server.js)
├── metadata.json                      # Applet manifest and frame permissions
├── firebase-applet-config.json        # Firebase environment secrets
├── firebase-blueprint.json            # Firestore document schemas
├── firestore.rules                    # Cloud Firestore security rules
├── .env.example                       # Environment template
│
├── backend/
│   ├── server.js                      # Entry point (Port 3000 default, 8080 on Cloud Run)
│   ├── config/
│   │   └── db.js                      # Schema definitions (16 relational tables)
│   ├── middleware/
│   │   └── auth.js                    # JWT Bearer token authentication
│   ├── routes/
│   │   ├── ai.js                      # AI chat with 3-tier fallback + 17 tool interfaces
│   │   ├── analytics.js               # Analytical aggregation and history logs
│   │   ├── auth.js                    # Auth routines and Google token validation
│   │   ├── autopilot.js               # Auto-Pilot configuration endpoint
│   │   ├── calendar.js                # Google Calendar endpoints
│   │   ├── export.js                  # CSV exporter for tasks, goals, habits
│   │   ├── gamification.js            # XP, levels, leaderboard
│   │   ├── goals.js                   # Goals, habits, streaks, check-ins
│   │   ├── integrations.js            # Gmail + Google Tasks callback routes
│   │   ├── mood.js                    # Mood tracking & log retrieval
│   │   ├── push.js                    # VAPID push notification registrations
│   │   ├── reminders.js               # Notification storage controls
│   │   ├── scheduler.js               # Day optimization & recommendations
│   │   ├── slots.js                   # Fixed time slot records
│   │   └── tasks.js                   # Task CRUD and drag-and-drop ordering
│   ├── services/
│   │   ├── geminiAi.js                # Local rule-based AI engine (~638 lines)
│   │   ├── autonomousAgent.js         # Auto-Pilot periodic orchestrator (5 min)
│   │   ├── reminderServices.js        # Background event reminder checks (60 sec)
│   │   ├── pushService.js             # Web Push dispatcher
│   │   ├── googleTasks.js             # Google Tasks sync utility
│   │   ├── scheduler.js               # Multi-slot timeline calculations
│   │   └── syncService.js             # External sync engine (10 min)
│   └── tests/
│       ├── run.js                     # Full test suite
│       └── autopilot_e2e.js           # Autopilot end-to-end test
│
└── frontend/
    ├── index.html                     # SPA main shell (804 lines, 7 pages)
    ├── sw.js                          # Service Worker for push events
    ├── css/
    │   ├── style.css                  # Base layout, transitions, themes
    │   ├── auth.css                   # Auth containers
    │   ├── dashboard.css              # Dashboard grid
    │   ├── tasks.css                  # Task components
    │   ├── calendar.css               # Roadmap timelines
    │   ├── goals.css                  # Habits & goals progress widgets
    │   ├── analytics.css              # Chart metrics
    │   └── ai-assistant.css           # Chat panel design
    └── js/
        ├── app.js                     # Main controller, router, focus mode, onboarding
        ├── utils.js                   # Date helpers, string formatters, page routing
        ├── toast.js                   # In-app floating popup notifications
        ├── api.js                     # Fetch wrapper + Store cache
        ├── auth.js                    # Login, signup, profile UI
        ├── dashboard.js               # Overview cards, stats, timeline
        ├── tasks.js                   # Interactive task boards
        ├── calendar.js                # Roadmap rendering, planner drawer
        ├── goals.js                   # Goals creation, habit checkers
        ├── analytics.js               # Canvas charts, Pomodoro timer
        ├── ai-assistant.js            # Chat UI, voice input, quick actions
        ├── gamification.js            # XP badge triggers
        ├── progress.js                # Heatmaps, level card, achievements
        ├── mood.js                    # Mood indicator pickers
        ├── reminders.js               # Notification dropdown lists
        ├── integrations.js            # Sync dashboards
        ├── connections.js             # Global connections dropdown
        └── media.js                   # Geolocation handler
```

---

## Getting Started

### Prerequisites
- Node.js 18 or higher installed on your system.

### Installation

1. Clone or copy your workspace files into your local directory.
2. Install the necessary dependencies from the root directory:
   ```bash
   npm install
   ```
3. Set up your environment variables by copying the template:
   ```bash
   cp .env.example .env
   ```

### Configuration (.env)

Adjust the values inside `.env` to suit your project configuration:

```env
PORT=3000                         # Port to launch the application
CORS_ORIGIN=true                  # Enable CORS for origin routing
JWT_SECRET=your-secret-key        # Custom key used to sign JWT session tokens
GOOGLE_CLIENT_ID=                 # OAuth Client ID for Calendar/Tasks/Gmail
GOOGLE_CLIENT_SECRET=             # OAuth Client Secret for Calendar/Tasks/Gmail
VAPID_PUBLIC_KEY=                 # Web Push Public Key
VAPID_PRIVATE_KEY=                # Web Push Private Key
GROQ_API_KEY=                     # Optional primary key for conversational LLM
GEMINI_API_KEY=                   # Optional secondary key for conversational LLM
APP_URL=http://localhost:3000     # Main callback URL for OAuth validation
```

> **Note:** The application has built-in offline modes. All core functionalities run perfectly using local SQLite data and rule-based processing without external API keys.

### Running the Application

Launch the development server:

```bash
npm run dev
```

The application will immediately spin up and become accessible at `http://localhost:3000`.

---

## Keyboard Shortcuts

| Key Binding | Action Triggered |
|-------------|------------------|
| `N` | Opens the creation drawer (Tasks page) or Goal modal (Goals page) |
| `Shift + N` | Opens the Habit creation modal |
| `/` | Focuses directly onto the search bar |
| `Ctrl + F` or `Cmd + F` | Toggles full-screen Pomodoro Focus overlay |

---

## Background Orchestrators

When you launch the backend, three automated background processors initiate automatically:

| Service | Interval | Purpose |
|---------|----------|---------|
| **Reminder Dispatcher** | Every 60 seconds | Compares upcoming deadlines against notification trigger thresholds (15 min, 1 hour, 24 hours) and prepares the 8:00 AM daily roadmap review |
| **Autonomous Agent** | Every 5 minutes | Processes users with active Autopilot flags. Evaluates calendar spaces, optimizes schedules, flags overdue task anomalies, and emits alerts |
| **Integration Sync** | Every 10 minutes | Syncs records automatically from connected external Google Tasks channels to keep schedules aligned |

---

## Automated Test Suite

Run the diagnostic suite to ensure your setups are perfectly calibrated:

**Full Project Diagnostics:**
```bash
node backend/tests/run.js
```

**Autonomous Agent End-to-End Test:**
```bash
node backend/tests/autopilot_e2e.js
```