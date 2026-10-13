# IRDAI Dark Pattern Scanner — Local Setup Guide

Fully local, self-hosted, open-source compliance scanner. **No Claude API,
no OpenAI, no cloud vision service, no per-page token billing.** Everything
after the one-time setup below runs entirely on your own machine.

---

## What This Is

| Layer | Technology | Open Source? | Runs Where |
|---|---|---|---|
| Web crawler & screenshots | Playwright (Chromium) | Yes (Apache 2.0) | Local |
| AI vision analysis | Gemma 3 4B via Ollama | Yes (Gemma license) | Local |
| Database | SQLite (better-sqlite3) | Yes (MIT) | Local file |
| Backend API | Node.js + Express + Socket.io | Yes (MIT) | Local |
| Frontend UI | React + Vite | Yes (MIT) | Local |
| PDF reports | PDFKit | Yes (MIT) | Local |

**No component in this stack requires an ongoing internet connection or
any paid API key.**

---

## Internet Requirements — Read This First

Three one-time downloads require internet. After these three steps,
**the application never needs internet again**:

| # | What | Size | When |
|---|---|---|---|
| 1 | Ollama itself | ~200 MB | Once, from https://ollama.com/download |
| 2 | The Gemma 3 4B AI model | ~3-4 GB | Once, via `ollama pull gemma3:4b` |
| 3 | Playwright's Chromium browser | ~150 MB | Once, via `npx playwright install chromium` |
| 4 | npm package downloads (backend + frontend) | ~200 MB | Once, via `npm install` |

Total one-time download: roughly **4-5 GB**. After this, disconnect from
the internet entirely if you want — the scanner will keep working.

The only ongoing internet use is the scanner **visiting the actual
insurance website you're auditing** (e.g. royalsundaram.in) to take
screenshots — that's inherent to the task of scanning a live website,
not a call to any AI provider.

---

## Prerequisites

| Requirement | Minimum | Check with |
|---|---|---|
| OS | macOS, Linux, or Windows (WSL2 recommended) | — |
| Node.js | v18 or higher | `node -v` |
| RAM | 8 GB minimum, 16 GB recommended (CPU-only inference) | — |
| Disk space | 6 GB free | — |
| CPU | Any modern multi-core CPU (no GPU required) | — |

If Node.js is missing, install it from **https://nodejs.org** (choose the LTS version).

---

## Step-by-Step Setup

### Option A — One Command (Recommended)

```bash
cd irdai-local-suite
chmod +x start.sh
./start.sh
```

This single script does everything: checks prerequisites, installs
Ollama guidance if missing, pulls the AI model, installs all
dependencies, and starts both servers. Skip to **"What You'll See"**
below once it completes.

### Option B — Manual Step-by-Step (if you prefer full control)

#### 1. Install Ollama

Visit **https://ollama.com/download** and install for your OS.

Or via terminal (macOS/Linux):
```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Verify installation:
```bash
ollama --version
```

#### 2. Start the Ollama server

```bash
ollama serve
```

Leave this running in its own terminal window/tab. (On macOS/Windows,
the Ollama desktop app does this automatically in the background.)

#### 3. Pull the vision model (one-time internet use)

In a new terminal:
```bash
ollama pull gemma3:4b
```

This downloads ~3-4 GB. Progress bar will show download status.
Verify it worked:
```bash
ollama list
```
You should see `gemma3:4b` in the list.

#### 4. Install backend dependencies

```bash
cd irdai-local-suite/backend
npm install
```

#### 5. Install Playwright's browser (one-time internet use)

```bash
npx playwright install chromium
```

#### 6. Start the backend server

```bash
npm start
```

You should see:
```
════════════════════════════════════════════════════════
  IRDAI Dark Pattern Scanner — LOCAL BACKEND
════════════════════════════════════════════════════════
  API running at    : http://localhost:4500
  Screenshots served: http://localhost:4500/screenshots
  Mode              : Fully offline (no external API calls)
════════════════════════════════════════════════════════
```

Leave this terminal running.

#### 7. Install and start the frontend (in a new terminal)

```bash
cd irdai-local-suite/frontend
npm install
npm run dev
```

You should see Vite's output with a local URL, typically:
```
  VITE ready in 400 ms
  ➜  Local:   http://localhost:5173/
