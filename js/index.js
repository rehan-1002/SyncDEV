// SyncDEV Landing Page & Workspace — Unified JS (SPA)


/* ============================================================
   GSAP REGISTER PLUGINS
   ============================================================ */
if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
  gsap.registerPlugin(ScrollTrigger);
}

/* ============================================================
   LUCIDE ICONS
   ============================================================ */
lucide.createIcons();

/* ============================================================
   SUPABASE BACKEND CLIENT
   ============================================================ */
const SUPABASE_URL  = "https://iwgtmmebiazndzukrrot.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3Z3RtbWViaWF6bmR6dWtycm90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQyNjE1MTQsImV4cCI6MjA5OTgzNzUxNH0.-wQOpCa2pqsxe_2kZxspRKTcSIOVt8uGAifcPi6HcVg";

let supabaseClient = null;
let currentUserId = null;

function initSupabaseClient() {
  if (!window.supabase) { console.error("Supabase SDK not loaded."); return false; }
  try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
  } catch (e) {
    console.error("Supabase Init Error:", e);
    return false;
  }
}
initSupabaseClient();


let _saveTimer = null;
function debouncedSave(fn, delay = 600) {
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(fn, delay);
}

/* ============================================================
   DEFAULT STATE & LOCAL CACHE
   ============================================================ */
const defaultState = {
  user: null,
  streak: 0,
  syllabus: [],
  integrations: {
    github: { connected: false, username: "" },
    leetcode: { connected: false, username: "" },
    codeforces: { connected: false, username: "" }
  },
  codingLog: [],
  weeklyHours: [0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0],
  todos: []
};

let state = null;
try {
  state = JSON.parse(localStorage.getItem('syncdev_state'));
} catch (e) {
  console.warn("SyncDEV: Malformed cache ignored.", e);
}
if (!state || !state.user || !state.user.email || !state.syllabus || !state.todos) {
  state = JSON.parse(JSON.stringify(defaultState));
}

let selectedSubjectId = null;

function saveState() {
  localStorage.setItem('syncdev_state', JSON.stringify(state));
  if (currentUserId) {
    debouncedSave(() => saveStateToSupabase(currentUserId));
  }
}

/* ============================================================
   SUPABASE PERSISTENCE (CLOUD SYNC)
   ============================================================ */
async function saveStateToSupabase(userId) {
  if (!supabaseClient || !userId) return;
  try {
    await supabaseClient.from('profiles').upsert({
      id: userId,
      name: state.user ? state.user.name : '',
      avatar_url: state.user ? state.user.avatar : '',
      streak: state.streak
    }, { onConflict: 'id' });

    await supabaseClient.from('weekly_hours').upsert({
      user_id: userId,
      hours: state.weeklyHours
    }, { onConflict: 'user_id' });

    await supabaseClient.from('integrations').upsert({
      user_id: userId,
      github_connected:     state.integrations.github.connected,
      github_username:      state.integrations.github.username,
      leetcode_connected:   state.integrations.leetcode.connected,
      leetcode_username:    state.integrations.leetcode.username,
      codeforces_connected: state.integrations.codeforces.connected,
      codeforces_username:  state.integrations.codeforces.username
    }, { onConflict: 'user_id' });

    for (const subject of state.syllabus) {
      await supabaseClient.from('subjects').upsert({
        id: subject.id, user_id: userId, name: subject.name, progress: subject.progress
      }, { onConflict: 'id,user_id' });
      for (const chap of subject.chapters) {
        await supabaseClient.from('chapters').upsert({
          id: chap.id, user_id: userId, subject_id: subject.id, name: chap.name
        }, { onConflict: 'id,user_id' });
        for (const topic of chap.topics) {
          await supabaseClient.from('topics').upsert({
            id: topic.id, user_id: userId, chapter_id: chap.id, subject_id: subject.id, name: topic.name, done: topic.done
          }, { onConflict: 'id,user_id' });
        }
      }
    }

    for (const log of state.codingLog) {
      await supabaseClient.from('coding_log').upsert({
        id: log.id, user_id: userId, date_label: log.date, platform: log.platform,
        description: log.desc, duration: log.time
      }, { onConflict: 'id' });
    }

    for (const todo of state.todos) {
      await supabaseClient.from('todos').upsert({
        id: todo.id, user_id: userId, text: todo.text, status: todo.status
      }, { onConflict: 'id' });
    }
  } catch (err) {
    console.warn('SyncDEV Cloud: Save error -', err.message);
  }
}

async function loadUserData(userId) {
  if (!supabaseClient || !userId) return;
  try {
    const { data: profile } = await supabaseClient.from('profiles').select('*').eq('id', userId).single();
    if (profile) {
      state.user = { name: profile.name || '', email: state.user?.email || '', avatar: profile.avatar_url || '' };
      state.streak = profile.streak || 0;
    }

    const { data: wh } = await supabaseClient.from('weekly_hours').select('hours').eq('user_id', userId).single();
    if (wh) state.weeklyHours = wh.hours;

    const { data: integs } = await supabaseClient.from('integrations').select('*').eq('user_id', userId).single();
    if (integs) {
      state.integrations = {
        github:     { connected: integs.github_connected,     username: integs.github_username },
        leetcode:   { connected: integs.leetcode_connected,   username: integs.leetcode_username },
        codeforces: { connected: integs.codeforces_connected, username: integs.codeforces_username }
      };
    }

    const { data: subjects } = await supabaseClient.from('subjects').select('*').eq('user_id', userId).order('created_at');
    if (subjects && subjects.length > 0) {
      const { data: chapters } = await supabaseClient.from('chapters').select('*').eq('user_id', userId);
      const { data: topics }   = await supabaseClient.from('topics').select('*').eq('user_id', userId);
      state.syllabus = subjects.map(s => ({
        id: s.id, name: s.name, progress: s.progress,
        chapters: (chapters || []).filter(c => c.subject_id === s.id).map(c => ({
          id: c.id, name: c.name,
          topics: (topics || []).filter(t => t.chapter_id === c.id).map(t => ({ id: t.id, name: t.name, done: t.done }))
        }))
      }));
    }

    const { data: logs } = await supabaseClient.from('coding_log').select('*').eq('user_id', userId).order('created_at', { ascending: false }).limit(20);
    if (logs && logs.length > 0) {
      state.codingLog = logs.map(l => ({ id: l.id, date: l.date_label, platform: l.platform, desc: l.description, time: l.duration }));
    }

    const { data: todos } = await supabaseClient.from('todos').select('*').eq('user_id', userId).order('created_at');
    if (todos && todos.length > 0) {
      state.todos = todos.map(t => ({ id: t.id, text: t.text, status: t.status }));
    }

    localStorage.setItem('syncdev_state', JSON.stringify(state));
  } catch (err) {
    console.warn('SyncDEV Cloud: Load error -', err.message);
  }
}

/* ============================================================
   LENIS SMOOTH SCROLL (PAUSED IN DASHBOARD)
   ============================================================ */
let lenis = null;

function initLenis() {
  if (lenis) return;
  lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
  });

  function raf(time) {
    if (lenis) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }
  }
  requestAnimationFrame(raf);

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => { if (lenis) lenis.raf(time * 1000); });
  gsap.ticker.lagSmoothing(0);
}

function destroyLenis() {
  if (lenis) {
    lenis.destroy();
    lenis = null;
  }
}

/* ============================================================
   CUSTOM CURSOR
   ============================================================ */
const cursorDot    = document.querySelector('.cursor-dot');
const cursorCircle = document.querySelector('.cursor-circle');
let mouseX = 0, mouseY = 0;
let circleX = 0, circleY = 0;

document.addEventListener('mousemove', (e) => {
  mouseX = e.clientX;
  mouseY = e.clientY;
  cursorDot.style.left = mouseX + 'px';
  cursorDot.style.top  = mouseY + 'px';
});

(function animateCursor() {
  circleX += (mouseX - circleX) * 0.12;
  circleY += (mouseY - circleY) * 0.12;
  cursorCircle.style.left = circleX + 'px';
  cursorCircle.style.top  = circleY + 'px';
  requestAnimationFrame(animateCursor);
})();

function refreshHoverTargets() {
  document.querySelectorAll('.hover-target').forEach(el => {
    el.removeEventListener('mouseenter', addHoverClass);
    el.removeEventListener('mouseleave', removeHoverClass);
    el.addEventListener('mouseenter', addHoverClass);
    el.addEventListener('mouseleave', removeHoverClass);
  });
}
function addHoverClass() { document.body.classList.add('hover-active'); }
function removeHoverClass() { document.body.classList.remove('hover-active'); }
refreshHoverTargets();

/* ============================================================
   SPOTLIGHT
   ============================================================ */
const spotlightInner = document.getElementById('spotlight-inner');
let spotX = 0, spotY = 0;

document.addEventListener('mousemove', (e) => {
  spotX += (e.clientX - spotX) * 0.07;
  spotY += (e.clientY - spotY) * 0.07;
  spotlightInner.style.left = spotX + 'px';
  spotlightInner.style.top  = spotY + 'px';
});

/* ============================================================
   LOADER & ENTRANCE
   ============================================================ */
const loaderBar  = document.getElementById('loader-bar');
const loaderEl   = document.getElementById('loader');
let   loadProgress = 0;

const loadInterval = setInterval(() => {
  loadProgress += Math.random() * 15 + 5;
  if (loadProgress >= 100) {
    loadProgress = 100;
    clearInterval(loadInterval);
    setTimeout(() => {
      gsap.to(loaderEl, {
        opacity: 0,
        duration: 0.6,
        onComplete: () => {
          loaderEl.style.display = 'none';
          checkOnboarding();
        }
      });
    }, 300);
  }
  loaderBar.style.width = loadProgress + '%';
}, 100);

function animateHero() {
  const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });
  tl.from('.status-pill',          { opacity: 0, y: 20,  duration: 0.6 })
    .from('.hero-h1 .block',       { opacity: 0, y: 40,  duration: 0.8, stagger: 0.12 }, '-=0.3')
    .from('.hero-subtext',         { opacity: 0, y: 24,  duration: 0.7 }, '-=0.4')
    .from('.hero-actions',         { opacity: 0, y: 20,  duration: 0.6 }, '-=0.4')
    .from('.hero-social-proof',    { opacity: 0, y: 16,  duration: 0.5 }, '-=0.3')
    .from('.hero-editor-wrap',     { opacity: 0, x: 40,  duration: 0.9, ease: 'power4.out' }, '-=0.7')
    .from('.editor-badge',         { opacity: 0, scale: 0.85, duration: 0.6, stagger: 0.15 }, '-=0.5');
}

