// ============================================================
// LifeDesk Vanilla JavaScript Application (Refined)
// 
// Purpose: Manages user session, CRUD for reminders/assessments,
//          dynamic view rendering, and real‑time readiness scores.
// Dependencies: Supabase client, date-fns (loaded via CDN).
// Environment: Local dev uses hardcoded keys (replace with env vars for Netlify).
// ============================================================

// ---------- CONFIGURATION ----------
// For local development, hardcode your Supabase URL and anon key.
// When deploying to Netlify, these will be replaced by environment variables.
const SUPABASE_URL = 'https://xmemzeunhrjhxrhclclz.supabase.co'; // Replace with your URL
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZW16ZXVuaHJqaHhyaGNsY2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjQ2OTIsImV4cCI6MjA4ODMwMDY5Mn0.6i-Nl5fdBtMMJwDu3l13uhv6MsjQxWHcD_SIo78lfjY'; // Replace with your anon key

// Validate that keys are set (previons accidental empty values)
if (!SUPABASE_URL.includes('supabase.co') || SUPABASE_ANON_KEY === 'yeyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhtZW16ZXVuaHJqaHhyaGNsY2x6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjQ2OTIsImV4cCI6MjA4ODMwMDY5Mn0.6i-Nl5fdBtMMJwDu3l13uhv6MsjQxWHcD_SIo78lfjY') {
  console.warn('Please set your Supabase URL and anon key in app.js');
}

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ---------- GLOBAL STATE ----------
let currentUser = null;               // Supabase user object
let currentFamilyMemberId = null;     // null = primary user, otherwise family_members.id
let categories = [];                  // List of life categories (from DB)
let reminders = [];                   // User's reminders (filtered by family member)
let assessments = [];                 // User's assessments (filtered by family member)

// ---------- DOM ELEMENT REFERENCES ----------
const mainContent = document.getElementById('main-content');
const sidebar = document.getElementById('sidebar');
const sidebarItems = document.querySelectorAll('.sidebar li, .bottom-nav button');
const logoutBtn = document.getElementById('logoutBtn');
const modal = document.getElementById('reminderModal');
const modalTitle = document.getElementById('modalTitle');
const reminderForm = document.getElementById('reminderForm');
const closeModal = document.querySelector('.close');
const categorySelect = document.getElementById('categoryId');
const userNameSpan = document.getElementById('userName');

// ---------- UTILITY FUNCTIONS ----------
function formatDate(date) {
  return dateFns.format(new Date(date), 'MMM d, yyyy h:mm a');
}

// Show a loading spinner inside main content
function showLoading() {
  mainContent.innerHTML = `<div class="spinner"></div>`;
}

// Show an error message (simple alert for now, could be a toast)
function showError(message) {
  alert('Error: ' + message);
}

