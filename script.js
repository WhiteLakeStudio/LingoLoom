// ==========================================
// 📌 КОНФІГУРАЦІЯ API (Вкажіть ваш URL з GAS)
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbwwt3DkxIKzPIOd8Yg58g3cmIseRSycC_IIThjBPF0FXgv16hl8v9_AzNwIsc3Ja1Pe/exec";

let authToken = localStorage.getItem("edu_crm_token") || null;
let currentUserRole = null;
let currentLoginRole = 'teacher';
let isTeacherRegistered = false;
let pendingStudentEmail = null;

const DB = {
  config: null,
  students: {},
  lessons: {},
  tests: {},
  selectedStudentId: null,
  studentProfile: null
};

// ==========================================
// 🔔 СУЧАСНІ ТОСТ-СПОМІЩЕННЯ (TOAST SYSTEM)
// ==========================================
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '⚠️' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;
  
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// Перехоплення alert
window.alert = function(msg) { showToast(msg, 'info'); };

// ==========================================
// 🐱 КЕРУВАННЯ ЛОАДЕРОМ (CAT LOADING OVERLAY)
// ==========================================
function showLoading() {
  const loader = document.getElementById('catLoadingOverlay');
  if (loader) loader.classList.remove('hidden');
}

function hideLoading() {
  const loader = document.getElementById('catLoadingOverlay');
  if (loader) loader.classList.add('hidden');
}

// ==========================================
// 🌟 АНІМАЦІЯ ЕКРАНА ПРИВІТАННЯ (WELCOME SPLASH)
// ==========================================
const WELCOME_WORDS = [
  "Hola", "Hello", "Bonjour", "Ciao", "Guten Tag", 
  "Olá", "Nǐ Hǎo", "Namaste", "Вітаємо", "Konnichiwa", 
  "Aloha", "Cześć", "Shalom", "Merhaban"
];

let splashInterval = null;

function startRandomWordsAnimation() {
  const container = document.getElementById('splashBgCanvas');
  if (!container) return;

  function spawnWord() {
    const wordText = WELCOME_WORDS[Math.floor(Math.random() * WELCOME_WORDS.length)];
    const wordEl = document.createElement('span');
    wordEl.className = 'random-word';
    wordEl.innerText = wordText;

    const posX = Math.random() * 80 + 10; 
    const posY = Math.random() * 80 + 10;
    const fontSize = Math.floor(Math.random() * 28) + 20;

    wordEl.style.left = `${posX}%`;
    wordEl.style.top = `${posY}%`;
    wordEl.style.fontSize = `${fontSize}px`;

    container.appendChild(wordEl);
    setTimeout(() => { wordEl.remove(); }, 5000);
  }

  for (let i = 0; i < 6; i++) { setTimeout(spawnWord, i * 400); }
  splashInterval = setInterval(spawnWord, 700);
}

function closeWelcomeSplash() {
  const splash = document.getElementById('welcomeSplash');
  if (splash) {
    if (splashInterval) clearInterval(splashInterval);
    splash.classList.add('fade-out');
    setTimeout(() => { splash.style.display = 'none'; }, 600);
  }
}

// ==========================================
// 🔄 СИНХРОНІЗАЦІЯ ТА АВТОРИЗАЦІЯ (ОРИГІНАЛЬНІ GET-МЕТОДИ)
// ==========================================
async function checkInitialConfig() {
  showLoading();
  try {
    const res = await fetch(`${API_URL}?action=getInitialConfig`);
    const data = await res.json();
    isTeacherRegistered = data.isRegistered;
    updateAuthUIState();

    if (authToken) {
      await loadProtectedData();
    }
  } catch (err) {
    console.error("Помилка ініціалізації:", err);
  } finally {
    hideLoading();
  }
}

async function handleAuthSubmit(e) {
  if (e) e.preventDefault();
  showLoading();

  const email = document.getElementById('loginUsername').value;
  const pass = document.getElementById('loginPassword').value;

  try {
    if (currentLoginRole === 'teacher' && !isTeacherRegistered) {
      const regData = {
        name: document.getElementById('regTeacherName').value,
        phone: document.getElementById('regTeacherPhone').value,
        email,
        pass,
        tg: document.getElementById('regTeacherTg').value,
        zoom: document.getElementById('regTeacherZoom').value
      };

      const res = await fetch(API_URL, {
        method: "POST",
        body: JSON.stringify({ action: "registerTeacher", data: regData })
      });
      const result = await res.json();

      if (result.success) {
        showToast("Викладача зареєстровано! Увійдіть з вказаними даними.", "success");
        isTeacherRegistered = true;
        updateAuthUIState();
      } else {
        showToast(result.error || "Помилка реєстрації", "error");
      }
      return;
    }

    const loginData = { role: currentLoginRole, email, pass };

    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "login", data: loginData })
    });
    const result = await res.json();

    if (result.isFirstLoginRequired) {
      pendingStudentEmail = result.email;
      openModal('firstLoginModal');
      return;
    }

    if (result.success) {
      authToken = result.token;
      localStorage.setItem("edu_crm_token", authToken);
      showToast("Вхід успішний!", "success");
      await loadProtectedData();
    } else {
      showToast(result.error || "Помилка входу: перевірте логін та пароль", "error");
    }
  } catch (err) {
    showToast("Помилка з'єднання з сервером Google.", "error");
    console.error("Помилка входу:", err);
  } finally {
    hideLoading();
  }
}