/* ============================================================
   SPA CLIENT-SIDE ROUTER
   ============================================================ */
async function route() {
  const isDashboardPath = window.location.pathname === '/dashboard';
  const isUserLoggedIn  = !!currentUserId || (state.user && state.user.email);

  if (isDashboardPath || isUserLoggedIn) {
    destroyLenis();
    document.body.classList.add('dashboard-active');
    
    if (!isUserLoggedIn) {
      showAuthModal();
    }
    
    applyUserProfile();
    updateMetrics();
    renderTodos();
    switchTab('overview');
  } else {
    document.body.classList.remove('dashboard-active');
    initLenis();
    animateHero();
  }
  lucide.createIcons();
  refreshHoverTargets();
  setupTiltCards();
}

function bindLocalLinks() {
  document.addEventListener('click', (e) => {
    const anchor = e.target.closest('a');
    if (!anchor) return;
    
    const href = anchor.getAttribute('href');
    if (href && (href === 'dashboard.html' || href === '/dashboard')) {
      e.preventDefault();
      history.pushState(null, '', '/dashboard');
      route();
    } else if (href && (href === 'index.html' || href === '/')) {
      e.preventDefault();
      history.pushState(null, '', '/');
      route();
    }
  });
}
bindLocalLinks();
window.addEventListener('popstate', route);

/* ============================================================
   SUPABASE SESSION AUTH ENTRIES
   ============================================================ */
async function checkSupabaseSession() {
  if (!supabaseClient) return null;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    return session;
  } catch (err) {
    console.error("Session check error:", err);
    return null;
  }
}

async function checkOnboarding() {
  const session = await checkSupabaseSession();
  if (session && session.user) {
    currentUserId = session.user.id;
    state.user = state.user || {
      name: session.user.user_metadata.full_name || session.user.user_metadata.name || session.user.email.split('@')[0],
      email: session.user.email,
      avatar: session.user.user_metadata.avatar_url || 'https://picsum.photos/seed/student-alex/80/80.jpg'
    };
    await loadUserData(currentUserId);
    route();
  } else {
    if (window.location.pathname === '/dashboard') {
      showAuthModal();
    }
    route();
  }
}

if (supabaseClient) {
  supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      currentUserId = session.user.id;
      const meta = session.user.user_metadata;
      state.user = {
        name: meta.full_name || meta.name || session.user.email.split('@')[0],
        email: session.user.email,
        avatar: meta.avatar_url || 'https://picsum.photos/seed/student-alex/80/80.jpg'
      };
      hideAuthModal();
      await loadUserData(currentUserId);

      if (window.location.pathname !== '/dashboard') {
        history.pushState(null, '', '/dashboard');
      }
      route();
    } else if (event === 'SIGNED_OUT') {
      currentUserId = null;
      state.user = null;
      localStorage.removeItem('syncdev_state');
      showAuthModal();
      route();
    }
  });
}

/* ============================================================
   DASHBOARD TAB AND METRIC SETUP
   ============================================================ */
function switchTab(tabId) {
  document.querySelectorAll('aside nav button').forEach(btn => btn.classList.remove('active', 'text-white', 'bg-white/5'));
  const activeBtn = document.getElementById(`nav-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'text-white', 'bg-white/5');
  }

  const titles = {
    'overview': 'Overview Dashboard',
    'syllabus': 'Syllabus Manager',
    'tracker': 'Code Tracker',
    'analytics': 'Analytics',
    'roadmap': 'AI Planner'
  };
  document.getElementById('current-tab-title').innerText = titles[tabId];

  document.querySelectorAll('.tab-panel').forEach(panel => panel.classList.remove('active'));
  const targetPanel = document.getElementById(`tab-${tabId}`);
  if (targetPanel) targetPanel.classList.add('active');

  if (tabId === 'syllabus') {
    renderSyllabusTab();
  } else if (tabId === 'tracker') {
    renderTrackerTab();
  } else if (tabId === 'analytics') {
    renderAnalyticsTab();
  } else if (tabId === 'roadmap') {
    renderRoadmapTab();
  }
}

function updateMetrics() {
  let totalTopics = 0;
  let completedTopics = 0;
  state.syllabus.forEach(subject => {
    let subTotal = 0;
    let subCompleted = 0;
    subject.chapters.forEach(chap => {
      chap.topics.forEach(t => {
        subTotal++;
        totalTopics++;
        if (t.done) {
          subCompleted++;
          completedTopics++;
        }
      });
    });
    subject.progress = subTotal > 0 ? Math.round((subCompleted / subTotal) * 100) : 0;
  });

  let overallPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;

  const streakEl = document.getElementById('metric-streak');
  const syllabusPctEl = document.getElementById('metric-syllabus-pct');
  const syllabusDescEl = document.getElementById('metric-syllabus-desc');

  if (streakEl) streakEl.innerText = `${state.streak} Days`;
  if (syllabusPctEl) syllabusPctEl.innerText = `${overallPct}%`;
  if (syllabusDescEl) syllabusDescEl.innerText = `${completedTopics}/${totalTopics} topics completed`;

  const circle = document.getElementById('metric-syllabus-circle');
  if (circle) {
    const offset = 125.6 - (overallPct / 100) * 125.6;
    circle.style.strokeDashoffset = offset;
  }

  let totalMins = 0;
  state.codingLog.forEach(log => {
    let mins = 0;
    if (log.time.includes('hr')) {
      const parts = log.time.split('hr');
      mins += parseInt(parts[0]) * 60;
      if (parts[1] && parts[1].includes('min')) {
        mins += parseInt(parts[1].trim());
      }
    } else if (log.time.includes('min')) {
      mins += parseInt(log.time);
    }
    totalMins += mins;
  });
  const hrs = Math.floor(totalMins / 60);
  const remainingMins = totalMins % 60;
  const hoursEl = document.getElementById('metric-hours');
  if (hoursEl) hoursEl.innerText = hrs > 0 ? `${hrs}h ${remainingMins}m` : `${remainingMins}m`;

  const recContainer = document.getElementById('ai-rec-container');
  if (recContainer) {
    if (state.syllabus.length === 0) {
      recContainer.style.display = 'none';
    } else {
      recContainer.style.display = 'block';
    }
  }

  saveState();
}

/* ============================================================
   MODALS AND INTERFACE HANDLERS
   ============================================================ */
function openModal(modalId) {
  const modal = document.getElementById(modalId);
  modal.classList.remove('pointer-events-none');
  gsap.to(modal, { opacity: 1, duration: 0.3, ease: 'power2.out' });
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  gsap.to(modal, { 
    opacity: 0, 
    duration: 0.2, 
    ease: 'power2.in',
    onComplete: () => { modal.classList.add('pointer-events-none'); }
  });
}

function applyUserProfile() {
  if (!state.user) return;
  const sName = document.getElementById('sidebar-user-name');
  const sEmail = document.getElementById('sidebar-user-email');
  const sAvatar = document.getElementById('sidebar-user-avatar');
  if (sName) sName.innerText = state.user.name;
  if (sEmail) sEmail.innerText = state.user.email;
  if (sAvatar) sAvatar.src = state.user.avatar;

  const welcomeName = document.getElementById('welcome-user-name');
  if (welcomeName) welcomeName.innerText = state.user.name;

  const aiWelcomeName = document.getElementById('ai-chat-welcome-name');
  if (aiWelcomeName) aiWelcomeName.innerText = state.user.name;
}

/* ============================================================
   SYLLABUS MANAGER RENDERING
   ============================================================ */
function renderSyllabusTab() {
  const grid = document.getElementById('subject-cards-grid');
  grid.innerHTML = '';

  if (state.syllabus.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full text-center py-12 text-white/30 text-xs flex flex-col items-center gap-3">
        <div class="w-10 h-10 rounded-xl bg-white/[0.01] border border-white/5 flex items-center justify-center text-white/20"><i data-lucide="book-open" class="w-5.5 h-5.5 text-white/20"></i></div>
        <div>
          <p class="font-semibold text-white/70">No subjects found</p>
          <p class="text-[10px] text-white/40 mt-1">Click "Add New Subject" to begin tracking your syllabus.</p>
        </div>
      </div>
    `;
    lucide.createIcons();
    return;
  }

  state.syllabus.forEach(subject => {
    let topicsCount = 0;
    let doneCount = 0;
    subject.chapters.forEach(c => c.topics.forEach(t => {
      topicsCount++;
      if (t.done) doneCount++;
    }));

    const card = document.createElement('div');
    card.className = `glass-panel rounded-2xl p-6 flex flex-col justify-between h-48 hover:bg-white/[0.04] transition-all duration-300 cursor-pointer tilt-card hover-target`;
    card.setAttribute('onclick', `showSubjectDetails('${subject.id}')`);
    card.innerHTML = `
      <div class="tilt-glare"></div>
      <div>
        <div class="flex items-center justify-between mb-3">
          <span class="text-[9px] font-mono text-white/30 uppercase tracking-widest">${topicsCount} Topics</span>
          <div class="w-6 h-6 rounded-lg bg-violet-600/10 border border-violet-500/20 flex items-center justify-center"><i data-lucide="book-open" class="w-3.5 h-3.5 text-violet-400"></i></div>
        </div>
        <h4 class="text-sm font-bold text-white/95 leading-snug">${subject.name}</h4>
      </div>
      <div class="w-full mt-4">
        <div class="flex items-center justify-between text-[10px] text-white/40 mb-1.5">
          <span>Completed</span>
          <span class="font-mono text-white/70">${subject.progress}%</span>
        </div>
        <div class="w-full h-1 bg-white/5 rounded-full overflow-hidden">
          <div class="h-full bg-violet-500 transition-all duration-500" style="width: ${subject.progress}%"></div>
        </div>
      </div>
    `;
    grid.appendChild(card);
  });

  lucide.createIcons();
  refreshHoverTargets();
  setupTiltCards();
}