// ---------- AUTHENTICATION ----------
// Create a modal login/signup form (replaces the prompt)
function showAuthModal() {
  // Remove any existing auth modal
  const existing = document.getElementById('authModal');
  if (existing) existing.remove();

  const authHtml = `
    <div class="modal" id="authModal" style="display:flex;">
      <div class="modal-content glass">
        <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
        <h2>Welcome to LifeDesk</h2>
        <div style="display: flex; gap: 1rem; margin-bottom: 1rem;">
          <button id="showLogin" class="secondary">Login</button>
          <button id="showSignup" class="secondary">Sign Up</button>
        </div>
        <div id="authForms">
          <!-- Login form (default visible) -->
          <form id="loginForm">
            <input type="email" id="loginEmail" placeholder="Email" required>
            <input type="password" id="loginPassword" placeholder="Password" required>
            <button type="submit">Login</button>
          </form>
          <!-- Signup form (hidden initially) -->
          <form id="signupForm" style="display: none;">
            <input type="email" id="signupEmail" placeholder="Email" required>
            <input type="password" id="signupPassword" placeholder="Password" required>
            <button type="submit">Sign Up</button>
          </form>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', authHtml);
  const authModal = document.getElementById('authModal');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const showLoginBtn = document.getElementById('showLogin');
  const showSignupBtn = document.getElementById('showSignup');

  // Toggle forms
  showLoginBtn.addEventListener('click', () => {
    loginForm.style.display = 'block';
    signupForm.style.display = 'none';
  });
  showSignupBtn.addEventListener('click', () => {
    loginForm.style.display = 'none';
    signupForm.style.display = 'block';
  });

  // Login submission
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      alert('Login failed: ' + error.message);
    } else {
      authModal.remove();
      checkUser(); // re-check user state
    }
  });

  // Signup submission
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      alert('Signup failed: ' + error.message);
    } else {
      alert('Check your email for confirmation!');
      authModal.remove();
    }
  });
}

async function checkUser() {
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    currentUser = user;
    userNameSpan.innerText = user.email;
    loadInitialData();
  } else {
    showAuthModal();
  }
}

// Logout handler
logoutBtn.addEventListener('click', async () => {
  await supabase.auth.signOut();
  location.reload(); // reset UI
});

// ---------- DATA LOADING ----------
async function loadInitialData() {
  showLoading();
  try {
    await loadCategories();
    await loadReminders();
    await loadAssessments();
    setActiveView('dashboard');
  } catch (err) {
    showError('Failed to load data: ' + err.message);
  }
}

async function loadCategories() {
  const { data, error } = await supabase.from('categories').select('*');
  if (error) throw error;
  categories = data;
  // Populate category dropdown
  categorySelect.innerHTML = '<option value="">Select category</option>';
  categories.forEach(c => {
    categorySelect.innerHTML += `<option value="${c.id}">${c.name}</option>`;
  });
}

async function loadReminders() {
  let query = supabase
    .from('reminders')
    .select('*, categories(name, color, icon)')
    .eq('user_id', currentUser.id);
  
  if (currentFamilyMemberId) {
    query = query.eq('family_member_id', currentFamilyMemberId);
  } else {
    query = query.is('family_member_id', null);
  }

  const { data, error } = await query.order('due_date', { ascending: true });
  if (error) throw error;
  reminders = data;
  // Refresh current view if needed
  const activeView = document.querySelector('.sidebar li.active')?.dataset.view;
  if (activeView === 'reminders') renderReminders();
  else if (activeView === 'dashboard') renderDashboard();
}

async function loadAssessments() {
  let query = supabase
    .from('assessments')
    .select('*')
    .eq('user_id', currentUser.id);
  
  if (currentFamilyMemberId) {
    query = query.eq('family_member_id', currentFamilyMemberId);
  } else {
    query = query.is('family_member_id', null);
  }

  const { data, error } = await query;
  if (error) throw error;
  assessments = data;
  const activeView = document.querySelector('.sidebar li.active')?.dataset.view;
  if (activeView === 'assessments') renderAssessments();
  else if (activeView === 'dashboard') renderDashboard();
}

// ---------- VIEW RENDERING ----------
function renderDashboard() {
  const totalScore = assessments.reduce((acc, a) => acc + a.score, 0);
  const avgScore = assessments.length ? Math.round(totalScore / assessments.length) : 0;

  const now = new Date();
  const overdueReminders = reminders.filter(r => 
    r.status === 'upcoming' && new Date(r.due_date) < now
  );
  const riskExposure = overdueReminders.reduce((acc, r) => acc + (r.cost_consequence_min || 0), 0);

  const html = `
    <div class="glass-card">
      <h1>Dashboard</h1>
      <div class="score-circle" style="background: conic-gradient(#4f46e5 ${avgScore * 3.6}deg, #e2e8f0 ${avgScore * 3.6}deg 360deg);">
        ${avgScore}%
      </div>
      <p class="text-center">Readiness Score</p>
      <p class="text-center">Risk Exposure: $${riskExposure.toLocaleString()}</p>
      <div class="flex gap-2 justify-center">
        <button id="quickAddReminder">+ Quick Add</button>
        <button id="quickStartAssessment">Start Assessment</button>
      </div>
    </div>
    <div class="glass-card mt-2">
      <h3>Upcoming Tasks</h3>
      <ul>
        ${reminders.filter(r => r.status === 'upcoming').slice(0, 5).map(r => `
          <li>${r.title} – due ${formatDate(r.due_date)}</li>
        `).join('')}
      </ul>
    </div>
  `;
  mainContent.innerHTML = html;
  document.getElementById('quickAddReminder').addEventListener('click', () => openReminderModal());
  document.getElementById('quickStartAssessment').addEventListener('click', () => setActiveView('assessments'));
}

function renderReminders() {
  const html = `
    <div class="glass-card">
      <div class="flex justify-between items-center">
        <h2>Reminders</h2>
        <button id="newReminderBtn">+ New</button>
      </div>
      <div id="remindersList">
        ${reminders.map(r => `
          <div class="reminder-item">
            <div>
              <strong>${r.title}</strong> – ${r.categories?.name || 'Uncategorized'}
              <div>Due: ${formatDate(r.due_date)}</div>
              ${r.recurrence_interval ? `<small>Repeats every ${r.recurrence_interval} days</small>` : ''}
              <div>Cost if missed: $${r.cost_consequence_min || 0} - $${r.cost_consequence_max || 0}</div>
            </div>
            <div class="reminder-actions">
              <button class="complete-btn" data-id="${r.id}" title="Complete">✓</button>
              <button class="edit-btn" data-id="${r.id}" title="Edit">✎</button>
              <button class="delete-btn" data-id="${r.id}" title="Delete">🗑</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
  mainContent.innerHTML = html;
  document.getElementById('newReminderBtn').addEventListener('click', () => openReminderModal());
  
  document.querySelectorAll('.complete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      await completeReminder(id);
    });
  });
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.dataset.id;
      const reminder = reminders.find(r => r.id == id);
      openReminderModal(reminder);
    });
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.dataset.id;
      if (confirm('Delete reminder?')) {
        const { error } = await supabase.from('reminders').delete().eq('id', id);
        if (error) showError('Error deleting: ' + error.message);
        else loadReminders();
      }
    });
  });
}

function renderAssessments() {
  const categoriesList = ['Health', 'Vehicle', 'Home', 'Finance'];
  const html = `
    <div class="glass-card">
      <h2>Readiness Assessments</h2>
      <p>Select a category to assess:</p>
      ${categoriesList.map(cat => {
        const assessment = assessments.find(a => a.category === cat);
        return `
          <div class="flex justify-between items-center mt-2">
            <strong>${cat}</strong>
            <span>${assessment ? assessment.score + '%' : 'Not assessed'}</span>
            <button class="assess-btn secondary" data-cat="${cat}">${assessment ? 'Update' : 'Start'}</button>
          </div>
        `;
      }).join('')}
    </div>
  `;
  mainContent.innerHTML = html;
  document.querySelectorAll('.assess-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const category = e.target.dataset.cat;
      openAssessmentModal(category);
    });
  });
}

function renderVault() {
  mainContent.innerHTML = `
    <div class="glass-card">
      <h2>The Vault</h2>
      <p>Upload documents (simulated). Expiration dates will be detected.</p>
      <input type="file" id="fileUpload" multiple>
      <button id="uploadBtn">Upload</button>
      <div id="uploadedFiles"></div>
    </div>
  `;
  document.getElementById('uploadBtn').addEventListener('click', () => {
    alert('In production, this would upload to Supabase Storage and trigger OCR via a Netlify function.');
  });
}

async function renderFamily() {
  const { data: members, error } = await supabase
    .from('family_members')
    .select('*')
    .eq('user_id', currentUser.id);
  if (error) showError('Could not load family members');

  const html = `
    <div class="glass-card">
      <h2>Family</h2>
      <p>Current: ${currentFamilyMemberId ? 'Family member' : 'Primary user'}</p>
      <div class="flex flex-col gap-1">
        <button id="switchPrimary" class="secondary">Switch to Primary</button>
        ${members?.map(m => `
          <button class="switch-member secondary" data-id="${m.id}">Switch to ${m.name}</button>
        `).join('')}
      </div>
    </div>
  `;
  mainContent.innerHTML = html;
  document.getElementById('switchPrimary').addEventListener('click', () => {
    currentFamilyMemberId = null;
    loadInitialData();
  });
  document.querySelectorAll('.switch-member').forEach(btn => {
    btn.addEventListener('click', (e) => {
      currentFamilyMemberId = e.target.dataset.id;
      loadInitialData();
    });
  });
}

// ---------- REMINDER COMPLETION & RECURRENCE ----------
async function completeReminder(id) {
  const reminder = reminders.find(r => r.id == id);
  if (!reminder) return;

  const { error: updateError } = await supabase
    .from('reminders')
    .update({ status: 'completed' })
    .eq('id', id);
  if (updateError) {
    showError('Error completing reminder: ' + updateError.message);
    return;
  }

  if (reminder.recurrence_interval) {
    const nextDue = dateFns.addDays(new Date(reminder.due_date), reminder.recurrence_interval);
    const { error: insertError } = await supabase
      .from('reminders')
      .insert({
        user_id: reminder.user_id,
        family_member_id: reminder.family_member_id,
        category_id: reminder.category_id,
        title: reminder.title,
        description: reminder.description,
        due_date: nextDue,
        recurrence_interval: reminder.recurrence_interval,
        cost_consequence_min: reminder.cost_consequence_min,
        cost_consequence_max: reminder.cost_consequence_max,
        status: 'upcoming'
      });
    if (insertError) showError('Error creating next reminder: ' + insertError.message);
  }
  loadReminders();
}

// ---------- MODAL HANDLING ----------
function openReminderModal(reminder = null) {
  modalTitle.innerText = reminder ? 'Edit Reminder' : 'New Reminder';
  if (reminder) {
    document.getElementById('reminderId').value = reminder.id;
    document.getElementById('title').value = reminder.title;
    document.getElementById('description').value = reminder.description;
    document.getElementById('categoryId').value = reminder.category_id;
    document.getElementById('dueDate').value = dateFns.format(new Date(reminder.due_date), "yyyy-MM-dd'T'HH:mm");
    document.getElementById('recurrenceInterval').value = reminder.recurrence_interval || '';
    document.getElementById('costMin').value = reminder.cost_consequence_min || '';
    document.getElementById('costMax').value = reminder.cost_consequence_max || '';
  } else {
    reminderForm.reset();
    document.getElementById('reminderId').value = '';
  }
  modal.style.display = 'flex';
}

closeModal.addEventListener('click', () => modal.style.display = 'none');
window.addEventListener('click', (e) => {
  if (e.target === modal) modal.style.display = 'none';
});

reminderForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(reminderForm);
  const reminderData = {
    user_id: currentUser.id,
    family_member_id: currentFamilyMemberId,
    category_id: formData.get('categoryId'),
    title: formData.get('title'),
    description: formData.get('description'),
    due_date: formData.get('dueDate'),
    recurrence_interval: formData.get('recurrenceInterval') || null,
    cost_consequence_min: formData.get('costMin') || null,
    cost_consequence_max: formData.get('costMax') || null,
    status: 'upcoming'
  };
  const id = formData.get('reminderId');
  let error;
  if (id) {
    ({ error } = await supabase.from('reminders').update(reminderData).eq('id', id));
  } else {
    ({ error } = await supabase.from('reminders').insert(reminderData));
  }
  if (error) {
    showError('Error saving reminder: ' + error.message);
  } else {
    modal.style.display = 'none';
    loadReminders();
    setActiveView('reminders');
  }
});

// ---------- ASSESSMENT MODAL ----------
function openAssessmentModal(category) {
  const questions = {
    Health: ['Do you have a primary care physician?', 'Are your vaccinations up to date?'],
    Vehicle: ['Is your oil change due within 500 miles?', 'Are your tires properly inflated?'],
    Home: ['Have you tested smoke detectors recently?', 'Is your HVAC filter clean?'],
    Finance: ['Do you have an emergency fund?', 'Have you reviewed your credit report?']
  };
  const qList = questions[category] || ['Question 1?', 'Question 2?'];

  const modalHtml = `
    <div class="modal" id="assessmentModal" style="display:flex;">
      <div class="modal-content glass">
        <span class="close" onclick="this.closest('.modal').remove()">&times;</span>
        <h2>${category} Assessment</h2>
        <form id="assessmentForm">
          ${qList.map((q, i) => `
            <div class="mt-2">
              <p>${q}</p>
              <label><input type="radio" name="q${i}" value="yes" required> Yes</label>
              <label><input type="radio" name="q${i}" value="no"> No</label>
            </div>
          `).join('')}
          <button type="submit" class="mt-3">Save Score</button>
        </form>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', modalHtml);
  const assessmentModal = document.getElementById('assessmentModal');
  
  assessmentModal.querySelector('.close').addEventListener('click', () => assessmentModal.remove());
  
  assessmentModal.querySelector('#assessmentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    let yesCount = 0;
    for (let i = 0; i < qList.length; i++) {
      if (formData.get(`q${i}`) === 'yes') yesCount++;
    }
    const score = Math.round((yesCount / qList.length) * 100);
    
    const { error } = await supabase.from('assessments').upsert({
      user_id: currentUser.id,
      family_member_id: currentFamilyMemberId,
      category,
      score,
      answers: Object.fromEntries(formData),
      updated_at: new Date()
    }, { onConflict: 'user_id, family_member_id, category' }); // Specify conflict columns
    
    if (error) showError('Error saving: ' + error.message);
    assessmentModal.remove();
    loadAssessments();
  });
}

// ---------- VIEW ROUTING ----------
function setActiveView(view) {
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

sidebarItems.forEach(item => {
  item.addEventListener('click', () => {
    const view = item.dataset.view;
    setActiveView(view);
  });
});

// ---------- MOBILE SIDEBAR TOGGLE ----------
// Add a hamburger button to open the sidebar on mobile (if needed)
const mobileMenuBtn = document.createElement('button');
mobileMenuBtn.innerHTML = '☰';
mobileMenuBtn.id = 'mobileMenuBtn';
mobileMenuBtn.style.position = 'fixed';
mobileMenuBtn.style.top = '1rem';
mobileMenuBtn.style.left = '1rem';
mobileMenuBtn.style.zIndex = '1000';
mobileMenuBtn.style.display = 'none'; // Hidden on desktop, shown via media query
document.body.appendChild(mobileMenuBtn);

mobileMenuBtn.addEventListener('click', () => {
  sidebar.classList.toggle('open');
});

// Show mobile menu button only on small screens (CSS will handle)
const style = document.createElement('style');
style.textContent = `
  @media (max-width: 768px) {
    #mobileMenuBtn {
      display: block !important;
    }
  }
`;
document.head.appendChild(style);

// ---------- INITIALIZATION ----------
checkUser();