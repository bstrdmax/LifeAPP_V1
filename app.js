/**
 * LifeDesk Vanilla JavaScript Application (Netlify Production Ready)
 * Handles Supabase Auth, CRUD, and Real-time UI updates.
 */

// ---------- CONFIGURATION ----------
const SUPABASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'https://xmemzeunhrjhxrhclclz.supabase.co'
  : 'https://xmemzeunhrjhxrhclclz.supabase.co'; 

const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZW16ZXVuaHJqaHhyaGNsY2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjQ2OTIsImV4cCI6MjA4ODMwMDY5Mn0.6i-Nl5fdBtMMJwDu3l13uhv6MsjQxWHcD_SIo78lfjY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- GLOBAL STATE ----------
let currentUser = null;
let reminders = [];
let assessments = [];
let categories = [];
let currentView = 'dashboard';

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
  return dateFns.format(new Date(date), 'MMM d, yyyy h:mm a');
}

function showLoading() {
  mainContent.innerHTML = `
    <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; height:100%;">
      <div class="spinner"></div>
      <p style="margin-top:1rem; color:#94a3b8;">Syncing operational data...</p>
    </div>
  `;
}

function showError(message) {
  alert('Operational Error: ' + message);
}

// ---------- AUTHENTICATION ----------
async function checkUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    currentUser = user;
    userNameSpan.innerText = user.email.split('@')[0];
    loadInitialData();
  } else {
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
        <p id="authDesc" style="color: #64748b; margin-bottom: 2rem;">Sign in to access your life operations dashboard.</p>
        
        <form id="loginForm">
          <input type="email" id="loginEmail" placeholder="Email" required style="border: 1px solid #e2e8f0;">
          <input type="password" id="loginPassword" placeholder="Password" required style="border: 1px solid #e2e8f0;">
          <button type="submit" id="authSubmit" style="width: 100%;">Initialize Session</button>
        </form>

        <div style="margin-top: 1.5rem; text-align: center; font-size: 0.875rem;">
          <a href="#" id="toggleAuthMode" style="color: var(--primary-color);">First time? Create an account</a>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', authHtml);
  
  const loginForm = document.getElementById('loginForm');
  const toggleLink = document.getElementById('toggleAuthMode');
  const authTitle = document.getElementById('authTitle');
  const authDesc = document.getElementById('authDesc');
  const authSubmit = document.getElementById('authSubmit');
  let isSignup = false;

  toggleLink.addEventListener('click', (e) => {
    e.preventDefault();
    isSignup = !isSignup;
    authTitle.innerText = isSignup ? 'Create Account' : 'Welcome to LifeDesk';
    authDesc.innerText = isSignup ? 'Start your journey to full readiness.' : 'Sign in to access your life operations dashboard.';
    authSubmit.innerText = isSignup ? 'Create Account' : 'Initialize Session';
    toggleLink.innerText = isSignup ? 'Already have an account? Sign in' : 'First time? Create an account';
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    
    let result;
    if (isSignup) {
      result = await supabase.auth.signUp({ email, password });
      if (!result.error) alert('Check your email for confirmation!');
    } else {
      result = await supabase.auth.signInWithPassword({ email, password });
    }

    if (result.error) {
      alert(result.error.message);
    } else if (result.data.user && !isSignup) {
      document.getElementById('authModal').remove();
      checkUser();
    }
  });
}

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.reload();
});

// ---------- DATA LOADING ----------
async function loadInitialData() {
  showLoading();
  try {
    const [catRes, remRes, assRes] = await Promise.all([
      supabase.from('categories').select('*'),
      supabase.from('reminders').select('*, categories(name)').eq('user_id', currentUser.id).order('due_date', { ascending: true }),
      supabase.from('assessments').select('*').eq('user_id', currentUser.id)
    ]);

    if (catRes.error) throw catRes.error;
    if (remRes.error) throw remRes.error;
    if (assRes.error) throw assRes.error;

    categories = catRes.data;
    reminders = remRes.data;
    assessments = assRes.data;

    categorySelect.innerHTML = '<option value="">Select category</option>' + 
      categories.map(c => `<option value="${c.id}">${c.name}</option>`).join('');

    renderView(currentView);
  } catch (err) {
    console.error("System Failure:", err);
    mainContent.innerHTML = `<p style="color:#ef4444; padding: 2rem;">System Error: ${err.message}</p>`;
  }
}

