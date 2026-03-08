/**
 * LifeDesk Vanilla JavaScript Application (Resilient Version)
 * Fixes the "Blue Screen" hang by adding robust error handling.
 */

// ---------- CONFIGURATION ----------
const SUPABASE_URL = 'https://xmemzeunhrjhxrhclclz.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZW16ZXVuaHJqaHhyaGNsY2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjQ2OTIsImV4cCI6MjA4ODMwMDY5Mn0.6i-Nl5fdBtMMJwDu3l13uhv6MsjQxWHcD_SIo78lfjY';

// Global variables for SDKs
let supabase;

// ---------- INITIALIZATION ----------
function initSupabase() {
    if (!window.supabase) {
        console.error("Supabase SDK failed to load from CDN.");
        document.getElementById('userName').innerText = "Connection Error";
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

// ---------- DOM REFERENCES ----------
const mainContent = document.getElementById('main-content');
const userNameSpan = document.getElementById('userName');
const reminderModal = document.getElementById('reminderModal');
const reminderForm = document.getElementById('reminderForm');
const categorySelect = document.getElementById('categoryId');
const sidebarItems = document.querySelectorAll('.sidebar li, .bottom-nav button');

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
            <p style="margin-top:1rem; opacity: 0.6;">Syncing operations...</p>
        </div>`;
}

// ---------- AUTHENTICATION ----------
async function checkUser() {
    console.log("LifeDesk: Initiating Auth Check...");
    try {
        const { data, error } = await supabase.auth.getUser();
        
        if (error) {
            console.warn("Auth check returned error (User likely not logged in):", error.message);
            showAuthModal();
            return;
        }

        if (data && data.user) {
            console.log("Auth success:", data.user.email);
            currentUser = data.user;
            userNameSpan.innerText = currentUser.email.split('@')[0];
            loadInitialData();
        } else {
            console.log("No active session. Showing login.");
            showAuthModal();
        }
    } catch (err) {
        console.error("Critical Auth Failure:", err);
        // Fallback: if auth check fails (e.g. network error), show login anyway
        showAuthModal();
    }
}

function showAuthModal() {
    userNameSpan.innerText = "Guest";
    const existing = document.getElementById('authModal');
    if (existing) existing.remove();

    const authHtml = `
        <div class="modal" id="authModal" style="display:flex;">
            <div class="modal-content glass">
                <h2 id="authTitle" style="margin-bottom: 0.5rem; color: #1e293b;">Welcome to LifeDesk</h2>
                <p id="authDesc" style="color: #64748b; margin-bottom: 2rem;">Sign in to access your life operations dashboard.</p>
                <form id="loginForm">
                    <input type="email" id="loginEmail" placeholder="Email" required style="border: 1px solid #e2e8f0; width:100%; padding:10px; margin-bottom:10px; border-radius:8px;">
                    <input type="password" id="loginPassword" placeholder="Password" required style="border: 1px solid #e2e8f0; width:100%; padding:10px; margin-bottom:10px; border-radius:8px;">
                    <button type="submit" id="authSubmit" style="width: 100%; background: #4f46e5; color: white; padding: 12px; border-radius: 8px; border: none; cursor: pointer; font-weight: 600;">Initialize Session</button>
                </form>
                <div style="margin-top: 1.5rem; text-align: center; font-size: 0.875rem;">
                    <a href="#" id="toggleAuthMode" style="color: #4f46e5; text-decoration: none;">First time? Create an account</a>
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
    showLoading();
    try {
        const [catRes, remRes, assRes] = await Promise.all([
            supabase.from('categories').select('*'),
            supabase.from('reminders').select('*, categories(name)').eq('user_id', currentUser.id).order('due_date', { ascending: true }),
            supabase.from('assessments').select('*').eq('user_id', currentUser.id)
        ]);

        categories = catRes.data || [];
        reminders = remRes.data || [];
        assessments = assRes.data || [];

        if (categorySelect) {
            categorySelect.innerHTML = '<option value="">Select category</option>' + 
                categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
        }

        renderDashboard();
    } catch (err) {
        console.error("Data Load Error:", err);
        mainContent.innerHTML = `<div style="padding:2rem; color:white; opacity:0.8;">Operational error loading data. Please refresh.</div>`;
    }
}

// ---------- DASHBOARD RENDER ----------
function renderDashboard() {
    const avgScore = assessments.length ? Math.round(assessments.reduce((a, b) => a + b.score, 0) / assessments.length) : 0;
    const now = new Date();
    const overdue = reminders.filter(r => new Date(r.due_date) < now && r.status !== 'completed');
    const risk = overdue.reduce((acc, r) => acc + (Number(r.cost_consequence_min) || 0), 0);

    mainContent.innerHTML = `
        <div class="glass-card">
            <h1>Dashboard</h1>
            <div style="display:flex; justify-content: space-around; align-items: center; flex-wrap: wrap; gap: 2rem;">
                <div style="text-align:center;">
                    <div class="score-circle" style="background: conic-gradient(#4f46e5 ${avgScore * 3.6}deg, rgba(255,255,255,0.1) 0deg);">
                        ${avgScore}%
                    </div>
                    <p style="font-weight:600; margin-top:0.5rem; color: white;">Readiness</p>
                </div>
                <div style="text-align:center;">
                   <h2 style="font-size: 3rem; color: ${overdue.length > 0 ? '#ef4444' : '#10b981'};">$${risk.toLocaleString()}</h2>
                   <p style="font-weight:600; color: white;">Risk Exposure</p>
                </div>
            </div>
        </div>`;
}

// ---------- VIEW ROUTING ----------
function setActiveView(view) {
    sidebarItems.forEach(item => item.classList.remove('active'));
    document.querySelectorAll(`[data-view="${view}"]`).forEach(el => el.classList.add('active'));
    
    if (view === 'dashboard') renderDashboard();
    else if (view === 'reminders') renderReminders();
    else {
        mainContent.innerHTML = `<div class="glass-card"><h2>${view}</h2><p style="opacity:0.6;">Module initializing...</p></div>`;
    }
}

// ---------- INITIALIZE ----------
document.addEventListener('DOMContentLoaded', () => {
    if (initSupabase()) {
        checkUser();
    }

    sidebarItems.forEach(item => {
        item.onclick = () => setActiveView(item.dataset.view);
    });

    document.getElementById('logoutBtn').onclick = async () => {
        await supabase.auth.signOut();
        location.reload();
    };
});
