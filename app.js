/**
 * LifeDesk Vanilla JavaScript Application
 * Handles Supabase Auth, CRUD, and Real-time UI updates.
 */

// ---------- CONFIGURATION ----------
const SUPABASE_URL = 'https://xmemzeunhrjhxrhclclz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZW16ZXVuaHJqaHhyaGNsY2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjQ2OTIsImV4cCI6MjA4ODMwMDY5Mn0.6i-Nl5fdBtMMJwDu3l13uhv6MsjQxWHcD_SIo78lfjY';

// Use 'lifeDb' to avoid conflicts with the global 'supabase' object from CDN
let lifeDb;

// ---------- INITIALIZATION ----------
function initClient() {
    if (!window.supabase) {
        console.error("Supabase SDK failed to load.");
        return false;
    }
    // Initialize the client using the global window.supabase
    lifeDb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    return true;
}

// ---------- GLOBAL STATE ----------
let currentUser = null;
let reminders = [];
let assessments = [];
let categories = [];
let activeView = 'dashboard';

// ---------- DOM REFERENCES ----------
const mainContent = document.getElementById('main-content');
const userNameSpan = document.getElementById('userName');
const sidebarItems = document.querySelectorAll('.sidebar li, .bottom-nav button');
const reminderModal = document.getElementById('reminderModal');
const reminderForm = document.getElementById('reminderForm');
const categorySelect = document.getElementById('categoryId');

// ---------- UTILITIES ----------
function formatDate(date) {
    if (!date) return 'N/A';
    try {
        return dateFns.format(new Date(date), 'MMM d, yyyy h:mm a');
    } catch (e) {
        return 'Invalid Date';
    }
}

function showLoading() {
    if (!mainContent) return;
    mainContent.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color: white;">
      <div class="spinner"></div>
      <p style="margin-top:1rem; opacity: 0.6;">Syncing operational data...</p>
    </div>`;
}

// ---------- AUTHENTICATION ----------
async function checkUser() {
    try {
        const { data, error } = await lifeDb.auth.getUser();
        if (error || !data.user) {
            showAuthModal();
        } else {
            currentUser = data.user;
            userNameSpan.innerText = currentUser.email.split('@')[0];
            loadInitialData();
        }
    } catch (err) {
        showAuthModal();
    }
}

function showAuthModal() {
    const existing = document.getElementById('authModal');
    if (existing) existing.remove();

    const authHtml = `
    <div class="modal" id="authModal" style="display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:1000; align-items:center; justify-content:center;">
      <div class="modal-content glass" style="width:100%; max-width:400px; padding:2rem; border-radius:24px;">
        <h2 id="authTitle" style="margin-bottom: 0.5rem; color: #1e293b;">Welcome to LifeDesk</h2>
        <p id="authDesc" style="color: #64748b; margin-bottom: 2rem;">Log in to access your life operations dashboard.</p>
        <form id="loginForm">
          <input type="email" id="loginEmail" placeholder="Email" required style="width:100%; padding:12px; margin-bottom:12px; border:1px solid #e2e8f0; border-radius:8px;">
          <input type="password" id="loginPassword" placeholder="Password" required style="width:100%; padding:12px; margin-bottom:12px; border:1px solid #e2e8f0; border-radius:8px;">
          <button type="submit" id="authSubmit" style="width: 100%; background: #4f46e5; color: white; padding: 14px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600;">Initialize Session</button>
        </form>
        <div style="margin-top: 1.5rem; text-align: center; font-size: 0.875rem;">
          <a href="#" id="toggleAuthMode" style="color: #4f46e5; text-decoration: none; font-weight:500;">First time? Create an account</a>
        </div>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', authHtml);

    const loginForm = document.getElementById('loginForm');
    const toggleLink = document.getElementById('toggleAuthMode');
    let isSignup = false;

    toggleLink.onclick = (e) => {
        e.preventDefault();
        isSignup = !isSignup;
        document.getElementById('authTitle').innerText = isSignup ? 'Create Account' : 'Welcome to LifeDesk';
        document.getElementById('authSubmit').innerText = isSignup ? 'Create Account' : 'Initialize Session';
        toggleLink.innerText = isSignup ? 'Already have an account? Sign in' : 'First time? Create an account';
    };

    loginForm.onsubmit = async (e) => {
        e.preventDefault();
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;

        const { error } = isSignup
            ? await lifeDb.auth.signUp({ email, password })
            : await lifeDb.auth.signInWithPassword({ email, password });

        if (error) {
            alert(error.message);
        } else {
            if (isSignup) {
                alert("Check email for confirmation!");
            } else {
                document.getElementById('authModal').remove();
                checkUser();
            }
        }
    };
}