async function handleFirstLoginPasswordSubmit(e) {
  if (e) e.preventDefault();
  showLoading();

  const newPass = document.getElementById('firstLoginPassInput').value;
  const confirmPass = document.getElementById('firstLoginPassConfirmInput').value;

  if (newPass !== confirmPass) {
    hideLoading();
    showToast("Паролі не збігаються!", "error");
    return;
  }

  const loginData = { role: "student", email: pendingStudentEmail, isFirstLogin: true, newPass };

  try {
    const res = await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action: "login", data: loginData })
    });
    const result = await res.json();

    if (result.success) {
      closeModal('firstLoginModal');
      authToken = result.token;
      localStorage.setItem("edu_crm_token", authToken);
      showToast("Пароль збережено!", "success");
      await loadProtectedData();
    } else {
      showToast(result.error || "Помилка збереження пароля", "error");
    }
  } catch (err) {
    console.error("Помилка першого входу:", err);
  } finally {
    hideLoading();
  }
}

async function loadProtectedData() {
  try {
    const res = await fetch(`${API_URL}?action=getData&token=${authToken}`);
    const data = await res.json();

    if (data.error) {
      logout();
      return;
    }

    currentUserRole = data.role;

    if (currentUserRole === 'teacher') {
      DB.config = data.config || {};
      DB.students = data.students || {};
      DB.lessons = data.lessons || {};
      DB.tests = data.tests || {};
      const studentKeys = Object.keys(DB.students);
      if (studentKeys.length > 0 && !DB.selectedStudentId) {
        DB.selectedStudentId = studentKeys[0];
      }
    } else if (currentUserRole === 'student') {
      DB.studentProfile = data.studentProfile;
      DB.config = { teacherProfile: data.teacherProfile };
      DB.lessons = {};
      DB.lessons[data.studentProfile.id] = data.lessons || [];
      DB.tests = {};
      DB.tests[data.studentProfile.id] = data.tests || [];
      DB.selectedStudentId = data.studentProfile.id;
    }

    completeLogin();
  } catch (err) {
    console.error("Помилка завантаження даних:", err);
    logout();
  }
}

function syncData(action, data) {
  fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action, token: authToken, data })
  }).catch(err => console.error("Помилка фонового збереження:", err));
}

function logout() {
  authToken = null;
  localStorage.removeItem("edu_crm_token");
  document.getElementById('appContainer').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  checkInitialConfig();
}

function updateAuthUIState() {
  if (currentLoginRole !== 'teacher') return;
  const regFields = document.getElementById('teacherRegisterFields');
  const btn = document.getElementById('authSubmitBtn');
  const subtitle = document.getElementById('loginSubtitle');

  if (!isTeacherRegistered) {
    regFields.classList.remove('hidden');
    btn.innerText = "Зареєструватися";
    subtitle.innerText = "Реєстрація викладача";
  } else {
    regFields.classList.add('hidden');
    btn.innerText = "Увійти в кабінет";
    subtitle.innerText = "Вхід для викладача";
  }
}

function completeLogin() {
  document.getElementById('loginScreen').classList.add('hidden');
  closeWelcomeSplash();
  document.getElementById('appContainer').classList.remove('hidden');
  applyRolePermissions();
  renderApp();
}

function applyRolePermissions() {
  const teacherOnlyElements = document.querySelectorAll('.teacher-only, #teacherAdminBox, #addLessonBox');
  if (currentUserRole === 'student') {
    teacherOnlyElements.forEach(el => el.classList.add('hidden'));
    document.getElementById('userStatusBadge').innerText = "👨‍🎓 Кабінет Учня";
  } else {
    teacherOnlyElements.forEach(el => el.classList.remove('hidden'));
    document.getElementById('userStatusBadge').innerText = "👩‍🏫 Кабінет Викладача";
  }
}

// ==========================================
// 🎨 РЕНДЕР ТА ІНТЕРФЕЙС
// ==========================================
function renderApp() {
  renderTeacherProfile();
  renderTeacherStudentList();
  renderStudentProfile();
  renderLessons();
  renderTests();
  renderPayments();
  renderCalendar();
}

function renderTeacherProfile() {
  if (!DB.config || !DB.config.teacherProfile) return;
  const t = DB.config.teacherProfile;
  document.getElementById('tName').innerText = t.name || '-';
  document.getElementById('tAvatar').innerText = t.name ? t.name.split(' ').map(n=>n[0]).join('') : 'ВЧ';
  document.getElementById('tPhone').innerText = t.phone || '-';
  document.getElementById('tEmail').innerText = t.email || '-';
  document.getElementById('tTg').innerText = t.tg || '-';
  document.getElementById('tTgLink').href = t.tg ? `https://t.me/${t.tg.replace('@','')}` : '#';
  document.getElementById('tZoom').href = t.zoom || '#';
}

function renderTeacherStudentList() {
  if (currentUserRole !== 'teacher') return;
  const select = document.getElementById('teacherStudentSelect');
  select.innerHTML = '';
  const studentKeys = Object.keys(DB.students);
  if (studentKeys.length === 0) {
    select.innerHTML = `<option value="">База порожня</option>`;
    return;
  }
  studentKeys.forEach(id => {
    const st = DB.students[id];
    const opt = document.createElement('option');
    opt.value = st.id;
    opt.innerText = st.name;
    select.appendChild(opt);
  });
  if (DB.selectedStudentId) {
    select.value = DB.selectedStudentId;
  }
}

