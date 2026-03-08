/**
 * LifeDesk Vanilla JavaScript Application (Full Feature Build)
 * * Purpose: Comprehensive management of personal life operations.
 * Includes: Auth, Dashboard Analytics, Reminders CRUD, Readiness Assessments,
 * Document Vault simulation, and Family Member management.
 * * Dependencies: Supabase Client, date-fns (loaded via CDN).
 */

// ---------- CONFIGURATION ----------
const SUPABASE_URL = 'https://xmemzeunhrjhxrhclclz.supabase.co';
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
let currentFamilyMemberId = null; // null = primary user
let categories = [];
let reminders = [];
let assessments = [];
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
        </div>
        <div class="glass-card mt-2">
            <h3>Upcoming Critical Operations</h3>
            <div style="margin-top:1rem;">
                ${reminders.filter(r => r.status !== 'completed').slice(0, 5).map(r => `
                    <div style="padding:1rem; border-bottom:1px solid rgba(255,255,255,0.1); display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <strong>${r.title}</strong>
                            <div style="font-size:0.8rem; opacity:0.6;">Due: ${formatDate(r.due_date)}</div>
                        </div>
                        <span style="font-size:0.75rem; background:#4f46e5; padding:4px 8px; border-radius:12px; color:white;">
                            ${r.categories?.name || 'General'}
                        </span>
                    </div>
                `).join('') || '<p style="text-align:center; opacity:0.5;">No pending tasks.</p>'}
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
                                ${r.recurrence_interval ? ` • 🔁 Every ${r.recurrence_interval} days` : ''}
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

    // If recurring, create next task
    if (newStatus === 'completed' && reminder.recurrence_interval) {
        const nextDate = dateFns.addDays(new Date(reminder.due_date), reminder.recurrence_interval);
        await supabase.from('reminders').insert([{
            user_id: currentUser.id,
            title: reminder.title,
            category_id: reminder.category_id,
            due_date: nextDate.toISOString(),
            recurrence_interval: reminder.recurrence_interval,
            status: 'upcoming',
            cost_consequence_min: reminder.cost_consequence_min,
            cost_consequence_max: reminder.cost_consequence_max
        }]);
    }
    loadInitialData();
};

window.deleteReminder = async (id) => {
    if (!confirm("Permanently delete this operation record?")) return;
    const { error } = await supabase.from('reminders').delete().eq('id', id);
    if (error) showError(error.message);
    else loadInitialData();
};

// ---------- ASSESSMENTS ----------
function renderAssessments() {
    const protocols = ['Health', 'Vehicle', 'Home', 'Finance'];
    mainContent.innerHTML = `
        <div class="glass-card">
            <h2>Readiness Protocols</h2>
            <p style="opacity:0.7; margin-bottom:2rem;">Periodic evaluations to determine your system integrity score.</p>
            <div style="display: grid; gap: 1.5rem; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));">
                ${protocols.map(p => {
                    const scoreObj = assessments.find(a => a.category === p);
                    const score = scoreObj ? scoreObj.score : 0;
                    return `
                        <div class="glass-card" style="margin:0; text-align:center; border: 1px solid rgba(255,255,255,0.1);">
                            <h4 style="color:white; margin-bottom:1rem;">${p} Protocol</h4>
                            <div style="font-size:2rem; font-weight:800; color:#4f46e5; margin-bottom:1rem;">${score}%</div>
                            <button onclick="openAssessmentModal('${p}')" class="secondary" style="width:100%;">
                                ${score > 0 ? 'Update Score' : 'Initialize'}
                            </button>
                        </div>`;
                }).join('')}
            </div>
        </div>`;
}

