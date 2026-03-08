/**
 * LifeDesk Vanilla JavaScript Application (Refined)
 * * Purpose: Manages user session, CRUD for reminders/assessments,
 * dynamic view rendering, and real‑time readiness scores.
 */

// ---------- CONFIGURATION ----------
const SUPABASE_URL = 'https://xmemzeunhrjhxrhclclz.supabase.co';
// Corrected the token (removed the leading 'y')
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZW16ZXVuaHJqaHhyaGNsY2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjQ2OTIsImV4cCI6MjA4ODMwMDY5Mn0.6i-Nl5fdBtMMJwDu3l13uhv6MsjQxWHcD_SIo78lfjY';

let supabase;

// ---------- INITIALIZATION ----------
function initSupabase() {
    if (!window.supabase) {
        console.error("Supabase SDK failed to load. Check index.html script tags.");
        return false;
    }
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
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
const sidebar = document.getElementById('sidebar');
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
    mainContent.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%; color: white;">
            <div class="spinner"></div>
            <p style="margin-top:1rem; opacity: 0.6;">Syncing operational data...</p>
        </div>`;
}

function showError(message) {
    alert('Operational Error: ' + message);
}

// ---------- AUTHENTICATION ----------
async function checkUser() {
    try {
        const { data, error } = await supabase.auth.getUser();
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
        <div class="modal" id="authModal" style="display:flex;">
            <div class="modal-content glass">
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
        
        const { data, error } = isSignup 
            ? await supabase.auth.signUp({ email, password })
            : await supabase.auth.signInWithPassword({ email, password });

        if (error) {
            showError(error.message);
        } else {
            if (isSignup) alert("Account created! Check email for confirmation link.");
            else {
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
            supabase.from('categories').select('*'),
            supabase.from('reminders').select('*, categories(name)').eq('user_id', currentUser.id),
            supabase.from('assessments').select('*').eq('user_id', currentUser.id)
        ]);

        if (catRes.error) throw catRes.error;
        categories = catRes.data || [];
        reminders = remRes.data || [];
        assessments = assRes.data || [];

        if (categorySelect) {
            categorySelect.innerHTML = '<option value="">Select category</option>' + 
                categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }

        renderCurrentView();
    } catch (err) {
        console.error("Critical Data Load Error:", err);
        mainContent.innerHTML = `<div class="glass-card" style="color:white; text-align:center;">
            <h3>System Offline</h3>
            <p>Failed to sync with Supabase: ${err.message}</p>
        </div>`;
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
            <h1>Operational Status</h1>
            <div style="display:flex; justify-content: space-around; align-items: center; flex-wrap: wrap; gap: 2rem; margin: 2rem 0;">
                <div style="text-align:center;">
                    <div class="score-circle" style="background: conic-gradient(#4f46e5 ${avgScore * 3.6}deg, rgba(255,255,255,0.1) 0deg);">
                        ${avgScore}%
                    </div>
                    <p style="font-weight:600; margin-top:0.5rem; color: white;">Overall Readiness</p>
                </div>
                <div style="text-align:center;">
                   <h2 style="font-size: 3rem; color: ${overdue.length > 0 ? '#ef4444' : '#10b981'};">$${risk.toLocaleString()}</h2>
                   <p style="font-weight:600; color: white;">Risk Exposure (Overdue)</p>
                </div>
            </div>
            <div style="display:flex; gap:1rem; justify-content:center;">
                <button id="quickAddBtn">+ Quick Add</button>
                <button id="startProtocolBtn" class="secondary">Run Protocols</button>
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
                <h2>Operations Log</h2>
                <button id="newReminderBtn">+ New Operation</button>
            </div>
            <div id="remindersList">
                ${reminders.map(r => `
                    <div class="reminder-item ${r.status === 'completed' ? 'completed' : ''}" style="margin-bottom:1rem; border:1px solid rgba(255,255,255,0.1); padding:1.25rem; border-radius:16px; background:rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong style="font-size:1.1rem; color:white;">${r.title}</strong>
                            <div style="font-size:0.85rem; opacity:0.7; margin-top:4px;">
                                ${r.categories?.name} • Due: ${formatDate(r.due_date)}
                            </div>
                        </div>
                        <div class="reminder-actions" style="display:flex; gap:0.5rem;">
                            <button onclick="toggleReminder('${r.id}')" style="background:${r.status === 'completed' ? '#10b981' : 'rgba(255,255,255,0.1)'}; padding:8px 12px; border-radius:8px;">
                                ${r.status === 'completed' ? '✓' : 'Complete'}
                            </button>
                            <button onclick="deleteReminder('${r.id}')" style="background:rgba(239,68,68,0.2); color:#ef4444; border:none; padding:8px 12px; border-radius:8px; cursor:pointer;">🗑</button>
                        </div>
                    </div>
                `).join('') || '<p style="text-align:center; opacity:0.5; padding:2rem;">Log is clear. Systems optimal.</p>'}
            </div>
        </div>`;
    
    document.getElementById('newReminderBtn').onclick = () => openReminderModal();
}

window.toggleReminder = async (id) => {
    const reminder = reminders.find(r => r.id === id);
    if (!reminder) return;
    const newStatus = reminder.status === 'completed' ? 'upcoming' : 'completed';
    const { error } = await supabase.from('reminders').update({ status: newStatus }).eq('id', id);
    if (error) { showError(error.message); return; }
    loadInitialData();
};

window.deleteReminder = async (id) => {
    if (!confirm("Permanently delete this operation record?")) return;
    const { error } = await supabase.from('reminders').delete().eq('id', id);
    if (error) showError(error.message);
    else loadInitialData();
};

// ---------- INITIALIZATION ----------
document.addEventListener('DOMContentLoaded', () => {
    if (initSupabase()) checkUser();

    sidebarItems.forEach(item => {
        item.onclick = () => {
            activeView = item.dataset.view;
            renderCurrentView();
        };
    });

    document.getElementById('logoutBtn').onclick = async () => {
        await supabase.auth.signOut();
        location.reload();
    };
});