function showSubjectDetails(subjectId) {
  selectedSubjectId = subjectId;
  const subject = state.syllabus.find(s => s.id === subjectId);
  if (!subject) return;

  const panel = document.getElementById('subject-detail-panel');
  panel.classList.remove('hidden');

  document.getElementById('detail-subject-title').innerText = subject.name;
  
  let topicsCount = 0;
  let doneCount = 0;
  subject.chapters.forEach(c => c.topics.forEach(t => {
    topicsCount++;
    if (t.done) doneCount++;
  }));
  document.getElementById('detail-subject-progress').innerText = `${doneCount}/${topicsCount} topics checked off`;

  const chapContainer = document.getElementById('detail-chapters-list');
  chapContainer.innerHTML = '';

  if (subject.chapters.length === 0) {
    chapContainer.innerHTML = `
      <div class="text-center py-10 text-white/30 text-xs">
        No chapters added yet. Click "Add Chapter" to create your syllabus structure.
      </div>
    `;
    return;
  }

  subject.chapters.forEach(chap => {
    const chapDiv = document.createElement('div');
    chapDiv.className = 'glass-panel rounded-xl p-5 border border-white/5';
    
    let chapTotal = chap.topics.length;
    let chapDone = chap.topics.filter(t => t.done).length;

    let topicsHtml = '';
    chap.topics.forEach(topic => {
      topicsHtml += `
        <div class="flex items-center justify-between py-2 border-b border-white/[0.02] last:border-0">
          <div class="flex items-center gap-3">
            <div class="custom-checkbox ${topic.done ? 'checked' : ''}" onclick="toggleTopic('${subject.id}', '${chap.id}', '${topic.id}')">
              <i data-lucide="check" class="w-2.5 h-2.5"></i>
            </div>
            <span class="text-xs text-white/70 ${topic.done ? 'line-through text-white/30' : ''}">${topic.name}</span>
          </div>
        </div>
      `;
    });

    chapDiv.innerHTML = `
      <div class="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
        <h5 class="text-xs font-bold text-white/80">${chap.name}</h5>
        <span class="text-[10px] font-mono text-white/30">${chapDone}/${chapTotal} Completed</span>
      </div>
      <div class="flex flex-col gap-2">
        ${topicsHtml}
      </div>
    `;
    chapContainer.appendChild(chapDiv);
  });

  lucide.createIcons();
  refreshHoverTargets();
}

function closeSubjectDetails() {
  document.getElementById('subject-detail-panel').classList.add('hidden');
  selectedSubjectId = null;
}

function toggleTopic(subjectId, chapterId, topicId) {
  const subject = state.syllabus.find(s => s.id === subjectId);
  if (!subject) return;
  const chapter = subject.chapters.find(c => c.id === chapterId);
  if (!chapter) return;
  const topic = chapter.topics.find(t => t.id === topicId);
  if (!topic) return;

  topic.done = !topic.done;
  updateMetrics();
  showSubjectDetails(subjectId);
  renderSyllabusTab();
}

function handleSubjectCreate(e) {
  e.preventDefault();
  const input = document.getElementById('subject-name');
  const name = input.value.trim();
  if (!name) return;

  const newId = name.toLowerCase().replace(/[^a-z0-9]/g, '-');
  state.syllabus.push({
    id: newId,
    name: name,
    progress: 0,
    chapters: []
  });

  input.value = '';
  closeModal('modal-subject');
  updateMetrics();
  renderSyllabusTab();
}

function handleChapterCreate(e) {
  e.preventDefault();
  const chapterName = document.getElementById('chapter-name').value.trim();
  const rawTopics = document.getElementById('chapter-topics').value.split(',');
  if (!chapterName || !selectedSubjectId) return;

  const topics = rawTopics.map((t, index) => ({
    id: `topic-${Date.now()}-${index}`,
    name: t.trim(),
    done: false
  })).filter(t => t.name.length > 0);

  const subject = state.syllabus.find(s => s.id === selectedSubjectId);
  if (subject) {
    subject.chapters.push({
      id: `chap-${Date.now()}`,
      name: chapterName,
      topics: topics
    });
  }

  document.getElementById('chapter-name').value = '';
  document.getElementById('chapter-topics').value = '';
  closeModal('modal-chapter');
  updateMetrics();
  showSubjectDetails(selectedSubjectId);
}

/* ============================================================
   TRACKER AND ACTIVITY LOG
   ============================================================ */
function renderTrackerTab() {
  const container = document.getElementById('timeline-container');
  container.innerHTML = '';

  if (state.codingLog.length === 0) {
    container.innerHTML = `
      <div class="text-center py-10 text-white/30 text-xs">
        No activity logged yet. Log coding sessions using the form on the left.
      </div>
    `;
    return;
  }

  state.codingLog.forEach((log, index) => {
    const item = document.createElement('div');
    item.className = 'flex items-start gap-4 pb-6 last:pb-0 relative group';
    
    if (index !== state.codingLog.length - 1) {
      const line = document.createElement('div');
      line.className = 'absolute top-9 left-[17px] bottom-0 w-px bg-white/5 group-hover:bg-violet-500/20 transition-colors';
      item.appendChild(line);
    }

    let iconName = 'code-2';
    let iconColor = 'text-violet-400 bg-violet-600/10 border-violet-500/20';
    if (log.platform === 'github') {
      iconName = 'github';
      iconColor = 'text-blue-400 bg-blue-600/10 border-blue-500/20';
    } else if (log.platform === 'leetcode') {
      iconName = 'terminal';
      iconColor = 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20';
    }

    item.innerHTML += `
      <div class="w-9 h-9 rounded-xl border flex items-center justify-center shrink-0 z-10 ${iconColor}">
        <i data-lucide="${iconName}" class="w-4 h-4"></i>
      </div>
      <div class="flex-grow pt-1.5">
        <div class="flex items-center justify-between gap-4">
          <span class="text-xs font-semibold text-white/90 leading-tight">${log.desc}</span>
          <span class="text-[9px] font-mono text-white/30 whitespace-nowrap">${log.date}</span>
        </div>
        <div class="flex items-center gap-2 mt-1.5">
          <span class="text-[9px] font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded border border-white/5 uppercase">${log.platform}</span>
          <span class="text-[9px] font-mono text-white/40 bg-white/5 px-2 py-0.5 rounded border border-white/5">${log.time} duration</span>
        </div>
      </div>
    `;
    container.appendChild(item);
  });

  lucide.createIcons();
  refreshHoverTargets();
}

function handleLogSession(e) {
  e.preventDefault();
  const platform = document.getElementById('log-platform').value;
  const desc = document.getElementById('log-desc').value.trim();
  const time = document.getElementById('log-duration').value;

  if (!desc) return;

  state.codingLog.unshift({
    id: `log-${Date.now()}`,
    date: "Just Now",
    platform: platform,
    desc: desc,
    time: time
  });

  const today = new Date().getDay();
  const dayIndex = today === 0 ? 6 : today - 1;
  let parsedHrs = 0.5;
  if (time.includes('hr')) {
    const parts = time.split('hr');
    parsedHrs += parseInt(parts[0]);
    if (parts[1] && parts[1].includes('min')) parsedHrs += 0.5;
  }
  state.weeklyHours[dayIndex] = Math.min(8, state.weeklyHours[dayIndex] + parsedHrs);

  document.getElementById('log-desc').value = '';
  updateMetrics();
  renderTrackerTab();
}

async function toggleIntegration(platform) {
  const isConnected = state.integrations[platform].connected;
  if (isConnected) {
    if (!confirm(`Are you sure you want to disconnect your ${platform === 'github' ? 'GitHub' : platform === 'leetcode' ? 'LeetCode' : 'Codeforces'} profile?`)) {
      return;
    }
    state.integrations[platform].connected = false;
    state.integrations[platform].username = "";
  } else {
    const displayName = platform === 'github' ? 'GitHub' : platform === 'leetcode' ? 'LeetCode' : 'Codeforces';
    const username = prompt(`Enter your real ${displayName} username to connect:`);
    if (!username || !username.trim()) return;
    
    state.integrations[platform].connected = true;
    state.integrations[platform].username = username.trim();
  }


  const statusEl = document.getElementById(`status-${platform}`);
  const btnEl = document.getElementById(`btn-${platform}`);

  if (state.integrations[platform].connected) {
    statusEl.innerText = `Connected (@${state.integrations[platform].username})`;
    statusEl.className = "text-[9px] font-mono text-green-400";
    btnEl.innerText = "Disconnect";
    btnEl.className = "text-[10px] font-bold tracking-wider uppercase text-red-400/80 hover:text-red-400 transition-colors hover-target";
  } else {
    statusEl.innerText = "Not Connected";
    statusEl.className = "text-[9px] font-mono text-white/30";
    btnEl.innerText = "Connect";
    btnEl.className = "text-[10px] font-bold tracking-wider uppercase text-violet-400 hover:text-violet-300 transition-colors hover-target";
  }


  if (currentUserId) {
    await saveStateToSupabase(currentUserId);
  }

  updateMetrics();
  refreshHoverTargets();
}

/* ============================================================
   ANALYTICS CHART
   ============================================================ */
function renderAnalyticsTab() {
  const container = document.getElementById('analytics-bar-chart');
  container.innerHTML = '';

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  state.weeklyHours.forEach((hours, index) => {
    const height = Math.max(10, Math.round((hours / 8) * 120));
    const colorClass = hours > 0 ? 'bg-violet-600 hover:shadow-[0_0_10px_rgba(124,58,237,0.4)]' : 'bg-violet-600/20';

    const bar = document.createElement('div');
    bar.className = 'flex flex-col items-center gap-2 flex-grow max-w-[40px]';
    bar.innerHTML = `
      <div class="w-2.5 ${colorClass} rounded-full transition-all duration-500" style="height: ${height}px;" title="${hours} hours logged"></div>
      <span class="text-[9px] font-mono text-white/30">${days[index]}</span>
    `;
    container.appendChild(bar);
  });
}

/* ============================================================
   AI RECOMMENDATIONS
   ============================================================ */
function acceptAiRecommendation() {
  const os = state.syllabus.find(s => s.id === 'os');
  if (os) {
    const cpuChap = os.chapters.find(c => c.name.includes('CPU Scheduling'));
    if (cpuChap) {
      cpuChap.topics.forEach(t => t.done = true);
    }
  }

  state.codingLog.unshift({
    id: `log-${Date.now()}`,
    date: "Just Now",
    platform: "leetcode",
    desc: "Solved 'Task Scheduler' (Medium): OS CPU Algorithms Synced",
    time: "1 hr"
  });

  const today = new Date().getDay();
  const dayIndex = today === 0 ? 6 : today - 1;
  state.weeklyHours[dayIndex] = Math.min(8, state.weeklyHours[dayIndex] + 1);

  dismissAiRecommendation();
  updateMetrics();
}