function selectStudent(id) {
  if(!id) return;
  DB.selectedStudentId = id;
  renderApp();
}

function renderStudentProfile() {
  const st = (currentUserRole === 'student') ? DB.studentProfile : DB.students[DB.selectedStudentId];
  if (!st) {
    document.getElementById('stName').innerText = 'Не обрано учня';
    document.getElementById('stAvatar').innerText = '--';
    document.getElementById('stPhone').innerText = '-';
    document.getElementById('stEmail').innerText = '-';
    document.getElementById('stTg').innerText = '-';
    document.getElementById('stLevel').innerText = 'Рівень: -';
    document.getElementById('stNotes').innerText = '-';
    document.getElementById('stBalance').innerText = '0 уроків';
    return;
  }

  document.getElementById('stName').innerText = st.name;
  document.getElementById('stAvatar').innerText = st.name.split(' ').map(n=>n[0]).join('');
  document.getElementById('stPhone').innerText = st.phone || '-';
  document.getElementById('stEmail').innerText = st.email;
  document.getElementById('stTg').innerText = st.tg || '-';
  document.getElementById('stLevel').innerText = `Рівень: ${st.level || '-'}`;
  document.getElementById('stNotes').innerText = st.notes || '-';

  const stLessons = DB.lessons[st.id] || [];
  const doneLessons = stLessons.filter(l => l.status === 'done').length;
  const balance = (st.paidCount || 0) - doneLessons;
  const balEl = document.getElementById('stBalance');
  balEl.innerText = `${balance} уроків`;
  balEl.style.color = balance < 0 ? 'var(--danger)' : 'var(--success)';
}

// ==========================================
// 📚 КЕРУВАННЯ ЗАНЯТТЯМИ
// ==========================================
function completeLesson(id) {
  const stId = DB.selectedStudentId;
  if (!stId || !DB.lessons[stId]) return;
  const l = DB.lessons[stId].find(item => item.id === id);
  if (l) { 
    l.status = 'done'; 
    syncData("saveLessons", DB.lessons);
    showToast("Урок завершено та списано з балансу", "success");
    renderApp(); 
  }
}

function cancelLesson(id) {
  const stId = DB.selectedStudentId;
  if (!stId || !DB.lessons[stId]) return;
  if (confirm("Ви дійсно бажаєте скасувати цей урок? Баланс учня НЕ зміниться.")) {
    DB.lessons[stId] = DB.lessons[stId].filter(item => item.id !== id);
    syncData("saveLessons", DB.lessons);
    showToast("Урок видалено з розкладу", "info");
    renderApp();
  }
}

function openEditLessonModal(id) {
  const stId = DB.selectedStudentId;
  if (!stId || !DB.lessons[stId]) return;
  const lesson = DB.lessons[stId].find(l => l.id === id);
  if (!lesson) return;

  document.getElementById('editLessonId').value = lesson.id;
  document.getElementById('editLessonDate').value = lesson.date;
  document.getElementById('editLessonTopic').value = lesson.topic;
  document.getElementById('editLessonIsPaid').value = lesson.isPaid;
  document.getElementById('editLessonHW').value = lesson.hw || '';
  document.getElementById('editLessonDeadline').value = lesson.deadline || '';
  document.getElementById('editLessonLink').value = lesson.link || '';

  openModal('editLessonModal');
}

function handleEditLessonSubmit(e) {
  if (e) e.preventDefault();
  const stId = DB.selectedStudentId;
  const id = Number(document.getElementById('editLessonId').value);
  if (!stId || !DB.lessons[stId]) return;

  const lesson = DB.lessons[stId].find(l => l.id === id);
  if (lesson) {
    lesson.date = document.getElementById('editLessonDate').value;
    lesson.topic = document.getElementById('editLessonTopic').value;
    lesson.isPaid = document.getElementById('editLessonIsPaid').value;
    lesson.hw = document.getElementById('editLessonHW').value;
    lesson.deadline = document.getElementById('editLessonDeadline').value;
    lesson.link = document.getElementById('editLessonLink').value;

    syncData("saveLessons", DB.lessons);
    showToast("Урок оновлено!", "success");
    renderApp();
  }
  closeModal('editLessonModal');
}

function toggleLessonPayment(lessonId) {
  const stId = DB.selectedStudentId;
  if (!stId || !DB.lessons[stId]) return;
  const l = DB.lessons[stId].find(item => item.id === lessonId);
  if (l) {
    l.isPaid = (l.isPaid === 'paid') ? 'unpaid' : 'paid';
    syncData("saveLessons", DB.lessons);
    renderApp();
  }
}

function openExtendModal(lessonId) {
  document.getElementById('activeLessonIdForDeadline').value = lessonId;
  const stId = DB.selectedStudentId;
  const lesson = DB.lessons[stId].find(l => l.id === lessonId);
  if (lesson && lesson.deadline) {
    document.getElementById('newDeadlineInput').value = lesson.deadline;
  }
  openModal('extendDeadlineModal');
}

function handleExtendDeadlineSubmit(e) {
  if (e) e.preventDefault();
  const lessonId = Number(document.getElementById('activeLessonIdForDeadline').value);
  const stId = DB.selectedStudentId;
  const lesson = DB.lessons[stId].find(l => l.id === lessonId);

  if (lesson) {
    lesson.deadline = document.getElementById('newDeadlineInput').value;
    syncData("saveLessons", DB.lessons);
    showToast("Дедлайн оновлено!", "success");
    renderApp();
  }
  closeModal('extendDeadlineModal');
}