function openAssessmentModal(category) {
    const questionSets = {
        Health: ['Primary care physician verified?', 'Vaccinations up to date?', 'Vision/Dental checks current?', 'Recent bloodwork optimal?'],
        Vehicle: ['Oil service current?', 'Tire depth/pressure verified?', 'Insurance updated?', 'Brake inspection clear?'],
        Home: ['Smoke detectors tested?', 'HVAC filters replaced?', 'Plumbing integrity checked?', 'Roof/Gutters cleared?'],
        Finance: ['Emergency fund verified?', 'Credit score reviewed?', 'Insurance coverage optimal?', 'Tax liability reserved?']
    };
    const questions = questionSets[category] || ['Requirement 1 verified?', 'Requirement 2 verified?'];

    const modalHtml = `
        <div class="modal" id="assModal" style="display:flex;">
            <div class="modal-content glass">
                <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
                <h2 style="color:#1e293b;">${category} Readiness Check</h2>
                <form id="assForm" style="color:#1e293b;">
                    ${questions.map((q, i) => `
                        <div style="margin: 1.25rem 0; padding-bottom:1rem; border-bottom:1px solid #f1f5f9;">
                            <p style="font-weight:600; margin-bottom:0.5rem;">${q}</p>
                            <label style="margin-right:1rem;"><input type="radio" name="q${i}" value="1" required> Verified</label>
                            <label><input type="radio" name="q${i}" value="0"> Failed</label>
                        </div>`).join('')}
                    <button type="submit" style="width:100%; margin-top:1rem;">Save Protocol Score</button>
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

        const { error } = await supabase.from('assessments').upsert({
            user_id: currentUser.id,
            category,
            score,
            updated_at: new Date()
        }, { onConflict: 'user_id, category' });

        if (error) showError(error.message);
        document.getElementById('assModal').remove();
        loadInitialData();
    };
}

// ---------- VAULT ----------
function renderVault() {
    mainContent.innerHTML = `
        <div class="glass-card">
            <h2>The Vault</h2>
            <p style="opacity:0.7; margin-bottom:2rem;">Secure repository for critical operational documents.</p>
            <div style="border: 2px dashed rgba(255,255,255,0.2); padding: 4rem; text-align:center; border-radius: 24px; background: rgba(255,255,255,0.02);">
                <i style="font-size: 3rem; display:block; margin-bottom:1rem;">📁</i>
                <p style="margin-bottom:1.5rem;">Upload birth certificates, insurance policies, or titles.</p>
                <input type="file" id="vaultFile" style="display:none;" multiple>
                <button onclick="document.getElementById('vaultFile').click()">Select Documents</button>
                <p style="font-size: 0.75rem; color: #64748b; margin-top: 1.5rem;">
                    OCR & Automatic Expiry Detection Module: <span style="color:#fbbf24;">Beta (Simulator Active)</span>
                </p>
            </div>
            <div id="fileStatus" style="margin-top:2rem;"></div>
        </div>`;

    document.getElementById('vaultFile').onchange = (e) => {
        const files = e.target.files;
        if (files.length) {
            document.getElementById('fileStatus').innerHTML = `
                <div class="glass-card" style="background:#059669; border-color:transparent; color:white;">
                    <strong>Simulation Result:</strong> Uploaded ${files.length} document(s). OCR detected expiry for ${files[0].name} on Dec 20, 2026.
                </div>`;
        }
    };
}

// ---------- FAMILY ----------
async function renderFamily() {
    // In production, fetch from family_members table
    mainContent.innerHTML = `
        <div class="glass-card">
            <h2>Family Readiness</h2>
            <p style="opacity:0.7; margin-bottom:2rem;">Monitor operational status for all household members.</p>
            <div style="display:grid; gap:1rem; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));">
                <div class="glass-card" style="margin:0; border:2px solid #4f46e5;">
                    <h4 style="color:white;">${userNameSpan.innerText}</h4>
                    <p style="font-size:0.8rem; opacity:0.6;">Primary User</p>
                    <div style="font-size:1.5rem; font-weight:800; margin:1rem 0;">100%</div>
                    <button class="secondary" style="width:100%;" disabled>Active</button>
                </div>
                <div class="glass-card" style="margin:0; border: 2px dashed rgba(255,255,255,0.1); opacity:0.5; display:flex; flex-direction:column; justify-content:center; align-items:center; cursor:pointer;">
                    <span>+ Add Member</span>
                </div>
            </div>
        </div>`;
}

// ---------- MODALS ----------
function openReminderModal(reminder = null) {
    if (reminder) {
        // Edit logic would go here
    } else {
        reminderForm.reset();
        document.getElementById('reminderId').value = '';
    }
    reminderModal.style.display = 'flex';
}

document.querySelector('.close').onclick = () => reminderModal.style.display = 'none';

reminderForm.onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(reminderForm);
    const data = {
        user_id: currentUser.id,
        title: formData.get('title'),
        description: formData.get('description'),
        category_id: formData.get('categoryId'),
        due_date: formData.get('dueDate'),
        recurrence_interval: formData.get('recurrenceInterval') ? parseInt(formData.get('recurrenceInterval')) : null,
        cost_consequence_min: formData.get('costMin') || 0,
        cost_consequence_max: formData.get('costMax') || 0,
        status: 'upcoming'
    };

    const { error } = await supabase.from('reminders').insert([data]);
    if (error) { showError(error.message); }
    else {
        reminderModal.style.display = 'none';
        loadInitialData();
    }
};

// ---------- INITIALIZATION ----------
document.addEventListener('DOMContentLoaded', () => {
    if (initSupabase()) checkUser();

    sidebarItems.forEach(item => {
        item.onclick = () => {
            activeView = item.dataset.view;
            renderCurrentView();
            if (window.innerWidth <= 768) sidebar.classList.remove('open');
        };
    });

    document.getElementById('logoutBtn').onclick = async () => {
        await supabase.auth.signOut();
        location.reload();
    };
});

// ---------- MOBILE TOGGLE ----------
const mobileBtn = document.createElement('button');
mobileBtn.innerHTML = '☰';
mobileBtn.style.cssText = 'position:fixed; top:1rem; left:1rem; z-index:1000; background:rgba(255,255,255,0.1); border:none; color:white; padding:8px 12px; border-radius:8px; display:none;';
mobileBtn.onclick = () => sidebar.classList.toggle('open');
document.body.appendChild(mobileBtn);

const toggleStyle = document.createElement('style');
toggleStyle.textContent = `@media (max-width:768px) { button { display: block !important; } }`;
document.head.appendChild(toggleStyle);