function dismissAiRecommendation() {
  const rec = document.getElementById('ai-rec-container');
  gsap.to(rec, {
    opacity: 0, height: 0, marginBottom: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0,
    duration: 0.4, ease: 'power3.inOut',
    onComplete: () => { rec.style.display = 'none'; }
  });
}

/* ============================================================
   PROFILE MANAGEMENT
   ============================================================ */
const avatarSeeds = {
  'av1': 'https://picsum.photos/seed/student-alex/80/80.jpg',
  'av2': 'https://picsum.photos/seed/student-sarah/80/80.jpg',
  'av3': 'https://picsum.photos/seed/student-priya/80/80.jpg',
  'av4': 'https://picsum.photos/seed/student-bob/80/80.jpg'
};
let selectedEditAvatarSeed = 'av1';

function openProfileSettingsModal() {
  if (!state.user) return;
  document.getElementById('edit-profile-name').value = state.user.name;
  document.getElementById('edit-profile-email').value = state.user.email;
  
  let matchedSeed = null;
  for (const [seed, url] of Object.entries(avatarSeeds)) {
    if (state.user.avatar === url) { matchedSeed = seed; break; }
  }
  
  document.querySelectorAll('.avatar-edit-option div').forEach(div => div.classList.add('opacity-0'));
  if (matchedSeed) {
    selectedEditAvatarSeed = matchedSeed;
    document.getElementById(`check-edit-${matchedSeed}`).classList.remove('opacity-0');
    document.getElementById('edit-profile-avatar-custom').value = '';
  } else {
    selectedEditAvatarSeed = null;
    document.getElementById('edit-profile-avatar-custom').value = state.user.avatar;
  }
  openModal('modal-profile-settings');
}

function selectEditAvatar(avatarId) {
  selectedEditAvatarSeed = avatarId;
  document.querySelectorAll('.avatar-edit-option div').forEach(div => div.classList.add('opacity-0'));
  document.getElementById(`check-edit-${avatarId}`).classList.remove('opacity-0');
  document.getElementById('edit-profile-avatar-custom').value = '';
}

function handleProfileSettingsSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('edit-profile-name').value.trim();
  const email = document.getElementById('edit-profile-email').value.trim();
  const customUrl = document.getElementById('edit-profile-avatar-custom').value.trim();
  const avatarUrl = customUrl || avatarSeeds[selectedEditAvatarSeed] || state.user.avatar;
  
  state.user.name = name;
  state.user.email = email;
  state.user.avatar = avatarUrl;
  
  applyUserProfile();
  updateMetrics();
  closeModal('modal-profile-settings');

  if (supabaseClient && currentUserId) {
    supabaseClient.from('profiles').upsert({ id: currentUserId, name, avatar_url: avatarUrl }).then(({ error }) => {
      if (error) console.warn('Profile save error:', error.message);
    });
  }
}

/* ============================================================
   AUTHENTICATION FORMS (Magic Link, Email, GitHub Config)
   ============================================================ */
function showAuthModal() {
  const modal = document.getElementById('modal-onboarding');
  if (!modal) return;
  modal.classList.remove('pointer-events-none');
  modal.style.pointerEvents = 'auto';
  gsap.to(modal, { opacity: 1, duration: 0.5, ease: 'power2.out' });
}

function hideAuthModal() {
  const modal = document.getElementById('modal-onboarding');
  if (!modal) return;
  modal.classList.add('pointer-events-none');
  modal.style.pointerEvents = 'none';
  gsap.to(modal, { opacity: 0, duration: 0.4, ease: 'power2.in', onComplete: () => {
    modal.style.opacity = '0';
  }});
}

function switchAuthTab(tab) {
  const loginTab  = document.getElementById('auth-tab-login');
  const signupTab = document.getElementById('auth-tab-signup');
  const loginForm  = document.getElementById('auth-form-login');
  const signupForm = document.getElementById('auth-form-signup');
  if (tab === 'login') {
    loginTab.classList.add('text-white', 'border-b-2', 'border-violet-500');
    loginTab.classList.remove('text-white/40');
    signupTab.classList.remove('text-white', 'border-b-2', 'border-violet-500');
    signupTab.classList.add('text-white/40');
    loginForm.classList.remove('hidden');
    signupForm.classList.add('hidden');
  } else {
    signupTab.classList.add('text-white', 'border-b-2', 'border-violet-500');
    signupTab.classList.remove('text-white/40');
    loginTab.classList.remove('text-white', 'border-b-2', 'border-violet-500');
    loginTab.classList.add('text-white/40');
    signupForm.classList.remove('hidden');
    loginForm.classList.add('hidden');
  }
}

function setAuthStatus(msg, isError = false, form = 'login') {
  const el = document.getElementById(`auth-status-msg-${form}`);
  if (!el) return;
  el.textContent = msg;
  el.className = `text-[11px] text-center mt-1 ${isError ? 'text-red-400' : 'text-green-400'}`;
}