function openHwModal(lessonId) {
  document.getElementById('activeLessonIdForHw').value = lessonId;
  const stId = DB.selectedStudentId;
  const lesson = DB.lessons[stId].find(l => l.id === lessonId);
  if (lesson) {
    document.getElementById('hwSubmissionLink').value = lesson.studentHwLink || '';
    document.getElementById('hwSubmissionComment').value = lesson.studentHwComment || '';
  }
  openModal('submitHwModal');
}

function handleStudentHwSubmit(e) {
  if (e) e.preventDefault();
  const lessonId = Number(document.getElementById('activeLessonIdForHw').value);
  const stId = DB.selectedStudentId;
  const lesson = DB.lessons[stId].find(l => l.id === lessonId);

  if (lesson) {
    lesson.studentHwLink = document.getElementById('hwSubmissionLink').value;
    lesson.studentHwComment = document.getElementById('hwSubmissionComment').value;
    lesson.status = 'done';
    syncData("saveLessons", DB.lessons);
    showToast("Домашнє завдання надіслано!", "success");
    renderApp();
  }
  closeModal('submitHwModal');
}

function alertOverdue() {
  showToast("Термін здачі минув. Зверніться до викладача.", "error");
}

function handleAddStudent(e) {
  if (e) e.preventDefault();
  const id = 'st_' + Date.now();
  
  const newStudent = {
    id,
    name: document.getElementById('newStName').value,
    phone: document.getElementById('newStPhone').value,
    email: document.getElementById('newStEmail').value,
    passHash: "", 
    tg: document.getElementById('newStTg').value,
    level: document.getElementById('newStLevel').value,
    notes: document.getElementById('newStNotes').value,
    paidCount: 0,
    payments: []
  };

  DB.students[id] = newStudent;
  DB.lessons[id] = [];
  DB.tests[id] = [];
  DB.selectedStudentId = id;

  syncData("saveStudents", DB.students);
  syncData("saveLessons", DB.lessons);
  syncData("saveTests", DB.tests);

  showToast("Учня успішно додано!", "success");
  renderApp();
  closeModal('addStudentModal');
  e.target.reset();
}

function setLoginRole(role) {
  currentLoginRole = role;
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
  if (event && event.target) event.target.classList.add('active');

  if (role === 'student') {
    document.getElementById('teacherRegisterFields').classList.add('hidden');
    document.getElementById('loginSubtitle').innerText = "Вхід у кабінет учня";
  } else {
    updateAuthUIState();
  }
}