// ---------- VIEW RENDERING ----------
function renderView(view) {
  currentView = view;
  sidebarItems.forEach(item => item.classList.remove('active'));
  document.querySelectorAll(`[data-view="${view}"]`).forEach(el => el.classList.add('active'));

  switch (view) {
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
  const riskExposure = overdue.reduce((acc, r) => acc + (Number(r.cost_consequence_min) || 0), 0);

  mainContent.innerHTML = `
    <div class="glass-card">
      <h1>Operational Overview</h1>
      <div style="display:flex; justify-content: space-around; align-items: center; flex-wrap: wrap; gap: 2rem;">
        <div style="text-align:center;">
          <div class="score-circle" style="background: conic-gradient(var(--primary-color) ${avgScore * 3.6}deg, rgba(255,255,255,0.1) 0deg);">
            ${avgScore}%
          </div>
          <p style="font-weight:600; margin-top:0.5rem;">Readiness Score</p>
        </div>
        <div style="text-align:center;">
           <h2 style="font-size: 3rem; color: ${overdue.length > 0 ? '#ef4444' : '#10b981'};">$${riskExposure.toLocaleString()}</h2>
           <p style="font-weight:600;">Risk Exposure</p>
        </div>
      </div>
    </div>
    
    <div class="glass-card">
      <h3>Immediate Priorities</h3>
      <div style="margin-top:1rem;">
        ${reminders.filter(r => r.status !== 'completed').slice(0, 4).map(r => `
          <div style="padding:1rem; border-bottom:1px solid var(--border-light); display:flex; justify-content:space-between; align-items:center;">
            <div>
              <p style="font-weight:600; color:white;">${r.title}</p>
              <small style="color:#94a3b8;">${formatDate(r.due_date)}</small>
            </div>
            <span style="font-size:0.75rem; background:rgba(99,102,241,0.2); padding:2px 8px; border-radius:10px; color:#a5b4fc;">
              ${r.categories?.name || 'Gen'}
            </span>
          </div>
        `).join('') || '<p style="color:#94a3b8; text-align:center;">No pending risks detected.</p>'}
      </div>
    </div>
  `;
}

function renderReminders() {
  mainContent.innerHTML = `
    <div class="glass-card">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem;">
        <h2>Operational Log</h2>
        <button id="addReminderBtn">+ New Operation</button>
      </div>
      <div id="remindersContainer">
        ${reminders.map(r => `
          <div class="reminder-item ${r.status === 'completed' ? 'completed' : ''}">
            <div style="flex: 1;">
              <strong>${r.title}</strong>
              <div style="font-size:0.8rem; margin-top:0.2rem; opacity:0.8;">
                ${r.categories?.name} • Due: ${formatDate(r.due_date)}
                ${r.recurrence_interval ? ` • 🔁 ${r.recurrence_interval}d` : ''}
              </div>
            </div>
            <div class="reminder-actions">
              <button onclick="toggleComplete('${r.id}')" style="background:${r.status === 'completed' ? '#10b981' : 'rgba(255,255,255,0.1)'};">
                ${r.status === 'completed' ? '✓' : 'Complete'}
              </button>
              <button onclick="deleteReminder('${r.id}')" style="background:rgba(239,68,68,0.2); color:#ef4444; border-color:transparent;">🗑</button>
            </div>
          </div>
        `).join('') || '<p style="text-align:center; padding:2rem; color:#94a3b8;">The log is empty.</p>'}
      </div>
    </div>
  `;
  document.getElementById('addReminderBtn').onclick = () => {
    reminderForm.reset();
    document.getElementById('reminderId').value = '';
    reminderModal.style.display = 'flex';
  };
}

function renderAssessments() {
  const categoriesList = ['Health', 'Vehicle', 'Home', 'Finance'];
  mainContent.innerHTML = `
    <div class="glass-card">
      <h2>Readiness Assessments</h2>
      <p style="color: #94a3b8; margin-bottom: 2rem;">Run protocols to determine your operational integrity.</p>
      <div style="display: grid; gap: 1rem;">
        ${categoriesList.map(cat => {
          const assessment = assessments.find(a => a.category === cat);
          return `
            <div class="reminder-item">
              <div style="flex:1;">
                <strong>${cat} Protocol</strong>
                <p style="font-size: 0.85rem; opacity: 0.7;">Status: ${assessment ? assessment.score + '%' : 'Unverified'}</p>
              </div>
              <button onclick="openAssessmentModal('${cat}')" class="secondary">
                ${assessment ? 'Re-Evaluate' : 'Initialize'}
              </button>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function renderVault() {
  mainContent.innerHTML = `
    <div class="glass-card">
      <h2>The Vault</h2>
      <p style="color:#94a3b8; margin-bottom:2rem;">Secure document storage for critical life operations.</p>
      <div style="border: 2px dashed var(--border-light); padding: 4rem; text-align:center; border-radius: 20px; background: rgba(255,255,255,0.02);">
        <p>Drop critical documents here</p>
        <button class="secondary" style="margin-top:1rem;">Select Files</button>
        <p style="font-size: 0.75rem; color: #64748b; margin-top: 1rem;">OCR & Expiry detection module offline</p>
      </div>
    </div>
  `;
}

function renderFamily() {
  mainContent.innerHTML = `
    <div class="glass-card">
      <h2>Family Management</h2>
      <p style="color:#94a3b8; margin-bottom:2rem;">Manage readiness for your entire household.</p>
      <div style="display:grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap:1rem;">
        <div class="glass-card" style="text-align:center; padding:1.5rem; border-style:dashed; opacity:0.6; cursor: pointer;">
          <p>+ Add Family Member</p>
        </div>
      </div>
    </div>
  `;
}

// ---------- ACTIONS ----------
window.toggleComplete = async (id) => {
  const reminder = reminders.find(r => r.id === id);
  if (!reminder) return;

  const newStatus = reminder.status === 'completed' ? 'upcoming' : 'completed';
  const { error } = await supabase.from('reminders').update({ status: newStatus }).eq('id', id);
  
  if (error) {
    showError(error.message);
    return;
  }

  // Handle Recurrence Logic
  if (newStatus === 'completed' && reminder.recurrence_interval) {
    const nextDue = dateFns.addDays(new Date(reminder.due_date), reminder.recurrence_interval);
    const { error: nextError } = await supabase.from('reminders').insert([{
      user_id: currentUser.id,
      title: reminder.title,
      description: reminder.description,
      category_id: reminder.category_id,
      due_date: nextDue.toISOString(),
      recurrence_interval: reminder.recurrence_interval,
      cost_consequence_min: reminder.cost_consequence_min,
      cost_consequence_max: reminder.cost_consequence_max,
      status: 'upcoming'
    }]);
    if (nextError) console.error("Recurrence scheduling failed:", nextError);
  }

  loadInitialData();
};

window.deleteReminder = async (id) => {
  if (!confirm("Permanently abort this operation?")) return;
  const { error } = await supabase.from('reminders').delete().eq('id', id);
  if (error) showError(error.message);
  else loadInitialData();
};

window.openAssessmentModal = (category) => {
  const questions = {
    Health: ['Primary care physician active?', 'Vaccinations verified?', 'Last checkup within 12 months?'],
    Vehicle: ['Oil service current?', 'Tire pressure verified?', 'Insurance updated?'],
    Home: ['Smoke detectors tested?', 'HVAC filters replaced?', 'Emergency kit stocked?'],
    Finance: ['Emergency fund > 3 months?', 'Credit score reviewed?', 'Tax liabilities set?']
  };
  const qList = questions[category] || ['Requirement 1 verified?', 'Requirement 2 verified?'];

  const modalHtml = `
    <div class="modal" id="assessmentModal" style="display:flex;">
      <div class="modal-content glass">
        <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
        <h2>${category} Protocol</h2>
        <form id="assessmentForm">
          ${qList.map((q, i) => `
            <div style="margin-top:1.2rem;">
              <p style="margin-bottom:0.5rem; font-weight:500;">${q}</p>
              <label><input type="radio" name="q${i}" value="yes" required> Verified</label>
              <label style="margin-left:1rem;"><input type="radio" name="q${i}" value="no"> Failed</label>
            </div>
          `).join('')}
          <button type="submit" style="width:100%; margin-top:2rem;">Save Score</button>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  
  const assessmentForm = document.getElementById('assessmentForm');
  assessmentForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(assessmentForm);
    let score = 0;
    for (let i = 0; i < qList.length; i++) {
      if (formData.get(`q${i}`) === 'yes') score++;
    }
    const finalScore = Math.round((score / qList.length) * 100);

    const { error } = await supabase.from('assessments').upsert({
      user_id: currentUser.id,
      category: category,
      score: finalScore,
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id, category' });

    if (error) showError(error.message);
    document.getElementById('assessmentModal').remove();
    loadInitialData();
  });
};

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
  if (error) showError(error.message);
  else {
    reminderModal.style.display = 'none';
    loadInitialData();
  }
};

// ---------- INITIALIZE ----------
document.querySelectorAll('.close').forEach(btn => {
  btn.onclick = () => {
    reminderModal.style.display = 'none';
    const assModal = document.getElementById('assessmentModal');
    if (assModal) assModal.remove();
  };
});

sidebarItems.forEach(item => {
  item.onclick = () => renderView(item.dataset.view);
});

checkUser();-------
checkUser();