async function handleSignUp(e) {
  e.preventDefault();
  const name  = document.getElementById('signup-name').value.trim();
  const email = document.getElementById('signup-email').value.trim();
  const pass  = document.getElementById('signup-password').value;
  const btn   = document.getElementById('btn-signup');

  if (!name || !email || !pass) return;
  if (pass.length < 6) { setAuthStatus('Password must be at least 6 characters.', true, 'signup'); return; }

  btn.disabled = true;
  btn.textContent = 'Creating account...';
  setAuthStatus('', false, 'signup');

  try {
    const { data, error } = await supabaseClient.auth.signUp({
      email, password: pass,
      options: {
        data: { full_name: name },
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
    if (data.user && !data.session) {
      setAuthStatus('✉️ Confirmation email sent! Check your inbox.', false, 'signup');
      btn.textContent = 'Email Sent!';
    } else {
      setAuthStatus('Account created! Loading workspace...', false, 'signup');
    }
  } catch (err) {
    setAuthStatus(err.message, true, 'signup');
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const pass  = document.getElementById('login-password').value;
  const btn   = document.getElementById('btn-login');

  if (!email || !pass) return;

  btn.disabled = true;
  btn.textContent = 'Signing in...';
  setAuthStatus('', false, 'login');

  try {
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password: pass });
    if (error) throw error;
  } catch (err) {
    setAuthStatus(err.message, true, 'login');
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
}

async function handleGitHubLogin(e) {
  if (e) e.preventDefault();
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.auth.signInWithOAuth({
      provider: 'github',
      options: { redirectTo: window.location.origin + window.location.pathname }
    });
    if (error) throw error;
  } catch (err) {
    setAuthStatus('GitHub login error: ' + err.message, true, 'login');
  }
}

async function handleLogOut(e) {
  if (e) e.preventDefault();
  if (supabaseClient) {
    try { await supabaseClient.auth.signOut(); } catch(err) { console.error(err); }
  }
  currentUserId = null;
  state.user = null;
  localStorage.removeItem('syncdev_state');
  
  history.pushState(null, '', '/');
  route();
}

/* ============================================================
   TODOS / TASK MANAGER
   ============================================================ */
function renderTodos() {
  const container = document.getElementById('todo-items-list');
  if (!container) return;
  container.innerHTML = '';
  
  if (!state.todos || state.todos.length === 0) {
    container.innerHTML = `
      <div class="text-center py-6 text-white/20 text-xs">
        No tasks found. Add a task above to get started!
      </div>
    `;
    return;
  }
  
  state.todos.forEach(todo => {
    const item = document.createElement('div');
    item.className = 'flex items-center justify-between p-3 rounded-xl bg-white/[0.02] border border-white/5 hover:bg-white/[0.04] transition-all duration-200';
    
    let statusText = 'Undone';
    let statusClass = 'bg-blue-500/10 border-blue-500/20 text-blue-400';
    let textClass = 'text-white/80';
    
    if (todo.status === 'undergoing') {
      statusText = 'Undergoing';
      statusClass = 'bg-orange-500/10 border-orange-500/20 text-orange-400';
      textClass = 'text-white/90';
    } else if (todo.status === 'done') {
      statusText = 'Done';
      statusClass = 'bg-green-500/10 border-green-500/20 text-green-400';
      textClass = 'line-through text-white/30';
    }
    
    item.innerHTML = `
      <span class="text-xs font-medium leading-relaxed truncate max-w-[200px] md:max-w-[250px] ${textClass}">${todo.text}</span>
      <div class="flex items-center gap-3 shrink-0">
        <button onclick="toggleTodoStatus('${todo.id}')" class="px-2.5 py-1 rounded-full border text-[9px] font-bold tracking-wider uppercase transition-all duration-300 hover-target ${statusClass}">
          ${statusText}
        </button>
        <button onclick="deleteTodo('${todo.id}')" class="p-1 text-white/30 hover:text-red-400 transition-colors hover-target" title="Delete Task">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    `;
    container.appendChild(item);
  });
  
  lucide.createIcons();
  refreshHoverTargets();
}

function handleAddTodo(e) {
  e.preventDefault();
  const input = document.getElementById('todo-text-input');
  const text = input.value.trim();
  if (!text) return;
  
  if (!state.todos) state.todos = [];
  state.todos.push({ id: `todo-${Date.now()}`, text: text, status: 'undone' });
  
  input.value = '';
  saveState();
  renderTodos();
}

function toggleTodoStatus(todoId) {
  const todo = state.todos.find(t => t.id === todoId);
  if (!todo) return;
  
  if (todo.status === 'undone') {
    todo.status = 'undergoing';
  } else if (todo.status === 'undergoing') {
    todo.status = 'done';
  } else {
    todo.status = 'undone';
  }
  
  saveState();
  renderTodos();
}

function deleteTodo(todoId) {
  state.todos = state.todos.filter(t => t.id !== todoId);
  saveState();
  renderTodos();
  if (supabaseClient && currentUserId) {
    supabaseClient.from('todos').delete().eq('id', todoId).eq('user_id', currentUserId)
      .then(({ error }) => { if (error) console.warn('Todo delete error:', error.message); });
  }
}

function triggerSync() {
  const spinner = document.getElementById('sync-spinner');
  gsap.to(spinner, { rotate: 360, duration: 1, ease: 'power2.inOut', onComplete: () => {
    spinner.style.transform = 'rotate(0deg)';
    alert('SyncDEV: Study alignment algorithms checked. No drift detected!');
  }});
}

/* ============================================================
   AI ROADMAP CONSULTATION PLANNER
   ============================================================ */
let activeRoadmap = null;
let chatHistoryMessages = [];
let interviewData = { path: "Fullstack", experience: "Intermediate", commitment: "3 Months" };

const roadmapTemplates = {
  frontend: {
    id: "ai-frontend-roadmap",
    name: "AI: Frontend Developer",
    pace: "3 Months • Synced",
    description: "Master React, CSS architecture, and API integration, synced with database theory.",
    chapters: [
      {
        id: "fr-chap-1",
        name: "Stage 1: UI Foundation & CSS Design",
        topics: [
          { id: "fr-t1", name: "Semantic HTML5 structures & Accessibility (WCAG)", done: false },
          { id: "fr-t2", name: "Modern Flexbox & CSS Grid layouts", done: false },
          { id: "fr-t3", name: "Tailwind CSS configuration & utility patterns", done: false }
        ]
      },
      {
        id: "fr-chap-2",
        name: "Stage 2: JavaScript DOM & Async Execution",
        topics: [
          { id: "fr-t4", name: "DOM manipulation & event propagation models", done: false },
          { id: "fr-t5", name: "Promises, async/await, and API integration", done: false },
          { id: "fr-t6", name: "LeetCode: Two Sum (Map hashing structures)", done: false }
        ]
      },
      {
        id: "fr-chap-3",
        name: "Stage 3: React & Component State",
        topics: [
          { id: "fr-t7", name: "Component rendering, props, and custom hooks", done: false },
          { id: "fr-t8", name: "Global state manager context / Redux Toolkit", done: false },
          { id: "fr-t9", name: "Sync concepts: Linking UI components with mock DB storage", done: false }
        ]
      },
      {
        id: "fr-chap-4",
        name: "Stage 4: Web Application Project Delivery",
        topics: [
          { id: "fr-t10", name: "Design a fully responsive user portal", done: false },
          { id: "fr-t11", name: "Connect with mock CRUD services & local databases", done: false },
          { id: "fr-t12", name: "Host codebase on GitHub Pages & configure build scripts", done: false }
        ]
      }
    ]
  },
  backend: {
    id: "ai-backend-roadmap",
    name: "AI: Backend & Systems Engineer",
    pace: "4 Months • Synced with DBMS",
    description: "Master runtime systems, databases, server design, caching, and queues.",
    chapters: [
      {
        id: "bk-chap-1",
        name: "Stage 1: Runtime Engine & Express Server",
        topics: [
          { id: "bk-t1", name: "Node.js asynchronous event loops & callbacks", done: false },
          { id: "bk-t2", name: "Create RESTful API routers using Express", done: false },
          { id: "bk-t3", name: "Request validation & custom authentication middleware", done: false }
        ]
      },
      {
        id: "bk-chap-2",
        name: "Stage 2: Relational Databases & Schema Design",
        topics: [
          { id: "bk-t4", name: "DBMS Sync: SQL Schema definition & primary/foreign keys", done: false },
          { id: "bk-t5", name: "Database normalization theory (1NF, 2NF, 3NF, BCNF)", done: false },
          { id: "bk-t6", name: "Write complex INNER JOINS & subqueries", done: false }
        ]
      },
      {
        id: "bk-chap-3",
        name: "Stage 3: Caching & Message Distribution",
        topics: [
          { id: "bk-t7", name: "Implement fast Redis in-memory cache layers", done: false },
          { id: "bk-t8", name: "Create async processing queues with BullMQ", done: false },
          { id: "bk-t9", name: "LeetCode: LRU Cache (Hashmap + Double Linked List)", done: false }
        ]
      },
      {
        id: "bk-chap-4",
        name: "Stage 4: System Architecture Deploy",
        topics: [
          { id: "bk-t10", name: "Dockerize server applications & database scripts", done: false },
          { id: "bk-t11", name: "Deploy Node cluster instances & load balancers", done: false }
        ]
      }
    ]
  },
  dsa: {
    id: "ai-dsa-roadmap",
    name: "AI: DSA & Interview Prep",
    pace: "2 Months • Synced with DSA",
    description: "Master foundational and advanced structures alongside LeetCode problems.",
    chapters: [
      {
        id: "ds-chap-1",
        name: "Stage 1: Linear Arrays & Search Algorithms",
        topics: [
          { id: "ds-t1", name: "Time & Space complexity analysis (Big-O)", done: false },
          { id: "ds-t2", name: "Sliding window technique & Two-pointer strategies", done: false },
          { id: "ds-t3", name: "LeetCode: Binary Search & Valid Parentheses", done: false }
        ]
      },
      {
        id: "ds-chap-2",
        name: "Stage 2: Trees & Recursive Traversal",
        topics: [
          { id: "ds-t4", name: "Syllabus Sync: Binary Trees, BSTs, & AVL balancing", done: false },
          { id: "ds-t5", name: "Recursive traversals (Preorder, Inorder, Postorder)", done: false },
          { id: "ds-t6", name: "LeetCode: Maximum Depth & Invert Binary Tree", done: false }
        ]
      },
      {
        id: "ds-chap-3",
        name: "Stage 3: Graphs & Search Path Traversals",
        topics: [
          { id: "ds-t7", name: "Syllabus Sync: Adjacency list/matrix structures", done: false },
          { id: "ds-t8", name: "BFS & DFS graph searches, Topological Sort", done: false },
          { id: "ds-t9", name: "LeetCode: Clone Graph & Number of Islands", done: false }
        ]
      },
      {
        id: "ds-chap-4",
        name: "Stage 4: Dynamic Programming & Optimization",
        topics: [
          { id: "ds-t10", name: "Memoization vs. Tabulation methodologies", done: false },
          { id: "ds-t11", name: "LeetCode: Climbing Stairs & House Robber", done: false }
        ]
      }
    ]
  },
  gamedev: {
    id: "ai-gamedev-roadmap",
    name: "AI: Game Development in Python",
    pace: "3 Months • Synced with OOP & OS",
    description: "Master object-oriented programming, game physics, and core runtime systems.",
    chapters: [
      {
        id: "gd-chap-1",
        name: "Stage 1: Python OOP & Game Loops",
        topics: [
          { id: "gd-t1", name: "Classes, inheritance, and object blueprints in Python", done: false },
          { id: "gd-t2", name: "Pygame surface configurations & frame-rate loops", done: false }
        ]
      },
      {
        id: "gd-chap-2",
        name: "Stage 2: Physics, Vectors & Input Controls",
        topics: [
          { id: "gd-t3", name: "Vector mathematics for movement & friction", done: false },
          { id: "gd-t4", name: "Keyboard & mouse controller polling listeners", done: false },
          { id: "gd-t5", name: "AABB bounding box collision algorithms", done: false }
        ]
      },
      {
        id: "gd-chap-3",
        name: "Stage 3: Systems Management (Memory & OS Sync)",
        topics: [
          { id: "gd-t6", name: "Entity-Component systems & garbage collection parameters", done: false },
          { id: "gd-t7", name: "Sync concept: Process threads for multi-threaded asset loaders", done: false }
        ]
      },
      {
        id: "gd-chap-4",
        name: "Stage 4: Game Architecture Launch",
        topics: [
          { id: "gd-t8", name: "Design a playable platformer project with states", done: false },
          { id: "gd-t9", name: "Package python binaries & distribute to GitHub repository", done: false }
        ]
      }
    ]
  },
  fullstack: {
    id: "ai-fullstack-roadmap",
    name: "AI: Fullstack Engineer",
    pace: "3 Months • Synced",
    description: "Learn client interfaces, database integrations, and server structures.",
    chapters: [
      {
        id: "fs-chap-1",
        name: "Stage 1: Frontend Interface",
        topics: [
          { id: "fs-t1", name: "Semantic HTML5, CSS layout grids, & Tailwind styling", done: false },
          { id: "fs-t2", name: "JavaScript events, Fetch API, & DOM controls", done: false }
        ]
      },
      {
        id: "fs-chap-2",
        name: "Stage 2: Database Systems & Logic",
        topics: [
          { id: "fs-t3", name: "DBMS Sync: Normalization schemas & SQL JOIN queries", done: false },
          { id: "fs-t4", name: "Express node server REST controllers", done: false }
        ]
      },
      {
        id: "fs-chap-3",
        name: "Stage 3: Fullstack Connection",
        topics: [
          { id: "fs-t5", name: "Handling CORS, Session cookies, & JWT authentication", done: false },
          { id: "fs-t6", name: "LeetCode: Solve 'Two Sum' & 'Valid Parentheses'", done: false }
        ]
      }
    ]
  }
};

function renderRoadmapTab() {
  lucide.createIcons();
  refreshHoverTargets();
}

function parseRoadmapFromJson(text) {
  const codeBlockMatch = text.match(/```json\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch) {
    try { return JSON.parse(codeBlockMatch[1].trim()); } catch(e) {}
  }
  const simpleBlockMatch = text.match(/```\s*([\s\S]*?)\s*```/i);
  if (simpleBlockMatch) {
    try { return JSON.parse(simpleBlockMatch[1].trim()); } catch(e) {}
  }
  try { return JSON.parse(text.trim()); } catch(e) {}
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    try { return JSON.parse(text.slice(firstBrace, lastBrace + 1).trim()); } catch(e) {}
  }
  return null;
}

function generateDetailedRoadmapOffline(query) {
  const originalPath = interviewData.path;
  const originalExp = interviewData.experience;
  const originalCommit = interviewData.commitment;

  interviewData = {
    path: query,
    experience: "Intermediate",
    commitment: "3 Months • Balanced Pace"
  };

  const map = generateDetailedRoadmap();
  
  interviewData = {
    path: originalPath,
    experience: originalExp,
    commitment: originalCommit
  };

  return {
    reply: `I have compiled an offline study plan for **${query}**! (Vercel proxy returned an error). Click import to save it to your workspace.`,
    roadmap: map
  };
}

function handleRoadmapPrompt(e) {
  e.preventDefault();
  const inputEl = document.getElementById('roadmap-user-input');
  const query = inputEl.value.trim();
  if (!query) return;

  inputEl.value = '';

  const chatHistory = document.getElementById('roadmap-chat-history');
  const userBubble = document.createElement('div');
  userBubble.className = 'flex items-start gap-3 justify-end max-w-[85%] ml-auto';
  userBubble.innerHTML = `
    <div class="bg-violet-600 text-white rounded-2xl rounded-tr-none p-3.5 leading-relaxed">
      ${query}
    </div>
  `;
  chatHistory.appendChild(userBubble);
  chatHistory.scrollTop = chatHistory.scrollHeight;


  chatHistoryMessages.push({ role: "user", content: query });


  const loadingBubble = document.createElement('div');
  loadingBubble.className = 'flex items-start gap-3 max-w-[85%]';
  loadingBubble.id = 'ai-loading-bubble';
  loadingBubble.innerHTML = `
    <div class="w-6 h-6 rounded-full bg-violet-600/10 border border-violet-500/20 flex items-center justify-center shrink-0 text-[10px] text-violet-400 font-bold">AI</div>
    <div class="bg-white/[0.03] border border-white/5 rounded-2xl rounded-tl-none p-3.5 leading-relaxed text-white/50 flex items-center gap-1.5">
      <span id="ai-loading-text">Assistant is thinking</span>
      <span class="w-1.5 h-1.5 rounded-full bg-violet-500 animate-ping"></span>
    </div>
  `;
  chatHistory.appendChild(loadingBubble);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  const fetchAIResponse = async () => {
    let modelReply = "";
    let customRoadmap = null;

    try {
      const response = await fetch('/api/syncdev-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatHistoryMessages })
      });

      if (!response.ok) {
        throw new Error(`Server returned status ${response.status}`);
      }

      const data = await response.json();
      modelReply = data.reply || "";

    } catch (err) {
      console.warn("Vercel AI Proxy failed, falling back to dynamic offline response...", err);
      const mockResult = generateDetailedRoadmapOffline(query);
      modelReply = mockResult.reply;
      customRoadmap = mockResult.roadmap;
    }


    loadingBubble.remove();


    if (modelReply && !customRoadmap) {
      customRoadmap = parseRoadmapFromJson(modelReply);
      if (customRoadmap) {

        modelReply = modelReply.replace(/```json\s*([\s\S]*?)\s*```/i, '').trim();
        modelReply = modelReply.replace(/```\s*([\s\S]*?)\s*```/i, '').trim();
      }
    }

    if (!modelReply.trim()) {
      modelReply = "I have compiled and structured your study roadmap! Check out the interactive stages and chapters on the right side.";
    }


    chatHistoryMessages.push({ role: "assistant", content: modelReply });


    const aiBubble = document.createElement('div');
    aiBubble.className = 'flex items-start gap-3 max-w-[85%]';
    aiBubble.innerHTML = `
      <div class="w-6 h-6 rounded-full bg-violet-600/10 border border-violet-500/20 flex items-center justify-center shrink-0 text-[10px] text-violet-400 font-bold">AI</div>
      <div class="bg-white/[0.03] border border-white/5 rounded-2xl rounded-tl-none p-3.5 leading-relaxed text-white/70">
        ${modelReply.replace(/\n/g, '<br>')}
      </div>
    `;
    chatHistory.appendChild(aiBubble);
    chatHistory.scrollTop = chatHistory.scrollHeight;


    if (customRoadmap) {
      document.getElementById('roadmap-blank-state').classList.add('hidden');
      document.getElementById('roadmap-content-state').classList.add('hidden');
      
      const compilerState = document.getElementById('roadmap-compiling-state');
      compilerState.classList.remove('hidden');

      const logContainer = document.getElementById('compiler-log');
      logContainer.innerHTML = '';

      const progressBar = document.getElementById('compiler-progress-bar');
      progressBar.style.width = '0%';

      const compileLogs = [
        "Connecting to OpenRouter node...",
        "Receiving structured curriculum parameters...",
        "Validating chapter constraints and schemas...",
        "Staging topics and active LeetCode algorithms...",
        "Building interactive nodes...",
        "Compilation complete!"
      ];

      let logStep = 0;
      const interval = setInterval(() => {
        if (logStep < compileLogs.length) {
          const timestamp = new Date().toLocaleTimeString();
          const logDiv = document.createElement('div');
          logDiv.className = 'text-white/50 hover:text-white/80 transition-colors duration-150 py-0.5';
          logDiv.innerHTML = `<span class="text-violet-400 font-medium">[${timestamp}]</span> <span class="text-cyan-500 font-bold">></span> ${compileLogs[logStep]}`;
          logContainer.appendChild(logDiv);
          logContainer.scrollTop = logContainer.scrollHeight;

          const pct = Math.round(((logStep + 1) / compileLogs.length) * 100);
          progressBar.style.width = pct + '%';
          logStep++;
        } else {
          clearInterval(interval);
          compilerState.classList.add('hidden');
          finishCompilation(customRoadmap);
        }
      }, 250);
    }
  };

  fetchAIResponse();
}

function generateDetailedRoadmap() {
  const path = interviewData.path.trim();
  const pathLower = path.toLowerCase();
  const level = interviewData.experience.toLowerCase();
  const commitment = interviewData.commitment.toLowerCase();

  let type = "custom";
  let title = `${path} Plan`;

  if (pathLower.includes("front") || pathLower.includes("react") || pathLower.includes("web") || pathLower.includes("html") || pathLower.includes("css") || pathLower.includes("js")) {
    type = "frontend";
    title = "Frontend Developer Plan";
  } else if (pathLower.includes("back") || pathLower.includes("node") || pathLower.includes("sql") || pathLower.includes("dbms") || pathLower.includes("database")) {
    type = "backend";
    title = "Backend & Systems Plan";
  } else if (pathLower.includes("dsa") || pathLower.includes("algo") || pathLower.includes("leet") || pathLower.includes("interview") || pathLower.includes("structure")) {
    type = "dsa";
    title = "DSA & Interview Prep";
  } else if (pathLower.includes("game") || pathLower.includes("pygame") || pathLower.includes("unity") || pathLower.includes("unreal")) {
    type = "gamedev";
    title = "Game Developer Plan";
  } else if (pathLower.includes("full") || pathLower.includes("stack") || pathLower.includes("fullstack") || pathLower.includes("app")) {
    type = "fullstack";
    title = "Fullstack Developer Plan";
  }

  let difficulty = "Intermediate";
  if (level.includes("begin") || level.includes("noob") || level.includes("start") || level.includes("fresh") || level.includes("basic")) {
    difficulty = "Beginner";
  } else if (level.includes("adv") || level.includes("expert") || level.includes("pro") || level.includes("high")) {
    difficulty = "Advanced";
  }

  let paceText = "3 Months • Custom Pacings";
  if (commitment.includes("5") || commitment.includes("10") || commitment.includes("casual") || commitment.includes("low") || commitment.includes("slow")) {
    paceText = "6 Months • Balanced Pace";
  } else if (commitment.includes("20") || commitment.includes("intensive") || commitment.includes("high") || commitment.includes("fast") || commitment.includes("daily")) {
    paceText = "1.5 Months • Intensive Pace";
  }

  let chapters = [];

  if (difficulty === "Beginner") {
    chapters.push({
      id: "ai-chap-foundation",
      name: "Stage 0: Programming Fundamentals & Setup",
      topics: [
        { id: "ai-t-f1", name: "Understanding computer logic, interpreters, compilers, & runtimes", done: false },
        { id: "ai-t-f2", name: "Setting up Visual Studio Code, Git terminal environments, & configurations", done: false },
        { id: "ai-t-f3", name: "Basic programming constructs (Variables, Conditions, Loops, Arrays)", done: false },
        { id: "ai-t-f4", name: "Writing simple custom algorithms, functions, & logical debugging processes", done: false }
      ]
    });
  }

  if (type === "frontend") {
    chapters.push({
      id: "ai-fr-1",
      name: "Stage 1: Web Interface & CSS Layout Architectures",
      topics: [
        { id: "ai-fr-t1", name: "Semantic HTML5 layout structures & Accessibility guidelines (WCAG standards)", done: false },
        { id: "ai-fr-t2", name: "Responsive modern interfaces: CSS Flexbox & Grid coordinate layouts", done: false },
        { id: "ai-fr-t3", name: "Tailwind CSS setup: custom configurations, directives, & utility workflow rules", done: false }
      ]
    });
    chapters.push({
      id: "ai-fr-2",
      name: "Stage 2: JavaScript DOM & Async Integration",
      topics: [
        { id: "ai-fr-t4", name: "DOM selectors, document object model traversals, and dynamic event polling", done: false },
        { id: "ai-fr-t5", name: "Asynchronous structures: Promises, async/await handlers, & REST API fetches", done: false },
        { id: "ai-fr-t6", name: "LeetCode Practice: 'Two Sum' and hashing map paradigms", done: false }
      ]
    });
    if (commitment.includes("dbms") || commitment.includes("database") || commitment.includes("sql") || commitment.includes("exam")) {
      chapters.push({
        id: "ai-fr-sync-db",
        name: "Stage 3 (DBMS Synced): Dynamic State & Data Fetching",
        topics: [
          { id: "ai-fr-db1", name: "Developing Express backend REST APIs to serve client data states", done: false },
          { id: "ai-fr-db2", name: "DBMS theory sync: Relational mapping & modeling entities inside databases", done: false },
          { id: "ai-fr-db3", name: "Query design: Form submission SQL INSERT queries & transaction commits", done: false }
        ]
      });
    } else {
      chapters.push({
        id: "ai-fr-3",
        name: "Stage 3: React Framework & State Architecture",
        topics: [
          { id: "ai-fr-t7", name: "React virtual DOM, component lifecycle states, hooks (useState, useEffect)", done: false },
          { id: "ai-fr-t8", name: "Global state systems: Context providers or Redux state manager engines", done: false }
        ]
      });
    }
    chapters.push({
      id: "ai-fr-4",
      name: "Stage 4: Custom Project Delivery & Deployments",
      topics: [
        { id: "ai-fr-t9", name: "Building a responsive portfolio page project using React/Tailwind", done: false },
        { id: "ai-fr-t10", name: "Connecting client states to live mock servers with localStorage fallback", done: false },
        { id: "ai-fr-t11", name: "Deploying to GitHub Pages, configuring repo workflow builds", done: false }
      ]
    });

  } else if (type === "backend") {
    chapters.push({
      id: "ai-bk-1",
      name: "Stage 1: Server Logic & REST Routing",
      topics: [
        { id: "ai-bk-t1", name: "NodeJS runtime environments & non-blocking execution callback systems", done: false },
        { id: "ai-bk-t2", name: "Writing Express server routers, custom middlewares, & controller logic", done: false },
        { id: "ai-bk-t3", name: "API request/response validations using JSON Schema frameworks", done: false }
      ]
    });
    if (commitment.includes("dbms") || commitment.includes("database") || commitment.includes("sql") || commitment.includes("exam") || commitment.includes("yes")) {
      chapters.push({
        id: "ai-bk-2-sync",
        name: "Stage 2 (DBMS Synced): Database schemas & Normalization",
        topics: [
          { id: "ai-bk-db1", name: "Relational database concepts: schemas, primary keys, & foreign keys", done: false },
          { id: "ai-bk-db2", name: "Normalization rules: 1NF, 2NF, 3NF, BCNF algorithm models", done: false },
          { id: "ai-bk-db3", name: "Designing relational database schemas (Entity-Relationship mapping diagrams)", done: false },
          { id: "ai-bk-db4", name: "Writing advanced SQL queries: JOIN operations, aggregations, & transaction blocks", done: false }
        ]
      });
    } else {
      chapters.push({
        id: "ai-bk-2",
        name: "Stage 2: Database Schema & SQL/NoSQL storage",
        topics: [
          { id: "ai-bk-t4", name: "Relational schemas (PostgreSQL) vs Document models (MongoDB) selection", done: false },
          { id: "ai-bk-t5", name: "Writing SQL schema tables, base queries, joins, & configurations", done: false }
        ]
      });
    }
    chapters.push({
      id: "ai-bk-3",
      name: "Stage 3: Advanced Caching & Queues",
      topics: [
        { id: "ai-bk-t6", name: "Redis caching configurations & RAM key-value store optimization keys", done: false },
        { id: "ai-bk-t7", name: "Message distribution structures: BullMQ async worker schedules", done: false },
        { id: "ai-bk-t8", name: "LeetCode: Implement LRU Cache (hashing + double linked lists)", done: false }
      ]
    });
    if (difficulty === "Advanced") {
      chapters.push({
        id: "ai-bk-4-adv",
        name: "Stage 4 (Advanced): Deployments & Container Systems",
        topics: [
          { id: "ai-bk-t9", name: "Docker container systems: writing Dockerfiles & compose multi-container profiles", done: false },
          { id: "ai-bk-t10", name: "Horizontal scaling: NodeJS clustering & reverse proxy Nginx setups", done: false }
        ]
      });
    }

  } else if (type === "dsa") {
    chapters.push({
      id: "ai-ds-1",
      name: "Stage 1: Complexity analysis & Linear structures",
      topics: [
        { id: "ai-ds-t1", name: "Time and space complexity calculations: Big-O notation parameters", done: false },
        { id: "ai-ds-t2", name: "Arrays, lists, queues, & custom hash map implementations", done: false },
        { id: "ai-ds-t3", name: "LeetCode: 'Two Sum' (Linear search vs Hashmap structures)", done: false }
      ]
    });
    if (commitment.includes("dsa") || commitment.includes("algo") || commitment.includes("course") || commitment.includes("exam") || commitment.includes("yes")) {
      chapters.push({
        id: "ai-ds-2-sync",
        name: "Stage 2 (DSA Synced): Non-linear Trees & Binary Searches",
        topics: [
          { id: "ai-ds-db1", name: "University DSA Sync: BST (Binary Search Tree) insertion, deletion, & balance rules", done: false },
          { id: "ai-ds-db2", name: "Tree traversal patterns: pre-order, in-order, post-order, & level-order", done: false },
          { id: "ai-ds-db3", name: "LeetCode: 'Maximum Depth' & 'Invert Binary Tree' algorithms", done: false }
        ]
      });
      chapters.push({
        id: "ai-ds-3-sync",
        name: "Stage 3 (DSA Synced): Graph Structures & Path searches",
        topics: [
          { id: "ai-ds-db4", name: "Graph representations: Adjacency list structures & coordinate matrices", done: false },
          { id: "ai-ds-db5", name: "Pathfinding algorithms: Dijkstra's path optimization, Bellman-Ford paths", done: false },
          { id: "ai-ds-db6", name: "LeetCode: 'Clone Graph' & 'Number of Islands' graph models", done: false }
        ]
      });
    } else {
      chapters.push({
        id: "ai-ds-2",
        name: "Stage 2: Trees & Recursive algorithms",
        topics: [
          { id: "ai-ds-t4", name: "Binary Tree traversals (Inorder, Preorder, Postorder logic)", done: false },
          { id: "ai-ds-t5", name: "Binary Search Trees (BST) & search heuristics", done: false },
          { id: "ai-ds-t6", name: "LeetCode: Invert Binary Tree & Path Sum traversal", done: false }
        ]
      });
      chapters.push({
        id: "ai-ds-3",
        name: "Stage 3: Graph paths & Traversal models",
        topics: [
          { id: "ai-ds-t7", name: "Breadth-First Search (BFS) & Depth-First Search (DFS) graph paths", done: false },
          { id: "ai-ds-t8", name: "LeetCode: Clone Graph & Number of Islands pathfinder", done: false }
        ]
      });
    }
    if (difficulty === "Advanced") {
      chapters.push({
        id: "ai-ds-4-adv",
        name: "Stage 4 (Advanced): Dynamic Programming & Advanced Heuristics",
        topics: [
          { id: "ai-ds-t9", name: "Memoization arrays vs Tabulation optimization tables", done: false },
          { id: "ai-ds-t10", name: "LeetCode: 'Climbing Stairs', 'Longest Common Subsequence', & 'Edit Distance'", done: false }
        ]
      });
    }

  } else if (type === "gamedev") {
    chapters.push({
      id: "ai-gd-1",
      name: "Stage 1: Language Syntax & Game Loops",
      topics: [
        { id: "ai-gd-t1", name: "Python class structure, blueprints, & OOP design patterns", done: false },
        { id: "ai-gd-t2", name: "Initializing game frames & main event polling loop structures", done: false }
      ]
    });
    chapters.push({
      id: "ai-gd-2",
      name: "Stage 2: Physics engines & Collisions",
      topics: [
        { id: "ai-gd-t3", name: "Vector mathematics: velocity, gravity, friction models", done: false },
        { id: "ai-gd-t4", name: "AABB (Axis-Aligned Bounding Box) collision detection equations", done: false }
      ]
    });
    if (commitment.includes("os") || commitment.includes("operating") || commitment.includes("threads") || commitment.includes("exam")) {
      chapters.push({
        id: "ai-gd-3-sync",
        name: "Stage 3 (OS Synced): Concurrency & Resource Loading",
        topics: [
          { id: "ai-gd-db1", name: "OS Sync: Multithreading in asset managers & parallel texture loaders", done: false },
          { id: "ai-gd-db2", name: "CPU Scheduling overlap: balancing logic cycles and drawing ticks", done: false }
        ]
      });
    }
    chapters.push({
      id: "ai-gd-4",
      name: "Stage 4: Architecture & Capstone launch",
      topics: [
        { id: "ai-gd-t5", name: "Structuring scene controllers (Title, Playing, GameOver)", done: false },
        { id: "ai-gd-t6", name: "Compiling code binaries and uploading to GitHub Pages/Releases", done: false }
      ]
    });

  } else if (type === "fullstack") {
    chapters.push({
      id: "ai-fs-1",
      name: "Stage 1: Frontend User Interfaces",
      topics: [
        { id: "ai-fs-t1", name: "Semantic HTML5, CSS layout grids, and Tailwind framework utilities", done: false },
        { id: "ai-fs-t2", name: "React virtual DOM rendering, state props, and dynamic list mappings", done: false }
      ]
    });
    chapters.push({
      id: "ai-fs-2",
      name: "Stage 2: Server Controls & SQL/NoSQL storage",
      topics: [
        { id: "ai-fs-t3", name: "DBMS Sync: Relational database normalization schemas & JOIN queries", done: false },
        { id: "ai-fs-t4", name: "Developing Express backend REST controller endpoints and API routes", done: false }
      ]
    });
    chapters.push({
      id: "ai-fs-3",
      name: "Stage 3: Systems Security & Connections",
      topics: [
        { id: "ai-fs-t5", name: "Cross-Origin Resource Sharing (CORS) configurations & JWT sessions", done: false },
        { id: "ai-fs-t6", name: "LeetCode: Linear array algorithms & parenthetical parsing logic", done: false }
      ]
    });
    chapters.push({
      id: "ai-fs-4",
      name: "Stage 4: Full Stack Project Capstone",
      topics: [
        { id: "ai-fs-t7", name: "Building a fully integrated web portal connecting user state to database API", done: false },
        { id: "ai-fs-t8", name: "Docker containers & Vercel deployment of client-server application profiles", done: false }
      ]
    });

  } else {

    chapters.push({
      id: "ai-cust-1",
      name: "Stage 1: Core Fundamentals & Setups",
      topics: [
        { id: "ai-cust-t1", name: `Understanding foundational concepts of ${path}`, done: false },
        { id: "ai-cust-t2", name: `Setting up workspace editors, tools, & runtime SDKs for ${path}`, done: false },
        { id: "ai-cust-t3", name: `Mastering basic command instructions, syntax rules, & debugging logic`, done: false }
      ]
    });
    chapters.push({
      id: "ai-cust-2",
      name: "Stage 2: Intermediate Implementation & Systems",
      topics: [
        { id: "ai-cust-t4", name: `Developing custom scripts, module controllers, & logic pipelines`, done: false },
        { id: "ai-cust-t5", name: `Interfacing external modules & handling event data flows`, done: false }
      ]
    });
    chapters.push({
      id: "ai-cust-3",
      name: "Stage 3: Advanced Optimization & Scaling",
      topics: [
        { id: "ai-cust-t6", name: `Evaluating performance metrics, execution speeds, & security layers`, done: false },
        { id: "ai-cust-t7", name: `Writing comprehensive unit checks & exception handling validation suites`, done: false }
      ]
    });
    chapters.push({
      id: "ai-cust-4",
      name: "Stage 4: Project Delivery & Distribution",
      topics: [
        { id: "ai-cust-t8", name: `Designing and executing a robust capstone prototype matching your goals`, done: false },
        { id: "ai-cust-t9", name: `Packaging production files & compiling binaries to share on GitHub`, done: false }
      ]
    });
  }

  return {
    id: `ai-${type}-${level.slice(0,3)}-roadmap`,
    name: `AI: ${difficulty} ${title}`,
    pace: paceText,
    description: `A custom study roadmap compiled for a ${difficulty} student pacing study hours at: "${commitment}".`,
    chapters: chapters
  };
}

function finishCompilation(customRoadmap) {
  if (customRoadmap) {
    activeRoadmap = customRoadmap;
    activeRoadmap.chapters.forEach((chap, cIdx) => {
      chap.id = `${activeRoadmap.id}-c${cIdx}`;
      chap.topics.forEach((t, tIdx) => {
        t.id = `${activeRoadmap.id}-t${cIdx}-${tIdx}`;
        t.done = false;
      });
    });
  } else {
    activeRoadmap = generateDetailedRoadmap();
  }

  const chatHistory = document.getElementById('roadmap-chat-history');
  const aiBubble = document.createElement('div');
  aiBubble.className = 'flex items-start gap-3 max-w-[85%]';
  
  const difficulty = activeRoadmap.name.includes("Beginner") ? "Beginner" : (activeRoadmap.name.includes("Advanced") ? "Advanced" : "Intermediate");

  aiBubble.innerHTML = `
    <div class="w-6 h-6 rounded-full bg-violet-600/10 border border-violet-500/20 flex items-center justify-center shrink-0 text-[10px] text-violet-400 font-bold">AI</div>
    <div class="bg-white/[0.03] border border-white/5 rounded-2xl rounded-tl-none p-3.5 leading-relaxed text-white/70">
      All set! I have generated your custom, highly detailed **${activeRoadmap.name}**. <br><br>
      I tailored it specifically for a **${difficulty}** level with a pacing commitment of **"${interviewData.commitment}"**. Core lessons are synced to your academic checklist.<br><br>
      Review the visual nodes on the right and click **Import Subject** to save this roadmap to your active workspace checkpoints!
    </div>
  `;
  chatHistory.appendChild(aiBubble);
  chatHistory.scrollTop = chatHistory.scrollHeight;

  document.getElementById('roadmap-compiling-state').classList.add('hidden');
  document.getElementById('roadmap-content-state').classList.remove('hidden');

  document.getElementById('roadmap-meta-pace').innerText = activeRoadmap.pace;
  document.getElementById('roadmap-meta-title').innerText = activeRoadmap.name;

  const nodesContainer = document.getElementById('roadmap-nodes-container');
  nodesContainer.innerHTML = '';

  activeRoadmap.chapters.forEach((chap, idx) => {
    const node = document.createElement('div');
    node.className = 'relative pl-8 group';
    const num = idx + 1;
    node.innerHTML = `
      <div class="absolute -left-[29px] top-1.5 w-6 h-6 rounded-full bg-[#0a0a0a] border border-violet-500/30 group-hover:border-violet-500 group-hover:shadow-[0_0_10px_rgba(124,58,237,0.4)] flex items-center justify-center text-[10px] font-mono text-white/60 group-hover:text-white transition-all duration-300 z-10">${num}</div>
      <div>
        <h5 class="text-xs font-bold text-white/95 group-hover:text-violet-400 transition-colors">${chap.name}</h5>
        <ul class="mt-2.5 flex flex-col gap-2">
          ${chap.topics.map(t => `
            <li class="flex items-start gap-2 text-[10px] text-white/50 leading-relaxed">
              <span class="w-1.5 h-1.5 rounded-full bg-violet-600/60 mt-1.5 shrink-0"></span>
              <span>${t.name}</span>
            </li>
          `).join('')}
        </ul>
      </div>
    `;
    nodesContainer.appendChild(node);
  });

  lucide.createIcons();
  refreshHoverTargets();
}

function importActiveRoadmap() {
  if (!activeRoadmap) return;

  const exists = state.syllabus.some(s => s.id === activeRoadmap.id);
  if (exists) {
    alert("This roadmap is already imported into your Syllabus Manager!");
    return;
  }

  const roadmapCopy = JSON.parse(JSON.stringify(activeRoadmap));
  state.syllabus.push(roadmapCopy);
  updateMetrics();
  
  switchTab('syllabus');
  showSubjectDetails(roadmapCopy.id);
  alert(`SyncDEV: Successfully imported "${roadmapCopy.name}" as an active subject!`);
  activeRoadmap = null;
}

/* ============================================================
   TILT CARDS (3D hover effect)
   ============================================================ */
function setupTiltCards() {
  document.querySelectorAll('.tilt-card').forEach(card => {
    const glare = card.querySelector('.tilt-glare');
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      const rotateX = ((y - centerY) / centerY) * -8;
      const rotateY = ((x - centerX) / centerX) * 8;
      card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.015, 1.015, 1.015)`;
      if (glare) {
        const glareX = (x / rect.width) * 100;
        const glareY = (y / rect.height) * 100;
        glare.style.setProperty('--glare-x', glareX + '%');
        glare.style.setProperty('--glare-y', glareY + '%');
      }
    });
    card.addEventListener('mouseleave', () => {
      card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
      card.style.transition = 'transform 0.5s cubic-bezier(0.19, 1, 0.22, 1)';
      setTimeout(() => { card.style.transition = ''; }, 500);
    });
    card.addEventListener('mouseenter', () => { card.style.transition = ''; });
  });
}
setupTiltCards();