function renderLessons() {
  const stId = DB.selectedStudentId;
  const tbody = document.getElementById('lessonsTableBody');
  tbody.innerHTML = '';
  const alertBox = document.getElementById('overdueAlertBox');

  if (!stId || !DB.lessons[stId] || DB.lessons[stId].length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted); padding:24px;">Заняття відсутні</td></tr>`;
    if (alertBox) alertBox.classList.add('hidden');
    return;
  }

  let hasOverdue = false;
  const now = new Date();

  DB.lessons[stId].forEach(l => {
    const tr = document.createElement('tr');
    const dt = new Date(l.date).toLocaleString('uk-UA', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    
    let deadlineFormatted = 'Без дедлайну';
    let isExpired = false;
    if (l.deadline) {
      const dlDate = new Date(l.deadline);
      deadlineFormatted = dlDate.toLocaleString('uk-UA', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
      if (now > dlDate && !l.studentHwLink && l.status !== 'done') {
        isExpired = true;
        if (currentUserRole === 'student') hasOverdue = true;
      }
    }

    let studentHwContent = '<span style="color:var(--text-muted); font-size:12px;">Не надіслано</span>';
    if (l.studentHwLink) {
      studentHwContent = `
        <div><a href="${l.studentHwLink}" target="_blank" style="color:var(--primary); font-weight:600;">📎 Відповідь</a></div>
        ${l.studentHwComment ? `<div style="font-size:11px; color:var(--text-muted);">💬 ${l.studentHwComment}</div>` : ''}
      `;
    }

    let paymentBadge = currentUserRole === 'teacher'
      ? (l.isPaid === 'paid' 
        ? `<button class="btn btn-sm btn-secondary" onclick="toggleLessonPayment(${l.id})" style="border-color:var(--success); color:var(--success);">💳 Оплачено</button>` 
        : `<button class="btn btn-sm btn-secondary" onclick="toggleLessonPayment(${l.id})" style="border-color:var(--danger); color:var(--danger);">💳 Борг</button>`)
      : (l.isPaid === 'paid' ? `<span class="badge badge-paid">Оплачено</span>` : `<span class="badge badge-unpaid">Не оплачено</span>`);

    let actionBtn = '';
    if (currentUserRole === 'student') {
      if (l.status === 'done') actionBtn = `<span style="font-size:12px; color:var(--success);">✓ Завершено</span>`;
      else if (isExpired) actionBtn = `<button class="btn btn-sm btn-danger" onclick="alertOverdue()">⚠️ Прострочено</button>`;
      else actionBtn = `<button class="btn btn-sm" onclick="openHwModal(${l.id})">${l.studentHwLink ? '✏️ Змінити ДЗ' : '📤 Надіслати ДЗ'}</button>`;
    } else {
      if (l.status === 'planned') {
        actionBtn = `<div style="display:flex; gap:4px; flex-wrap:wrap;">
          <button class="btn btn-sm" onclick="completeLesson(${l.id})" title="Завершити урок">✓</button>
          <button class="btn btn-sm btn-secondary" onclick="openEditLessonModal(${l.id})" title="Редагувати">✏️</button>
          <button class="btn btn-sm btn-danger" onclick="cancelLesson(${l.id})" title="Видалити">🗑️</button>
        </div>`;
      } else {
        actionBtn = `<div style="display:flex; gap:4px; align-items:center;">
          <span style="font-size:12px; color:var(--success);">✓ Проведено</span>
          <button class="btn btn-sm btn-danger" onclick="cancelLesson(${l.id})">🗑️</button>
        </div>`;
      }
    }

    let statusBadge = l.status === 'done' ? `<span class="badge badge-paid">Проведено</span>`
      : isExpired ? `<span class="badge badge-overdue">Прострочено</span>`
      : l.studentHwLink ? `<span class="badge badge-submitted">ДЗ здано</span>`
      : `<span class="badge badge-planned">Заплановано</span>`;

    tr.innerHTML = `
      <td><strong>${dt}</strong></td>
      <td><strong>${l.topic}</strong></td>
      <td>${paymentBadge}</td>
      <td>
        ${l.hw ? `<div>📘 ${l.hw}</div>` : ''}
        <div style="font-size:11px; color:${isExpired?'var(--danger)':'var(--text-muted)'}; margin-top:2px;">⏰ Дедлайн: <strong>${deadlineFormatted}</strong></div>
        ${l.link ? `<a href="${l.link}" target="_blank" style="color:var(--primary); font-size:11px;">📂 Матеріали</a>` : ''}
      </td>
      <td>${studentHwContent}</td>
      <td>${statusBadge}</td>
      <td>${actionBtn}</td>
    `;
    tbody.appendChild(tr);
  });

  if (alertBox) {
    if (hasOverdue) alertBox.classList.remove('hidden');
    else alertBox.classList.add('hidden');
  }
}

// ==========================================
// 📋 КЕРУВАННЯ ТЕСТАМИ ТА КОНСТРУКТОР
// ==========================================
function renderTests() {
  const stId = DB.selectedStudentId;
  const tbody = document.getElementById('testsTableBody');
  tbody.innerHTML = '';
  const now = new Date();

  if (!stId || !DB.tests[stId] || DB.tests[stId].length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted); padding:24px;">Призначених контрольних робіт немає</td></tr>`;
    return;
  }

  DB.tests[stId].forEach(t => {
    const tr = document.createElement('tr');
    const dt = new Date(t.date).toLocaleString('uk-UA', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    const dl = new Date(t.deadline).toLocaleString('uk-UA', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'});
    const isExpired = now > new Date(t.deadline) && t.status === 'planned';

    let resText = (t.status === 'submitted' || t.status === 'evaluated')
      ? `<strong style="color:var(--primary); font-size:14px;">${t.grade} / 12 балів</strong> <span style="font-size:11px; color:var(--text-muted);">(${t.percentage}%)</span>`
      : '<span style="color:var(--text-muted);">Не складено</span>';

    let actionBtn = currentUserRole === 'student'
      ? ((t.status === 'submitted' || t.status === 'evaluated')
        ? `<button class="btn btn-sm btn-secondary" onclick="openReviewTestModal(${t.id})">🔍 Результати</button>`
        : isExpired ? `<span class="badge badge-overdue">⚠️ Час минув</span>`
        : `<button class="btn btn-sm" onclick="openTakeTestModal(${t.id})">✍️ Пройти тест</button>`)
      : `<button class="btn btn-sm btn-secondary" onclick="openReviewTestModal(${t.id})">👁 Переглянути / Деталі</button>`;

    tr.innerHTML = `
      <td><strong>${t.title}</strong></td>
      <td>${dt}</td>
      <td style="color:${isExpired?'var(--danger)':'inherit'};">${dl}</td>
      <td>${t.questions ? t.questions.length : 0} питань</td>
      <td>${resText}</td>
      <td>${actionBtn}</td>
    `;
    tbody.appendChild(tr);
  });
}

function addQuestionField() {
  const container = document.getElementById('questionsContainer');
  const qId = Date.now();
  const qDiv = document.createElement('div');
  qDiv.className = 'q-builder-item';
  qDiv.id = `q_item_${qId}`;

  qDiv.innerHTML = `
    <div style="display:flex; justify-content:space-between; margin-bottom:8px;">
      <strong>Питання:</strong>
      <button type="button" class="btn btn-sm btn-danger" onclick="document.getElementById('q_item_${qId}').remove()">Видалити</button>
    </div>
    <div class="form-group"><input type="text" class="q-title" placeholder="Текст питання..." required></div>
    <div class="opt-grid-builder">
      <div class="opt-builder-box">
        <label>Варіант 1:</label>
        <input type="text" class="opt-text" required>
        <input type="text" class="opt-img" placeholder="URL картинки (опціонально)">
        <label style="margin-top:4px;"><input type="radio" name="correct_${qId}" value="0" checked> Правильний</label>
      </div>
      <div class="opt-builder-box">
        <label>Варіант 2:</label>
        <input type="text" class="opt-text" required>
        <input type="text" class="opt-img" placeholder="URL картинки (опціонально)">
        <label style="margin-top:4px;"><input type="radio" name="correct_${qId}" value="1"> Правильний</label>
      </div>
      <div class="opt-builder-box">
        <label>Варіант 3:</label>
        <input type="text" class="opt-text">
        <input type="text" class="opt-img" placeholder="URL картинки (опціонально)">
        <label style="margin-top:4px;"><input type="radio" name="correct_${qId}" value="2"> Правильний</label>
      </div>
      <div class="opt-builder-box">
        <label>Варіант 4:</label>
        <input type="text" class="opt-text">
        <input type="text" class="opt-img" placeholder="URL картинки (опціонально)">
        <label style="margin-top:4px;"><input type="radio" name="correct_${qId}" value="3"> Правильний</label>
      </div>
    </div>
  `;
  container.appendChild(qDiv);
}

function handleCreateTestSubmit(e) {
  if (e) e.preventDefault();
  const stId = DB.selectedStudentId;
  if (!stId) { showToast("Оберіть учня!", "error"); return; }

  const qItems = document.querySelectorAll('.q-builder-item');
  if (qItems.length === 0) { showToast("Додайте хоча б одне питання!", "error"); return; }

  const questions = [];
  qItems.forEach(item => {
    const title = item.querySelector('.q-title').value;
    const optTexts = item.querySelectorAll('.opt-text');
    const optImgs = item.querySelectorAll('.opt-img');
    const radios = item.querySelectorAll('input[type="radio"]');

    let correctIdx = 0;
    radios.forEach((r, idx) => { if (r.checked) correctIdx = idx; });

    const options = [];
    optTexts.forEach((t, i) => {
      if (t.value.trim() !== "") {
        options.push({ text: t.value.trim(), img: optImgs[i].value.trim() || null });
      }
    });

    questions.push({ title, options, correctIdx });
  });

  if (!DB.tests[stId]) DB.tests[stId] = [];

  DB.tests[stId].push({
    id: Date.now(),
    title: document.getElementById('testTitleInput').value,
    date: document.getElementById('testDateInput').value,
    deadline: document.getElementById('testDeadlineInput').value,
    questions,
    status: 'planned'
  });

  syncData("saveTests", DB.tests);
  showToast("Тест створено та призначено учню!", "success");
  renderApp();
  closeModal('createTestModal');
}

function openZoomModal(imgSrc) {
  const display = document.getElementById('zoomedImageDisplay');
  if (display) display.src = imgSrc;
  openModal('imageZoomModal');
}

function openTakeTestModal(testId) {
  const stId = DB.selectedStudentId;
  const test = DB.tests[stId].find(t => t.id === testId);
  if (!test) return;

  document.getElementById('takeTestId').value = test.id;
  document.getElementById('takeTestTitle').innerText = test.title;

  const container = document.getElementById('takeTestQuestionsContainer');
  container.innerHTML = '';

  test.questions.forEach((q, qIdx) => {
    const qBox = document.createElement('div');
    qBox.className = 'q-builder-item';
    qBox.style.borderStyle = 'solid';

    let optionsHtml = '';
    const hasImages = q.options.some(opt => opt.img);

    if (hasImages) {
      optionsHtml = `<div class="image-tile-grid">`;
      q.options.forEach((opt, oIdx) => {
        optionsHtml += `
          <div class="image-tile-option" onclick="selectTileOption(this, 'q_${qIdx}')">
            <input type="radio" name="q_${qIdx}" value="${oIdx}" required style="display:none;">
            ${opt.img ? `
              <div class="img-tile-wrapper">
                <button type="button" class="zoom-btn-overlay" onclick="event.stopPropagation(); openZoomModal('${opt.img}')">🔍</button>
                <img src="${opt.img}" class="option-img-preview" alt="Option">
              </div>
            ` : ''}
            <span>${opt.text}</span>
          </div>
        `;
      });
      optionsHtml += `</div>`;
    } else {
      q.options.forEach((opt, oIdx) => {
        optionsHtml += `
          <div style="margin-bottom:6px;">
            <label style="cursor:pointer;"><input type="radio" name="q_${qIdx}" value="${oIdx}" required> ${opt.text}</label>
          </div>
        `;
      });
    }

    qBox.innerHTML = `<h4 style="margin-bottom:10px;">${qIdx + 1}. ${q.title}</h4>${optionsHtml}`;
    container.appendChild(qBox);
  });

  updateTestProgress(test.questions.length);
  openModal('takeTestModal');
}

function selectTileOption(el, groupName) {
  const parent = el.closest('.image-tile-grid');
  parent.querySelectorAll('.image-tile-option').forEach(opt => opt.classList.remove('selected'));
  el.classList.add('selected');
  const radio = el.querySelector('input[type="radio"]');
  if (radio) radio.checked = true;
  updateTestProgress();
}

function updateTestProgress(totalCount) {
  const container = document.getElementById('takeTestQuestionsContainer');
  const total = totalCount || container.querySelectorAll('.q-builder-item').length;
  let answered = 0;

  for (let i = 0; i < total; i++) {
    const checked = container.querySelector(`input[name="q_${i}"]:checked`);
    if (checked) answered++;
  }

  const percent = total > 0 ? Math.round((answered / total) * 100) : 0;
  document.getElementById('testProgressText').innerText = `${answered} з ${total} дано відповідей`;
  document.getElementById('testProgressBarFill').style.width = `${percent}%`;
}

function handleStudentTestSubmit(e) {
  if (e) e.preventDefault();
  const testId = Number(document.getElementById('takeTestId').value);
  const stId = DB.selectedStudentId;
  const test = DB.tests[stId].find(t => t.id === testId);
  if (!test) return;

  let correctCount = 0;
  const userAnswers = [];

  test.questions.forEach((q, qIdx) => {
    const selected = document.querySelector(`input[name="q_${qIdx}"]:checked`);
    const val = selected ? Number(selected.value) : -1;
    userAnswers.push(val);
    if (val === q.correctIdx) correctCount++;
  });

  const total = test.questions.length;
  const percentage = Math.round((correctCount / total) * 100);
  const grade = Math.max(1, Math.round((percentage / 100) * 12));

  test.status = 'submitted';
  test.userAnswers = userAnswers;
  test.grade = grade;
  test.percentage = percentage;

  syncData("saveTests", DB.tests);
  showToast(`Тест складено! Результат: ${grade} / 12 балів`, "success");
  renderApp();
  closeModal('takeTestModal');
}

function openReviewTestModal(testId) {
  const stId = DB.selectedStudentId;
  const test = DB.tests[stId].find(t => t.id === testId);
  if (!test) return;

  document.getElementById('reviewTestTitle').innerText = `Деталі: ${test.title}`;
  const details = document.getElementById('reviewTestDetails');
  details.innerHTML = `
    <div style="margin-bottom:16px; font-size:14px;">
      <strong>Оцінка:</strong> <span style="color:var(--primary); font-size:18px;">${test.grade || 0} / 12</span> (${test.percentage || 0}%)
    </div>
  `;

  test.questions.forEach((q, idx) => {
    const userAns = test.userAnswers ? test.userAnswers[idx] : -1;
    const isCorrect = userAns === q.correctIdx;
    
    details.innerHTML += `
      <div style="padding:10px; border-radius:8px; background:rgba(0,0,0,0.15); margin-bottom:8px; border:1px solid ${isCorrect?'var(--success)':'var(--danger)'}">
        <div><strong>Питання ${idx+1}:</strong> ${q.title}</div>
        <div style="font-size:12px; margin-top:4px;">
          Ваша відповідь: <strong>${q.options[userAns] ? q.options[userAns].text : 'Немає'}</strong> ${isCorrect ? '✅' : '❌'}<br>
          Правильна відповідь: <strong style="color:var(--success);">${q.options[q.correctIdx].text}</strong>
        </div>
      </div>
    `;
  });

  openModal('reviewTestModal');
}

function handleTeacherPassChange(e) {
  if (e) e.preventDefault();
  const oldPass = document.getElementById('oldTeacherPassInput').value;
  const newPass = document.getElementById('newTeacherPassInput').value;

  syncData("changeTeacherPassword", { oldPass, newPass });
  showToast("Пароль викладача оновлено!", "success");
  closeModal('editTeacherPassModal');
}

function handleEditTeacher(e) {
  if (e) e.preventDefault();
  if (!DB.config) DB.config = {};
  
  DB.config.teacherProfile = {
    name: document.getElementById('editTName').value,
    phone: document.getElementById('editTPhone').value,
    email: document.getElementById('editTEmail').value,
    tg: document.getElementById('editTTg').value,
    zoom: document.getElementById('editTZoom').value
  };

  syncData("saveConfig", DB.config);
  showToast("Дані викладача збережено!", "success");
  renderApp();
  closeModal('editTeacherModal');
}

function renderPayments() {
  const stId = DB.selectedStudentId;
  const tbody = document.getElementById('paymentsTableBody');
  tbody.innerHTML = '';
  if(!stId || (!DB.students[stId] && !DB.studentProfile)) return;

  const st = (currentUserRole === 'student') ? DB.studentProfile : DB.students[stId];
  if (st && st.payments) {
    st.payments.forEach(p => {
      const tr = document.createElement('tr');
      const periodStr = (p.periodFrom && p.periodTo) ? `${p.periodFrom} — ${p.periodTo}` : 'Поповнення';
      tr.innerHTML = `<td>${p.date}</td><td><strong>Поповнення балансу</strong></td><td>📅 ${periodStr}</td><td>+${p.count} занять</td><td><strong style="color:var(--success);">${p.amount} грн</strong></td>`;
      tbody.appendChild(tr);
    });
  }

  if (DB.lessons[stId]) {
    DB.lessons[stId].forEach(l => {
      const tr = document.createElement('tr');
      const dt = new Date(l.date).toLocaleDateString('uk-UA');
      tr.innerHTML = `<td>${dt}</td><td>Урок: ${l.topic}</td><td>Заняття у розкладі</td><td>1 урок</td><td><span class="badge ${l.isPaid==='paid'?'badge-paid':'badge-unpaid'}">${l.isPaid==='paid'?'Оплачено':'Не оплачено'}</span></td>`;
      tbody.appendChild(tr);
    });
  }
}

function renderCalendar() {
  const container = document.getElementById('calendarGrid');
  container.innerHTML = '';
  const stId = DB.selectedStudentId;

  ['Пн','Вт','Ср','Чт','Пт','Сб','Нд'].forEach(d => {
    container.innerHTML += `<div style="font-weight:bold; font-size:12px; color:var(--text-muted); padding-bottom:6px;">${d}</div>`;
  });

  if(!stId || !DB.lessons[stId]) return;

  for(let i=1; i<=31; i++) {
    const dayCell = document.createElement('div');
    dayCell.style.cssText = "padding:8px; border:1px solid var(--border); border-radius:10px; font-size:11px; min-height:48px; background: rgba(0,0,0,0.15);";
    const hasLesson = DB.lessons[stId].find(l => new Date(l.date).getDate() === i);
    
    if(hasLesson) {
      dayCell.style.background = hasLesson.status === 'done' ? 'rgba(16,185,129,0.15)' : 'rgba(99,102,241,0.2)';
      dayCell.style.borderColor = hasLesson.status === 'done' ? 'var(--success)' : 'var(--primary)';
      dayCell.innerHTML = `<strong>${i}</strong><br><span style="font-size:10px;">${hasLesson.topic}</span>`;
    } else {
      dayCell.innerHTML = `<span style="color:var(--text-muted);">${i}</span>`;
    }
    container.appendChild(dayCell);
  }
}

function handleAddLesson(e) {
  if (e) e.preventDefault();
  const stId = DB.selectedStudentId;
  if (!stId) { showToast("Спочатку оберіть учня!", "error"); return; }

  if (!DB.lessons[stId]) DB.lessons[stId] = [];

  DB.lessons[stId].push({
    id: Date.now(),
    date: document.getElementById('newLessonDate').value,
    topic: document.getElementById('newLessonTopic').value,
    isPaid: document.getElementById('newLessonIsPaid').value,
    hw: document.getElementById('newLessonHW').value,
    deadline: document.getElementById('newLessonDeadline').value,
    link: document.getElementById('newLessonLink').value,
    studentHwLink: "",
    studentHwComment: "",
    status: 'planned'
  });

  syncData("saveLessons", DB.lessons);
  showToast("Урок заплановано!", "success");
  renderApp();
  e.target.reset();
}

function handleAddPayment(e) {
  if (e) e.preventDefault();
  const stId = DB.selectedStudentId;
  if (!stId) return;

  const st = DB.students[stId];
  const count = Number(document.getElementById('payCount').value);
  const amount = Number(document.getElementById('paySum').value);
  const periodFrom = document.getElementById('payPeriodFrom').value;
  const periodTo = document.getElementById('payPeriodTo').value;
  const payDate = new Date().toISOString().split('T')[0];

  st.paidCount = (st.paidCount || 0) + count;
  if (!st.payments) st.payments = [];
  
  st.payments.push({ date: payDate, count, amount, periodFrom, periodTo });

  syncData("saveStudents", DB.students);
  syncData("logTransaction", {
    studentId: st.id, studentName: st.name, date: payDate,
    type: "Поповнення балансу", periodFrom, periodTo, count, amount
  });

  showToast("Баланс успішно зараховано!", "success");
  renderApp();
  closeModal('addPaymentModal');
}

function handleEditStudentSubmit(e) {
  if (e) e.preventDefault();
  const st = DB.students[DB.selectedStudentId];
  if (!st) return;

  st.name = document.getElementById('editStName').value;
  st.phone = document.getElementById('editStPhone').value;
  st.email = document.getElementById('editStEmail').value;
  st.pass = document.getElementById('editStPass').value;
  st.tg = document.getElementById('editStTg').value;
  st.level = document.getElementById('editStLevel').value;
  st.notes = document.getElementById('editStNotes').value;

  syncData("saveStudents", DB.students);
  showToast("Дані учня оновлено!", "success");
  renderApp();
  closeModal('editStudentModal');
}

function handleDeleteStudent() {
  const st = DB.students[DB.selectedStudentId];
  if (!st) return;

  if (confirm(`Ви дійсно бажаєте вилучити учня "${st.name}"?`)) {
    delete DB.students[DB.selectedStudentId];
    delete DB.lessons[DB.selectedStudentId];
    delete DB.tests[DB.selectedStudentId];

    syncData("saveStudents", DB.students);
    syncData("saveLessons", DB.lessons);
    syncData("saveTests", DB.tests);

    const remainingIds = Object.keys(DB.students);
    DB.selectedStudentId = remainingIds.length > 0 ? remainingIds[0] : null;
    showToast("Учня видалено з системи", "info");
    renderApp();
  }
}

function openEditStudentModal() {
  const st = DB.students[DB.selectedStudentId];
  if (!st) return;
  document.getElementById('editStName').value = st.name;
  document.getElementById('editStPhone').value = st.phone || '';
  document.getElementById('editStEmail').value = st.email;
  document.getElementById('editStPass').value = st.pass || '';
  document.getElementById('editStTg').value = st.tg || '';
  document.getElementById('editStLevel').value = st.level || '';
  document.getElementById('editStNotes').value = st.notes || '';
  openModal('editStudentModal');
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
  ['progressTab', 'testsTab', 'calendarTab', 'paymentsTab'].forEach(id => {
    const tab = document.getElementById(id);
    if (tab) tab.classList.add('hidden');
  });
  const target = document.getElementById(tabId);
  if (target) target.classList.remove('hidden');
}

function toggleTheme() {
  const current = document.body.getAttribute('data-theme');
  document.body.setAttribute('data-theme', current === 'light' ? 'dark' : 'light');
}

window.onload = function() {
  startRandomWordsAnimation();
  checkInitialConfig();
};
