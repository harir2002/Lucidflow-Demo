# Complete Application Analysis  
## IRDAI Local Dark Pattern Scanner (Lucidflow)

**Who this is for:** Developers **and** non-technical readers.  
**Language:** Plain English. Technical file names are included so developers can find the code, but every step is explained in normal words.

This document replaces the older `DARK_PATTERN_LOGIC.md`. It explains the **whole product**: how pages are found, how crawling works, how you can trust what was scanned, how dark patterns are judged, and what each main part of the code does.

---

## Table of contents

1. [What this product does](#1-what-this-product-does)
2. [Simple product journey](#2-simple-product-journey)
3. [How the app finds pages (URL discovery)](#3-how-the-app-finds-pages-url-discovery)
4. [How crawling a page works](#4-how-crawling-a-page-works)
5. [How to trust that URLs were scanned](#5-how-to-trust-that-urls-were-scanned)
6. [How the AI judges dark patterns](#6-how-the-ai-judges-dark-patterns)
7. [Dark pattern rules (all 13) in plain English](#7-dark-pattern-rules-all-13-in-plain-english)
8. [When a human should review](#8-when-a-human-should-review)
9. [What each main code file does](#9-what-each-main-code-file-does)
10. [Frontend screens (what the user sees)](#10-frontend-screens-what-the-user-sees)
11. [Honest limits (what it does not guarantee)](#11-honest-limits-what-it-does-not-guarantee)
12. [Quick FAQ](#12-quick-faq)

---

## 1. What this product does

This is a **local tool** that checks insurance (or similar) websites for **dark patterns** — design tricks that may mislead or pressure customers (fake urgency, hidden charges, pre-ticked add-ons, hard-to-cancel flows, and so on).

It runs on your computers:

| Part | Everyday meaning |
|------|------------------|
| Frontend | The website UI you open in the browser |
| Backend | The engine that finds pages, opens them, calls AI, saves results |
| Local AI (Ollama) | A model on your network that “looks” at the page and suggests findings |
| Database | A local file that stores scan results |
| Screenshots | Saved pictures of each page for the report |

**No cloud AI billing** is required after setup. The only outside traffic needed for a scan is visiting the **target website** you asked to check.

---

## 2. Simple product journey

```
You enter a website address
        ↓
App finds a list of pages to check
        ↓
App opens each page, takes a photo, reads useful page clues
        ↓
Local AI looks for dark patterns
        ↓
Results + screenshots saved
        ↓
You watch progress, then open the report / download PDF
```

In everyday words:

1. **Start** — You type a site URL and click Start Scan.  
2. **Discover** — The app builds a list of pages (from the site’s map, or by following links).  
3. **Prioritize** — Quote/checkout-style pages are preferred; a trial license may only allow a few pages.  
4. **Visit** — Each selected page is opened in a hidden browser.  
5. **Capture** — A screenshot is saved; page clues (prices, checkboxes, popups) are collected.  
6. **Analyze** — Local AI reviews screenshot + clues and returns findings.  
7. **Store** — Risk level, evidence, and tips are saved.  
8. **Show** — Live console, then dashboard and PDF.

---

## 3. How the app finds pages (URL discovery)

**Code:** `backend/src/services/sitemap.js` + start of `scanOrchestrator.js`  
**Fallback:** `crawler.js` → `discoverOnly`

### Path A — Site map (preferred)

Many websites publish a **sitemap** (a list of their pages). The app:

1. Reads **`robots.txt`** and looks for lines starting with `Sitemap:`  
2. Also tries common addresses like `/sitemap.xml` and `/sitemap_index.xml`  
3. Opens those XML files and collects every page link inside `<loc>...</loc>`  
4. If a link points to **another sitemap**, it opens that too (up to 5 levels deep)  
5. Skips junk (images, PDFs, CSS, tracking links, and similar)

**In plain words:** It uses the site’s own published page list when available. That is usually the most complete and trustworthy discovery method.

### Path B — Follow links (fallback)

If no sitemap is found:

1. Opens the starting page in a hidden browser  
2. Collects all same-site links (`<a href>`)  
3. Visits those pages and collects more links  
4. Stops around a safety limit (about **300** pages in the current setup)

**In plain words:** Like a careful visitor clicking internal links and writing down addresses — slower, and it may miss pages that are never linked.

### After discovery

| Step | What happens | Why |
|------|----------------|-----|
| Optional pattern filter | Only keep URLs matching your pattern (e.g. `*quote*`) | You asked to focus |
| Score / sort | Prefer quote, checkout, insurance product pages | Those matter more for dark patterns |
| License cap | Trial often keeps only **3** pages; licensed keys can allow more | Product / license rule |
| Save as PENDING | Every chosen URL is written to the database as “not done yet” | So you can track progress |

**File reference — orchestrator discovery block** (`scanOrchestrator.js` roughly lines 37–77): check AI ready → discover → filter → sort → license cut → save PENDING rows.

---

## 4. How crawling a page works

**Code:** `backend/src/services/crawler.js` → `visitPage`

When the real scan runs (after the URL list is ready), for **each** page the app:

1. **Opens** the page in Chromium (Playwright)  
2. **Waits** briefly and scrolls so lazy content can load  
3. **Takes a screenshot** (full page if not extremely tall; otherwise a tall first screen)  
4. **Reads clues from the page**, such as:  
   - Pre-checked boxes  
   - Countdown / timer elements  
   - Popups / modals  
   - Forms, badges, prices, buttons  
   - Visible text sample  
   - “Step 1/2/3” multi-step hints  
   - Password fields (login wall)  
5. **Collects same-site links** (for discovery mode)  
6. **Returns** URL, title, screenshot path, and those clues  

**What it skips (does not treat as pages):** PDFs, images, scripts, logout links, API paths, asset folders, and similar noise (`SKIP` list at the top of `crawler.js`).

**In plain words:** Crawling here means “open the real page like a browser, photograph it, and note suspicious UI clues,” not “download the whole internet.”

---

## 5. How to trust that URLs were scanned

This is the question people ask most: *“How do I know every important page was really checked?”*

### What you can trust (evidence the app keeps)

| Proof | Where to look | Meaning |
|-------|----------------|---------|
| Discovered count | Scan Console / DB `scans.total_pages` | How many URLs were **selected** for this scan |
| Progress | `scanned_pages` vs `total_pages` | How many of those have been processed |
| Per-page status | Report dashboard / `pages.overall_risk` | `PENDING` not done; `HIGH/MEDIUM/LOW/CLEAN` done; `ERROR` failed |
| Screenshot file | `backend/screenshots/` + UI/PDF | Physical proof the page was opened and captured |
| Findings rows | DB `findings` | What the AI reported for that page |
| Live log | Scan Console messages | “Crawling…”, “Analyzing…”, errors |

**In plain words:** Trust is not a verbal claim — it is **database rows + screenshots + status labels**. If a page shows CLEAN/HIGH/… and a screenshot, it was visited and analyzed. If it stays PENDING or ERROR, it was not successfully completed.

### What “all URLs scanned” really means

Be careful with the phrase “all URLs”:

| Statement | True? |
|-----------|--------|
| All URLs the site has on the internet | **No** — impossible to guarantee |
| All URLs found by sitemap or link crawl for this run | **Mostly yes**, then filtered |
| All URLs after your pattern filter | **Yes** for the filtered list |
| All URLs after license cap (e.g. first 3) | **Only those capped URLs** are scanned |
| Every step of a multi-step quote form | **No** — usually only the landing state is captured |
| Pages behind login | **No** — flagged for manual review |

### How to verify as a reviewer (checklist)

1. Note **total pages** announced when discovery finishes.  
2. Confirm **scanned count** reaches that total (or see ERROR/paused).  
3. Open the **report** — every completed page should have risk + (usually) screenshot.  
4. If trial mode, expect a message that only **N of many** discovered pages were scanned.  
5. Check **manual review** count for pages that need a human walkthrough.

---

## 6. How the AI judges dark patterns

**Code:** `backend/src/services/vision.js` + `severity.js`

### Step by step

1. Screenshot is read from disk and sent to the local AI **together with** page clues (text summary).  
2. The AI is told the **13 dark pattern names** and asked to reply in a fixed JSON format.  
3. For each finding, the app runs a **second check** (`resolveSeverity`):  
   - If the written evidence contains known warning phrases (signals), severity may be forced to HIGH / MEDIUM / LOW by the rule book.  
4. The **page risk** becomes the worst finding on that page (HIGH beats MEDIUM beats LOW). If none found → CLEAN.

### Two brains working together

| Role | Who | Everyday meaning |
|------|-----|------------------|
| Spot the issue | Local AI looking at screenshot + clues | “I see a pre-ticked add-on” |
| Grade the seriousness | Rule book in code (plus AI’s first guess) | “Pre-ticked paid add-on = HIGH” |

---

## 7. Dark pattern rules (all 13) in plain English

**Code source:** `backend/src/services/severity.js` (`SEVERITY_RULES`)

**Severity in normal words:**

- **HIGH** — Serious concern (misleading price, forced guilt, no online cancel, fake urgency)  
- **MEDIUM** — Strong pressure or confusion (OTP before quote, many popups, buried consent)  
- **LOW** — Milder design issue  

Below: what each pattern means, and what the rules watch for.

### 1. False Urgency  
**Meaning:** Pushing you to buy *now* with timers or “only a few left” that may not be real.  
**High:** Fake countdown, “only X left.”  
**Medium:** “People viewing” pressure without proof.  
**Low:** Real renewal reminders that sound urgent but are factual.

### 2. Basket Sneaking  
**Meaning:** Extra paid items or fees slip into the cart quietly.  
**High:** Add-ons already ticked; taxes only appear at the last step.  
**Medium:** Bundled extras without a clear way out.  
**Low:** “Recommended” label but not auto-selected.

### 3. Confirm Shaming  
**Meaning:** Declining something makes you feel guilty or forces a nasty wording.  
**High:** “I agree I am unprotected…” style opt-outs.  
**Medium:** Decline button hard to see.  
**Low:** Soft “maybe later” style.

### 4. Forced Action  
**Meaning:** You must do something unnecessary to get a basic result.  
**High:** Cancel only by phone/branch; app required for claims/docs.  
**Medium:** Phone/OTP or full signup before any price.  
**Low:** Callback form is loud but content is still readable.

### 5. Subscription Trap  
**Meaning:** Easy to start, hard to stop auto-renew.  
**High:** Silent auto-renew; cancel only offline.  
**Medium:** Auto-renew on by default; opt-out buried.  
**Low:** Reminder exists but cancel link is weak.

### 6. Bait & Switch  
**Meaning:** The attractive headline price/coverage is not what you actually get.  
**High:** Price without mandatory PA cover; without GST; “fully covered from day one” if misleading.  
**Medium:** Price only for a narrow vehicle class, not said up front.  
**Low:** Big stats with no time period.

### 7. Drip Pricing  
**Meaning:** Full cost appears late, piece by piece.  
**High:** GST or mandatory PA only at payment.  
**Medium:** Extra fees late; monthly EMI with no total.  
**Low:** “Starting from…” with conditions far away.

### 8. Disguised Ads  
**Meaning:** Ads look like neutral advice.  
**High:** Sponsored plan with no “Ad/Sponsored” label.  
**Medium:** Article-style promo or partner product without clear disclosure.  
**Low:** Unlabeled promo widget.

### 9. Trick Questions  
**Meaning:** Confusing wording so you agree without meaning to.  
**High:** Double negatives; marketing consent already ticked with purchase.  
**Medium:** One click agrees to data sharing; no clear consent box.  
**Low:** Broad “by using this site you agree…” language.

### 10. SaaS Billing  
**Meaning:** Trial then unexpected charge (more common in software, still checked).  
**High:** Charge after trial without clear notice.  
**Medium:** Card saved quietly during free period.  
**Low:** Intro price end date not obvious.

### 11. Rogue Malwares (scare tactics)  
**Meaning:** Fake danger alerts to force a purchase.  
**High:** Fake system security popups; chatbot “your vehicle is unprotected / in immediate danger.”  
**Medium:** Marketing push framed as a risk alert.  
**Low:** Mild “don’t wait / get covered” messaging.

### 12. Nagging  
**Meaning:** Keeps interrupting you after you said no.  
**High:** Popup returns after you close it; forced re-offer scripts.  
**Medium:** Very many popups; exit popup on checkout.  
**Low:** Several popups but not extreme.

### 13. Interface Interference  
**Meaning:** Layout hides important rights (cancel, complain, exclusions).  
**High:** No online cancel; grievance link missing on product/checkout.  
**Medium:** Exclusions behind an extra click; tiny hard-to-read terms.  
**Low:** “Track claim” style buttons weaker than “Buy” buttons.

### How signal matching works (developers + plain explanation)

In code, each rule has short **signal phrases**. After the AI writes **evidence**, the app checks if those phrases appear in the evidence. If a HIGH signal matches, severity becomes HIGH even if the AI said LOW.

**Plain words:** The AI describes what it saw; the rule book double-checks the wording against a fixed dictionary of danger phrases.

---

## 8. When a human should review

**Code:** `backend/src/services/manualReview.js`

The scanner marks a page for **manual review** when:

| Situation | Everyday meaning |
|-----------|------------------|
| Multi-step flow (“Step 1 / 2 / 3”) | Only the first screen was likely captured |
| Login / password field | Content behind login was not fully seen |
| Extremely tall page | Screenshot may be clipped |
| Checkout / payment-style URL | Critical money flow may need a full human walkthrough |

This does **not** invent a dark pattern by itself — it means “don’t rely on automation alone here.”

---

## 9. What each main code file does

### Backend engine

| File | Everyday job | What happens inside (sections) |
|------|--------------|--------------------------------|
| `server.js` | Starts the API and live updates | Opens port 4500; serves screenshots; connects scan rooms for live logs |
| `db/database.js` | Memory of all scans | Creates tables: scans, pages, findings, recommendations, manual queue |
| `routes/scans.js` | Scan buttons & APIs | Create scan, list pages, pause/restart, save manual findings |
| `routes/report.js` | Builds PDF | Cover, page details, screenshots, summary tables |
| `routes/system.js` | “Is AI ready?” | Asks Ollama if the model is available |
| `routes/license.js` | Trial vs paid limits | Install / remove license key |
| `scanOrchestrator.js` | The conductor | Discover → limit → visit each page → AI → save → notify UI |
| `sitemap.js` | Find page list | robots + sitemap XML walker + page scoring |
| `crawler.js` | Open pages | Screenshot, page clues, link collection, discovery crawl |
| `vision.js` | Talk to local AI | Build prompt, send image + text, parse answer, finalize risk |
| `severity.js` | Rule book | 13 patterns, signals, severity override |
| `manualReview.js` | Human-needed flags | Multi-step, login, tall page, checkout URL |
| `license.js` | Page caps | Trial 3 pages; signed key can raise/unlimited |

### Frontend screens

| File | Everyday job |
|------|--------------|
| `App.jsx` | Shell: New Scan / Console / Report tabs; checks AI status every 10s |
| `api/client.js` | Phone book of API addresses (backend URL) |
| `NewScan.jsx` | Start form |
| `ScanConsole.jsx` | Live progress and logs |
| `ReportDashboard.jsx` | Results and screenshots |
| `SystemStatus.jsx` | Green / yellow / red AI readiness |
| `LicensePanel.jsx` | Enter or remove license |

### Orchestrator scan loop (plain English)

In `scanOrchestrator.js`, after discovery:

1. Open one browser for the scan  
2. For each PENDING page:  
   - If paused, wait  
   - Crawl + screenshot  
   - If open failed → mark ERROR  
   - Else ask AI → save findings → maybe queue manual review  
   - Tell the UI “page done”  
3. Close browser → mark complete (or paused if cancelled)

---

## 10. Frontend screens (what the user sees)

1. **New Scan** — Enter URL, optional pattern, start. Status shows if local AI is ready.  
2. **Scan Console** — Progress bar, logs, last pages finished, pause/resume, PDF link.  
3. **Report Dashboard** — Summary counts, pattern frequency, expand each page with screenshot and findings.

Live updates use a socket connection so you do not need to refresh every second.

---

## 11. Honest limits (what it does not guarantee)

Please share this with leadership and interns:

1. **Not every page on a company website** will always be found — only sitemap and/or linked pages (plus filters/caps).  
2. **Login-only and deep multi-step journeys** need human testing.  
3. **AI can miss or mislabel** issues — screenshots + rules help, but human judgment still matters for compliance decisions.  
4. **Trial mode** intentionally scans only a few pages.  
5. **Vision analysis can be slow** on full-page screenshots (minutes per page on slower machines).  
6. Findings are **decision support**, not a final legal certificate by themselves.

---

## 12. Quick FAQ

**Q: Does it scan sub-pages?**  
A: Yes — from sitemap and/or by following same-site links, then ranking and (sometimes) capping the list.

**Q: How do I know a URL was really tested?**  
A: Check page status (not PENDING), presence of screenshot, and findings/summary in the report or database.

**Q: Who decides the dark pattern name?**  
A: Mostly the local AI. Who decides how serious it is? AI first, then the written rule book can correct severity.

**Q: Where do I change the AI server address?**  
A: `backend/src/services/vision.js` — `OLLAMA_HOST` (default is your LAN AI machine).

**Q: Where are the 13 rules written?**  
A: `backend/src/services/severity.js`.

**Q: Is this the same as `ARCHITECTURE.md`?**  
A: `ARCHITECTURE.md` is more technical (ports, APIs, line maps). **This file** is the complete plain-English analysis for everyone.

---

## One-page summary

| Stage | What happens | Main code |
|-------|----------------|-----------|
| Start | User submits URL | Frontend `NewScan` → `routes/scans` |
| Discover | Sitemap or link crawl | `sitemap.js` / `crawler.discoverOnly` |
| Select | Filter, score, license cap | `scanOrchestrator.js` |
| Visit | Open page, screenshot, clues | `crawler.visitPage` |
| Judge | AI + severity rules | `vision.js` + `severity.js` |
| Flag humans | Multi-step / login / tall / checkout | `manualReview.js` |
| Prove | DB statuses + screenshots + report | SQLite + PDF + UI |

---

*This is the complete application analysis in plain English. Keep it updated when discovery limits, pattern rules, or AI mode change.*
