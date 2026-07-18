# SyncDEV

SyncDEV is an interactive web platform designed for students to align their university syllabus with real-world coding milestones. Powered by Supabase auth and an OpenRouter AI tutor, it features outcome tracking, active coding logs, and seamless integrations with GitHub, LeetCode, and Codeforces to keep developer habits alive without distractions.

🚀 **Live Site**: [https://syncdev-workspace.vercel.app](https://syncdev-workspace.vercel.app)

---

## ✨ Key Features

1. **Curriculum Alignment & Outcome Tracking**:
   * Align semester topics with coding targets.
   * Manage Streaks, logged coding hours, and check off topics with a distraction-free tab system.

2. **Interactive AI Cs Tutor (OpenRouter API)**:
   * Ask questions, explore complex structures, and generate roadmaps naturally.
   * Leverages real-time parsing to automatically extract structured JSON roadmaps from conversational chat replies and render interactive nodes on-the-fly.

3. **Database & Auth Integration**:
   * Full session authentication handled securely by Supabase.
   * SPA client-side history router automatically handles route verification and forces login redirects when visiting `/dashboard` unauthenticated.

4. **Custom Platform Connections**:
   * Connect your real GitHub, LeetCode, and Codeforces accounts.
   * Integrates prompts to let you link real usernames and sync stats directly with your database profile.

5. **Premium Dark Glassmorphic Design**:
   * Designed with CSS tokens, fluid layouts, vibrant purple/cyan glows, smooth GSAP visual entries, and custom Lenis scrollbars.

---

## 🛠️ Tech Stack & Design Architecture

* **Frontend Layout**: HTML5, Vanilla CSS, JS ES6 (Single Page Application architecture). Built conforming to **design-taste-frontend** anti-slop guidelines to guarantee high-fidelity custom visual layouts without generic templates.
* **Animation & Motion**: 
  * **GSAP (GreenSock Animation Platform)** & **ScrollTrigger**: Powers the complex element entries, spotlight mouse-track overlays, interactive popups, and section transitions.
  * **Lenis Smooth Scroll**: Provides buttery-smooth momentum scroll mechanics across the entire landing page viewport.
  * **3D Tilt Engine**: Custom mouse-move matrix transformations mapping perspective tilts on elements (like the hero preview panel and credits card).
* **Libraries & Assets**: Tailwind CSS (Utility layout blocks), Lucide (Dynamic icon injections).
* **Database & Authentication**: Supabase PostgreSQL cloud instances with Row-Level Security (RLS) policies.
* **Hosting**: Vercel
* **Serverless Functions**: Vercel Serverless proxy API routing (`api/syncdev-ai.js`) managing OpenRouter LLM requests.

---

## 🚀 Getting Started

### 1. Database Setup
Run the PostgreSQL table definitions and RLS policies from `supabase/schema.sql` inside your Supabase SQL editor.

### 2. Environment Configurations
Configure the following Environment Variables in your Vercel project settings:
* `OPENROUTER_API_KEY`: Your OpenRouter connection key.
* Supabase Client credentials (configured inside `js/index.js` or through environment proxies).

---

## 👥 Credits

Designed & Crafted with ♥ and clean code by **Rehan Ansari** (GitHub: [@rehan-1002](https://github.com/rehan-1002) • LinkedIn: [Rehan Ansari](https://www.linkedin.com/in/rehan-ansari-672a02357/)).
