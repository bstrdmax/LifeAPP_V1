/**
 * LifeDesk Vanilla JavaScript Application (Resilient Build)
 * Purpose: Manages personal life operations with Supabase.
 */

// ---------- CONFIGURATION ----------
const SUPABASE_URL = 'https://xmemzeunhrjhxrhclclz.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZW16ZXVuaHJqaHhyaGNsY2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjQ2OTIsImV4cCI6MjA4ODMwMDY5Mn0.6i-Nl5fdBtMMJwDu3l13uhv6MsjQxWHcD_SIo78lfjY';

// Global variables
let lifeClient;
let currentUser = null;
let reminders = [];
let assessments = [];
let categories = [];
let activeView = 'dashboard';

// DOM Elements (assigned during init)
let elMain, elUserSpan, elSidebarItems, elReminderModal, elReminderForm, elCategorySelect;

console.log("LifeDesk: Script loaded. Waiting for DOM...");

// ---------- INITIALIZATION ----------
function initApp() {
    console.log("LifeDesk: Initializing DOM elements...");
    elMain = document.getElementById('main-content');
    elUserSpan = document.getElementById('userName');
    elReminderModal = document.getElementById('reminderModal');
    elReminderForm = document.getElementById('reminderForm');
    elCategorySelect = document.getElementById('categoryId');
    elSidebarItems = document.querySelectorAll('.sidebar li, .bottom-nav button');

    if (!window.supabase) {
        console.error("LifeDesk: Supabase SDK not found!");
        if (elUserSpan) elUserSpan.innerText = "SDK Error";
        return;
    }

    lifeClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("LifeDesk: Client initialized.");

    // Set up navigation
    elSidebarItems.forEach(item => {
        item.addEventListener('click', () => {
            activeView = item.dataset.view;
            renderCurrentView();
        });
    });

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.onclick = async () => {
            await lifeClient.auth.signOut();
            location.reload();
        };
    }

    checkUser();
}

// ---------- AUTHENTICATION ----------
async function checkUser() {
    console.log("LifeDesk: Checking authentication...");
    try {
        const { data, error } = await lifeClient.auth.getUser();
        if (error || !data.user) {
            console.log("LifeDesk: No user session found.");
            showAuthModal();
        } else {
            console.log("LifeDesk: User authenticated:", data.user.email);
            currentUser = data.user;
            if (elUserSpan) elUserSpan.innerText = currentUser.email.split('@')[0];
            loadInitialData();
        }
    } catch (err) {
        console.error("LifeDesk: Auth check failed:", err);
        showAuthModal();
    }
}

function showAuthModal() {
    const existing = document.getElementById('authModal');
    if (existing) existing.remove();

    const authHtml = `
    <div class="modal" id="authModal" style="display:flex; position:fixed; inset:0; background:rgba(0,0,0,0.8); z-index:1000; align-items:center; justify-content:center;">
      <div class="modal-content glass" style="width:100%; max-width:400px; padding:2rem; border-radius:24px; background: white; color: #1e293b;">
        <h2 id="authTitle" style="margin-bottom: 0.5rem;">Welcome to LifeDesk</h2>
        <p id="authDesc" style="color: #64748b; margin-bottom: 2rem;">Log in to access your dashboard.</p>
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
            ? await lifeClient.auth.signUp({ email, password })
            : await lifeClient.auth.signInWithPassword({ email, password });

        if (error) {
            alert(error.message);
        } else {
            if (isSignup) alert("Check email for confirmation!");
            else {
                document.getElementById('authModal').remove();
                checkUser();
            }
        }
    };
}

// ---------- DATA LOADING ----------
async function loadInitialData() {
    if (!elMain) return;
    elMain.innerHTML = `<div style="display:flex; justify-content:center; align-items:center; height:100%; color: white; opacity: 0.6;">Syncing...</div>`;
    
    try {
        const [catRes, remRes, assRes] = await Promise.all([
            lifeClient.from('categories').select('*'),
            lifeClient.from('reminders').select('*, categories(name)').eq('user_id', currentUser.id).order('due_date', { ascending: true }),
            lifeClient.from('assessments').select('*').eq('user_id', currentUser.id)
        ]);

        categories = catRes.data || [];
        reminders = remRes.data || [];
        assessments = assRes.data || [];

        if (elCategorySelect) {
            elCategorySelect.innerHTML = '<option value="">Select category</option>' +
                categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }

        renderCurrentView();
    } catch (err) {
        console.error("LifeDesk: Data Load Error:", err);
    }
}

// ---------- VIEWS ----------
function renderCurrentView() {
    elSidebarItems.forEach(item => item.classList.remove('active'));
    document.querySelectorAll(`[data-view="${activeView}"]`).forEach(el => el.classList.add('active'));

    switch (activeView) {
        case 'dashboard': renderDashboard(); break;
        case 'reminders': renderReminders(); break;
        case 'assessments': renderAssessments(); break;
        case 'vault': renderVault(); break;
        case 'family': renderFamily(); break;
    }
}

function renderDashboard() {
    const avgScore = assessments.length ? Math.round(assessments.reduce((a, b) => a + b.score, 0) / assessments.length) : 0;
    const now = new Date();
    const overdue = reminders.filter(r => new Date(r.due_date) < now && r.status !== 'completed');
    const risk = overdue.reduce((acc, r) => acc + (Number(r.cost_consequence_min) || 0), 0);

    elMain.innerHTML = `
    <div class="glass-card">
      <h1>Dashboard</h1>
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
    </div>`;
}

function renderReminders() {
    elMain.innerHTML = `<div class="glass-card"><h2 style="color:white;">Reminders Log</h2><p style="color:white; opacity:0.6;">Loading tasks...</p></div>`;
    // Add full render logic here as needed
}

function renderAssessments() { elMain.innerHTML = `<div class="glass-card"><h2 style="color:white;">Assessments</h2></div>`; }
function renderVault() { elMain.innerHTML = `<div class="glass-card"><h2 style="color:white;">The Vault</h2></div>`; }
function renderFamily() { elMain.innerHTML = `<div class="glass-card"><h2 style="color:white;">Family</h2></div>`; }

// ---------- START ----------
window.addEventListener('DOMContentLoaded', initApp);