// ---------- DATA LOADING ----------
async function loadInitialData() {
    showLoading();
    try {
        const [catRes, remRes, assRes] = await Promise.all([
            lifeDb.from('categories').select('*'),
            lifeDb.from('reminders').select('*, categories(name)').eq('user_id', currentUser.id).order('due_date', { ascending: true }),
            lifeDb.from('assessments').select('*').eq('user_id', currentUser.id)
        ]);

        categories = catRes.data || [];
        reminders = remRes.data || [];
        assessments = assRes.data || [];

        if (categorySelect) {
            categorySelect.innerHTML = '<option value="">Select category</option>' +
                categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }

        renderCurrentView();
    } catch (err) {
        console.error("Critical Load Error:", err);
    }
}

// ---------- VIEW ROUTING ----------
function renderCurrentView() {
    sidebarItems.forEach(item => item.classList.remove('active'));
    document.querySelectorAll(`[data-view="${activeView}"]`).forEach(el => el.classList.add('active'));

    switch (activeView) {
        case 'dashboard': renderDashboard(); break;
        case 'reminders': renderReminders(); break;
        case 'assessments': renderAssessments(); break;
        case 'vault': renderVault(); break;
        case 'family': renderFamily(); break;
    }
}

// ---------- DASHBOARD ----------
function renderDashboard() {
    const avgScore = assessments.length ? Math.round(assessments.reduce((a, b) => a + b.score, 0) / assessments.length) : 0;
    const now = new Date();
    const overdue = reminders.filter(r => new Date(r.due_date) < now && r.status !== 'completed');
    const risk = overdue.reduce((acc, r) => acc + (Number(r.cost_consequence_min) || 0), 0);

    mainContent.innerHTML = `
    <div class="glass-card">
      <h1>Operational Overview</h1>
      <div style="display:flex; justify-content: space-around; align-items: center; flex-wrap: wrap; gap: 2rem; margin: 2rem 0;">
        <div style="text-align:center;">
          <div class="score-circle" style="background: conic-gradient(#4f46e5 ${avgScore * 3.6}deg, rgba(255,255,255,0.1) 0deg); width:140px; height:140px; border-radius:50%; display:flex; align-items:center; justify-content:center; font-size:2.5rem; font-weight:bold; color:white;">
            ${avgScore}%
          </div>
          <p style="font-weight:600; margin-top:1rem; color: white;">Readiness Score</p>
        </div>
        <div style="text-align:center;">
           <h2 style="font-size: 3rem; color: ${overdue.length > 0 ? '#ef4444' : '#10b981'};">$${risk.toLocaleString()}</h2>
           <p style="font-weight:600; color: white;">Risk Exposure</p>
        </div>
      </div>
      <div style="display:flex; gap:1rem; justify-content:center; margin-top:2rem;">
        <button id="quickAddBtn" style="padding:12px 24px; border-radius:40px; background:#4f46e5; border:none; color:white; font-weight:bold; cursor:pointer;">+ Quick Add</button>
        <button id="startProtocolBtn" class="secondary" style="padding:12px 24px; border-radius:40px; background:transparent; border:1px solid white; color:white; font-weight:bold; cursor:pointer;">Run Protocol</button>
      </div>
    </div>`;

    document.getElementById('quickAddBtn').onclick = () => openReminderModal();
    document.getElementById('startProtocolBtn').onclick = () => { activeView = 'assessments'; renderCurrentView(); };
}

// ---------- REMINDERS ----------
function renderReminders() {
    mainContent.innerHTML = `
    <div class="glass-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
        <h2 style="color:white;">Reminders</h2>
        <button id="newReminderBtn" style="padding:8px 16px; border-radius:40px; background:#4f46e5; border:none; color:white; cursor:pointer;">+ New</button>
      </div>
      <div id="remindersList">
        ${reminders.map(r => `
          <div class="reminder-item ${r.status === 'completed' ? 'completed' : ''}" style="margin-bottom:1rem; border:1px solid rgba(255,255,255,0.1); padding:1rem; border-radius:16px; background:rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center; color:white;">
            <div>
              <strong>${r.title}</strong><br>
              <small style="opacity:0.7;">Due: ${formatDate(r.due_date)}</small>
            </div>
            <div style="display:flex; gap:0.5rem;">
              <button onclick="toggleReminder('${r.id}')" style="background:${r.status === 'completed' ? '#10b981' : 'rgba(255,255,255,0.1)'}; border:1px solid white; color:white; padding:6px 12px; border-radius:20px; cursor:pointer;">
                ${r.status === 'completed' ? '✓' : 'Mark Done'}
              </button>
              <button onclick="deleteReminder('${r.id}')" style="background:rgba(239,68,68,0.2); border:1px solid #ef4444; color:#ef4444; padding:6px 12px; border-radius:20px; cursor:pointer;">🗑</button>
            </div>
          </div>
        `).join('') || '<p style="color:white; opacity:0.5;">No tasks recorded.</p>'}
      </div>
    </div>`;

    document.getElementById('newReminderBtn').onclick = () => openReminderModal();
}