/* ============================================================
   MAGNETIC BUTTONS
   ============================================================ */
document.querySelectorAll('.magnetic-btn').forEach(btn => {
  btn.addEventListener('mousemove', (e) => {
    const rect = btn.getBoundingClientRect();
    const cx   = rect.left + rect.width  / 2;
    const cy   = rect.top  + rect.height / 2;
    const dx   = (e.clientX - cx) * 0.3;
    const dy   = (e.clientY - cy) * 0.3;
    gsap.to(btn, { x: dx, y: dy, duration: 0.4, ease: 'power2.out' });
  });
  btn.addEventListener('mouseleave', () => {
    gsap.to(btn, { x: 0, y: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' });
  });
});

/* ============================================================
   CODE LINE HIGHLIGHT
   ============================================================ */
const codeLines = document.querySelectorAll('#code-editor .code-line');
let activeLine = 0;
if (codeLines.length > 0) {
  setInterval(() => {
    codeLines.forEach(l => l.classList.remove('active'));
    activeLine = (activeLine + 1) % codeLines.length;
    codeLines[activeLine].classList.add('active');
  }, 1800);
}

/* ============================================================
   NAVBAR SCROLL LOOKS
   ============================================================ */
const navbar = document.getElementById('navbar');
window.addEventListener('scroll', () => {
  if (window.scrollY > 80) {
    navbar.style.opacity = '1';
  } else {
    navbar.style.opacity = '1';
  }
}, { passive: true });

/* ============================================================
   STAGGER TRANSITION DELAYS (CSS-based)
   ============================================================ */
document.querySelectorAll('.features-grid .feature-card').forEach((card, i) => {
  card.style.transitionDelay = `${i * 0.05}s`;
});
document.querySelectorAll('.testimonial-card').forEach((card, i) => {
  card.style.transitionDelay = `${i * 0.08}s`;
});
document.querySelectorAll('.step-item').forEach((item, i) => {
  item.style.transitionDelay = `${i * 0.1}s`;
});


const revealObserver = new IntersectionObserver((entries) => {
  entries.forEach((entry, i) => {
    if (entry.isIntersecting) {
      const siblings = entry.target.closest('.features-grid, .steps-grid, .testimonials-grid, [role="list"]')?.querySelectorAll('.reveal') || [];
      let delay = 0;
      siblings.forEach((sib, idx) => {
        if (sib === entry.target) delay = idx * 0.07;
      });
      setTimeout(() => {
        entry.target.classList.add('visible');
      }, delay * 1000);
      revealObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

const sections = document.querySelectorAll('[data-bg]');
if (sections.length) {
  sections.forEach(section => {
    ScrollTrigger.create({
      trigger: section,
      start: 'top center',
      onEnter: () => gsap.to('body', { backgroundColor: section.dataset.bg, duration: 1 }),
      onEnterBack: () => gsap.to('body', { backgroundColor: section.dataset.bg, duration: 1 })
    });
  });
}


const mobileMenuBtn = document.getElementById('mobile-menu-btn');
const mobileNav     = document.getElementById('mobile-nav');
function closeMobileNav() {
  if (mobileNav) {
    mobileNav.classList.remove('open');
    mobileMenuBtn.setAttribute('aria-expanded', 'false');
  }
}
if (mobileMenuBtn) {
  mobileMenuBtn.addEventListener('click', () => {
    const isOpen = mobileNav.classList.toggle('open');
    mobileMenuBtn.setAttribute('aria-expanded', String(isOpen));
  });
}
document.addEventListener('click', (e) => {
  if (mobileNav && mobileNav.classList.contains('open') &&
      !mobileNav.contains(e.target) &&
      !mobileMenuBtn.contains(e.target)) {
    closeMobileNav();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeMobileNav();
});


document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    const href = this.getAttribute('href');
    if (href === '#') return;
    const target = document.querySelector(href);
    if (!target) return;
    e.preventDefault();
    closeMobileNav();
    if (lenis) {
      lenis.scrollTo(target, { offset: -80, duration: 1.4 });
    } else {
      const top = target.getBoundingClientRect().top + window.scrollY - 80;
      window.scrollTo({ top, behavior: 'smooth' });
    }
  });
});

/* ============================================================
   CREDITS CARD VISUAL EFFECTS (Tilt, Particles, Ripple)
   ============================================================ */
function initCreditCardEffects() {

  const container = document.getElementById('credit-particles');
  if (container) {
    const count = 30;
    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'credit-particle';
      p.style.left = Math.random() * 100 + '%';
      p.style.width = p.style.height = (Math.random() * 2 + 1) + 'px';
      p.style.animationDuration = (Math.random() * 8 + 6) + 's';
      p.style.animationDelay = (Math.random() * 10) + 's';
      p.style.opacity = Math.random() * 0.5 + 0.1;
      container.appendChild(p);
    }
  }


  const card = document.getElementById('creditCard');
  if (card) {
    let rAF;
    document.addEventListener('mousemove', (e) => {
      if (rAF) cancelAnimationFrame(rAF);
      rAF = requestAnimationFrame(() => {
        const rect = card.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const dx = (e.clientX - cx) / (rect.width / 2);
        const dy = (e.clientY - cy) / (rect.height / 2);
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 3.0) {
          card.style.transform = `
            perspective(800px)
            rotateY(${dx * 6}deg)
            rotateX(${-dy * 6}deg)
            scale(${1 + dist * 0.008})
          `;
        } else {
          card.style.transform = '';
        }
      });
    });
    document.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  }
}


function createRipple(e) {
  const btn = e.currentTarget;
  const ripple = document.createElement('span');
  ripple.className = 'ripple';
  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  ripple.style.width = ripple.style.height = size + 'px';
  ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
  ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
  btn.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}


window.createRipple = createRipple;


initCreditCardEffects();