```

---

## What You'll See — Confirming It's Running

Open **http://localhost:5173** in your browser.

At the top right of the page, you'll see a status indicator:
- 🟢 **"LOCAL AI READY — gemma3:4b"** — everything is working, you can start scanning
- 🟡 **A yellow message** — Ollama is reachable but the model isn't pulled yet (run `ollama pull gemma3:4b`)
- 🔴 **"BACKEND UNREACHABLE"** — the backend server isn't running (check Step 6 above)

Once green, enter a target URL (e.g. `https://www.royalsundaram.in`) and
click **Start Scan**. You'll see live progress in the Scan Console.

---

## Running Again Later

You do **not** need to repeat the one-time downloads. Just:

```bash
# Terminal 1
ollama serve

# Terminal 2
cd irdai-local-suite/backend && npm start

# Terminal 3
cd irdai-local-suite/frontend && npm run dev
```

Or simply re-run `./start.sh` — it detects everything is already
installed and just starts the services.

---

## Stopping Everything

```bash
pkill -f 'node src/server.js'   # stops backend
pkill -f 'vite'                  # stops frontend
# Ollama can be left running — it uses minimal resources when idle.
# To stop it: pkill -f 'ollama serve' (or quit the Ollama desktop app)
```

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| `ollama: command not found` | Reinstall from https://ollama.com/download and restart your terminal |
| Backend shows "Model not found" | Run `ollama pull gemma3:4b` again |
| Scan is very slow (minutes per page) | Expected on CPU-only hardware — Gemma 3 4B on CPU processes roughly 1 page per 30-90 seconds depending on your CPU. This is normal without a GPU |
| Frontend shows "BACKEND UNREACHABLE" | Make sure `npm start` is running in the `backend` folder and didn't crash — check `/tmp/irdai-backend.log` |
| `npx playwright install chromium` fails | Check internet connection — this is one of the one-time downloads that needs it |
| Port 4500 or 5173 already in use | Another process is using that port. Stop it, or change `PORT` in backend `.env` / `vite.config.js` |

---

## Accuracy Note — CPU-Only Local Model vs. Cloud API

This local build uses **Gemma 3 4B**, chosen specifically because it
works reliably on CPU-only hardware without requiring a GPU. Be aware:

- It is meaningfully **less capable** than commercial cloud vision models
  at nuanced visual judgment (e.g., detecting subtle confirm-shaming tone,
  asymmetric button styling, or fine visual hierarchy)
- It is **strong** at reading clear text, detecting obvious pre-ticked
  checkboxes, counting visible UI elements, and following the structured
  severity rulebook
- Treat AI-flagged findings as a **first-pass signal**, and use the
  Manual Review workflow (see the Manual Review tab in the app) for
  pages where you want higher confidence before including a finding in
  your IRDAI submission

---

## Directory Structure

```
irdai-local-suite/
├── start.sh                  ← one-command setup + launch
├── SETUP.md                  ← this file
├── backend/
│   ├── package.json
│   ├── data/irdai.db          ← SQLite database (created on first run)
│   ├── screenshots/           ← captured page screenshots
│   ├── reports/
│   └── src/
│       ├── server.js          ← Express + Socket.io entry point
│       ├── db/database.js     ← SQLite schema
│       ├── routes/            ← API endpoints
│       └── services/          ← crawler, vision (Ollama), severity rules
└── frontend/
    ├── package.json
    ├── index.html
    ├── vite.config.js
    └── src/
        ├── App.jsx
        ├── api/client.js       ← talks to backend on localhost:4500
        ├── pages/              ← NewScan, ScanConsole, ReportDashboard
        └── components/
```

---

## Licensing

The scanner uses offline signed license keys. **No license server, no internet check.**

| Mode | Page limit per scan | How |
|---|---|---|
| Trial (default) | **3 pages** | No key installed — works out of the box |
| Licensed | As set in the key (or unlimited) | Activate a key issued by your License Key Generator app |

### Activating a key

1. Obtain a key from whoever operates the **License Key Generator** app (a separate admin tool — not included in this package).
2. Open the scanner UI → the **License** panel at the top of the New Scan page → **Enter License Key** → paste → **Activate License**.
3. Alternatively, save the key as a plain text file at `backend/data/license.key` and restart the backend.

The License panel shows the licensee name, page limit, and expiry once active. Removing the key reverts to 3-page trial mode.

### How enforcement works

- Page discovery still finds the full site; the scan then processes only the top-priority pages up to your limit (transaction and product pages are prioritised first, so even the 3-page trial scans the highest-risk pages).
- Keys are Ed25519-signed. The scanner holds only the public verification key — keys cannot be created or altered on the scanner side; any tampering fails signature verification.
- Expired keys automatically revert the scanner to trial mode.