window.toggleReminder = async (id) => {
    const reminder = reminders.find(r => r.id === id);
    if (!reminder) return;
    const newStatus = reminder.status === 'completed' ? 'upcoming' : 'completed';
    const { error } = await lifeDb.from('reminders').update({ status: newStatus }).eq('id', id);
    if (error) alert(error.message);
    else loadInitialData();
};

window.deleteReminder = async (id) => {
    if (!confirm("Delete reminder?")) return;
    const { error } = await lifeDb.from('reminders').delete().eq('id', id);
    if (error) alert(error.message);
    else loadInitialData();
};

// ---------- ASSESSMENTS ----------
function renderAssessments() {
    const protocols = ['Health', 'Vehicle', 'Home', 'Finance'];
    mainContent.innerHTML = `
    <div class="glass-card">
      <h2 style="color:white; margin-bottom:2rem;">Readiness Protocols</h2>
      <div style="display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));">
        ${protocols.map(p => {
        const scoreObj = assessments.find(a => a.category === p);
        const score = scoreObj ? scoreObj.score : 0;
        return `
            <div class="glass-card" style="text-align:center; margin:0;">
              <h3 style="color:white; margin-bottom:1rem;">${p}</h3>
              <div style="font-size:2rem; font-weight:bold; color:#4f46e5; margin-bottom:1.5rem;">${score}%</div>
              <button onclick="openAssessmentModal('${p}')" style="width:100%; background:transparent; border:1px solid white; color:white; padding:8px; border-radius:12px; cursor:pointer;">Assess</button>
            </div>`;
    }).join('')}
      </div>
    </div>`;
}

function openAssessmentModal(category) {
    const questions = ['Is maintenance current?', 'Are documents verified?', 'Are safety checks passed?'];
    const modalHtml = `
    <div class="modal" id="assModal" style="display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:1000; align-items:center; justify-content:center;">
      <div class="glass-card" style="width:100%; max-width:400px; padding:2rem; background:white; color:#1e293b;">
        <span class="close" onclick="this.closest('.modal').remove()" style="float:right; cursor:pointer;">&times;</span>
        <h2>${category} Protocol</h2>
        <form id="assForm" style="margin-top:1.5rem;">
          ${questions.map((q, i) => `
            <div style="margin-bottom:1rem;">
              <p style="font-weight:bold; margin-bottom:0.5rem;">${q}</p>
              <label><input type="radio" name="q${i}" value="1" required> Yes</label>
              <label style="margin-left:1rem;"><input type="radio" name="q${i}" value="0"> No</label>
            </div>`).join('')}
          <button type="submit" style="width:100%; padding:12px; background:#4f46e5; border:none; color:white; border-radius:12px; cursor:pointer; font-weight:bold;">Save Score</button>
        </form>
      </div>
    </div>`;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('assForm').onsubmit = async (e) => {
        e.preventDefault();
        const data = new FormData(e.target);
        let points = 0;
        for (let i = 0; i < questions.length; i++) {
            points += parseInt(data.get(`q${i}`));
        }
        const score = Math.round((points / questions.length) * 100);

        const { error } = await lifeDb.from('assessments').upsert({
            user_id: currentUser.id,
            category,
            score,
            updated_at: new Date()
        }, { onConflict: 'user_id, category' });

        if (error) alert(error.message);
        document.getElementById('assModal').remove();
        loadInitialData();
    };
}

// ---------- VAULT & FAMILY ----------
function renderVault() {
    mainContent.innerHTML = `<div class="glass-card"><h2 style="color:white;">Vault</h2><p style="color:white; opacity:0.6;">Secure storage active.</p></div>`;
}
function renderFamily() {
    mainContent.innerHTML = `<div class="glass-card"><h2 style="color:white;">Family</h2><p style="color:white; opacity:0.6;">Household tracking active.</p></div>`;
}

// ---------- MODALS ----------
function openReminderModal() {
    reminderForm.reset();
    reminderModal.style.display = 'flex';
}

document.querySelector('.close').onclick = () => reminderModal.style.display = 'none';

reminderForm.onsubmit = async (e) => {
    e.preventDefault();
    const data = {
        user_id: currentUser.id,
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        category_id: document.getElementById('categoryId').value,
        due_date: document.getElementById('dueDate').value,
        status: 'upcoming'
    };

    const { error } = await lifeDb.from('reminders').insert([data]);
    if (error) alert(error.message);
    else {
        reminderModal.style.display = 'none';
        loadInitialData();
    }
};

// ---------- INITIALIZATION ----------
document.addEventListener('DOMContentLoaded', () => {
    if (initClient()) checkUser();

    sidebarItems.forEach(item => {
        item.onclick = () => {
            activeView = item.dataset.view;
            renderCurrentView();
        };
    });

    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await lifeDb.auth.signOut();
            location.reload();
        };
    }
});
