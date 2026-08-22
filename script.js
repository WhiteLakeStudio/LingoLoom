// ==========================================
// 📌 КОНФІГУРАЦІЯ API (Вкажіть ваш URL з GAS)
// ==========================================
const API_URL = "https://script.google.com/macros/s/AKfycbwxE0F067fGyozTM3O8C_HsgmsatkxVI8VLeeJuAcZmtpLVHPZyTK_pENTfE0-sN8vN/exec";

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

  for (let i = 0; i < 6; i++) {
    setTimeout(spawnWord, i * 400);
  }
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
// 🔄 СИНХРОНІЗАЦІЯ ТА АВТОРИЗАЦІЯ
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
  e.preventDefault();
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
        alert("Викладача зареєстровано!");
        isTeacherRegistered = true;
        updateAuthUIState();
      } else {
        alert(result.error || "Помилка реєстрації");
      }
      return;
    }

    const loginData = {
      role: currentLoginRole,
      email,
      pass
    };

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
      await loadProtectedData();
    } else {
      alert(result.error || "Помилка входу");
    }
  } catch (err) {
    console.error("Помилка входу:", err);
  } finally {
    hideLoading();
  }
}

async function handleFirstLoginPasswordSubmit(e) {
  e.preventDefault();
  showLoading();

  const newPass = document.getElementById('firstLoginPassInput').value;
  const confirmPass = document.getElementById('firstLoginPassConfirmInput').value;

  if (newPass !== confirmPass) {
    hideLoading();
    alert("Паролі не збігаються!");
    return;
  }

  const loginData = {
    role: "student",
    email: pendingStudentEmail,
    isFirstLogin: true,
    newPass
  };

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
      await loadProtectedData();
    } else {
      alert(result.error || "Помилка збереження пароля");
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
  document.getElementById('stLevel').innerText = `Рівень: ${st.level}`;
  document.getElementById('stNotes').innerText = st.notes || '-';

  const stLessons = DB.lessons[st.id] || [];
  const doneLessons = stLessons.filter(l => l.status === 'done').length;
  const balance = (st.paidCount || 0) - doneLessons;
  const balEl = document.getElementById('stBalance');
  balEl.innerText = `${balance} уроків`;
  balEl.style.color = balance < 0 ? 'var(--danger)' : 'var(--success)';
}

// ==========================================
// 📚 КЕРУВАННЯ ЗАНЯТТЯМИ (ЗАВЕРШЕННЯ, ОПЛАТА, ДЕДЛАЙН)
// ==========================================
function completeLesson(id) {
  const stId = DB.selectedStudentId;
  if (!stId || !DB.lessons[stId]) return;
  const l = DB.lessons[stId].find(item => item.id === id);
  if (l) { 
    l.status = 'done'; 
    syncData("saveLessons", DB.lessons);
    renderApp(); 
  }
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
  e.preventDefault();
  const lessonId = Number(document.getElementById('activeLessonIdForDeadline').value);
  const stId = DB.selectedStudentId;
  const lesson = DB.lessons[stId].find(l => l.id === lessonId);

  if (lesson) {
    lesson.deadline = document.getElementById('newDeadlineInput').value;
    syncData("saveLessons", DB.lessons);
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
  e.preventDefault();
  const lessonId = Number(document.getElementById('activeLessonIdForHw').value);
  const stId = DB.selectedStudentId;
  const lesson = DB.lessons[stId].find(l => l.id === lessonId);

  if (lesson) {
    lesson.studentHwLink = document.getElementById('hwSubmissionLink').value;
    lesson.studentHwComment = document.getElementById('hwSubmissionComment').value;
    lesson.status = 'done';
    syncData("saveLessons", DB.lessons);
    renderApp();
  }
  closeModal('submitHwModal');
}

function alertOverdue() {
  alert("Термін здачі минув. Зверніться до викладача.");
}

function handleAddStudent(e) {
  e.preventDefault();
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

  renderApp();
  closeModal('addStudentModal');
  e.target.reset();
}

function setLoginRole(role) {
  currentLoginRole = role;
  document.querySelectorAll('.role-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');

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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-muted);">Заняття відсутні</td></tr>`;
    alertBox.classList.add('hidden');
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
        <div><a href="${l.studentHwLink}" target="_blank" style="color:var(--primary); font-weight:600;">📎 Відповідь учня</a></div>
        ${l.studentHwComment ? `<div style="font-size:11px; color:var(--text-muted);">💬 ${l.studentHwComment}</div>` : ''}
      `;
    }

    let paymentBadge = currentUserRole === 'teacher'
      ? (l.isPaid === 'paid' 
        ? `<button class="btn btn-sm btn-secondary" onclick="toggleLessonPayment(${l.id})" style="border-color:var(--success); color:var(--success);">💳 Оплачено</button>` 
        : `<button class="btn btn-sm btn-secondary" onclick="toggleLessonPayment(${l.id})" style="border-color:var(--danger); color:var(--danger);">💳 Не оплачено</button>`)
      : (l.isPaid === 'paid' ? `<span class="badge badge-paid">Оплачено</span>` : `<span class="badge badge-unpaid">Не оплачено</span>`);

    let actionBtn = '';
    if (currentUserRole === 'student') {
      if (l.status === 'done') actionBtn = `<span style="font-size:12px; color:var(--success);">✓ Завершено</span>`;
      else if (isExpired) actionBtn = `<button class="btn btn-sm btn-danger" onclick="alertOverdue()">⚠️ Прострочено</button>`;
      else actionBtn = `<button class="btn btn-sm" onclick="openHwModal(${l.id})">${l.studentHwLink ? '✏️ Змінити ДЗ' : '📤 Надіслати ДЗ'}</button>`;
    } else {
      if (l.status === 'planned') {
        actionBtn = `<div style="display:flex; gap:6px;">
          <button class="btn btn-sm" onclick="completeLesson(${l.id})">Завершити</button>
          <button class="btn btn-sm btn-secondary" onclick="openExtendModal(${l.id})">⏳ Термін</button>
        </div>`;
      } else {
        actionBtn = `<span style="font-size:12px; color:var(--success);">✓ Проведено</span>`;
      }
    }

    let statusBadge = l.status === 'done' ? `<span class="badge badge-paid">Проведено</span>`
      : isExpired ? `<span class="badge badge-overdue">Прострочено</span>`
      : l.studentHwLink ? `<span class="badge badge-submitted">ДЗ здано</span>`
      : `<span class="badge badge-planned">Заплановано</span>`;

    tr.innerHTML = `
      <td><strong>${dt}</strong></td>
      <td>${l.topic}</td>
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

  if (hasOverdue) alertBox.classList.remove('hidden');
  else alertBox.classList.add('hidden');
}

function renderTests() {
  const stId = DB.selectedStudentId;
  const tbody = document.getElementById('testsTableBody');
  tbody.innerHTML = '';
  const now = new Date();

  if (!stId || !DB.tests[stId] || DB.tests[stId].length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-muted);">Призначених контрольних робіт немає</td></tr>`;
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
      <td>${t.questions.length} питань</td>
      <td>${resText}</td>
      <td>${actionBtn}</td>
    `;
    tbody.appendChild(tr);
  });
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
    container.innerHTML += `<div style="font-weight:bold; font-size:12px; color:var(--text-muted);">${d}</div>`;
  });

  if(!stId || !DB.lessons[stId]) return;

  for(let i=1; i<=31; i++) {
    const dayCell = document.createElement('div');
    dayCell.style.cssText = "padding:8px; border:1px solid var(--border); border-radius:6px; font-size:11px; min-height:45px;";
    const hasLesson = DB.lessons[stId].find(l => new Date(l.date).getDate() === i);
    
    if(hasLesson) {
      dayCell.style.background = hasLesson.status === 'done' ? 'rgba(16,185,129,0.15)' : 'rgba(245,158,11,0.15)';
      dayCell.innerHTML = `<strong>${i}</strong><br><span>${hasLesson.status==='done'?'✓':'⏳'}</span>`;
    } else {
      dayCell.innerHTML = `<span style="color:var(--text-muted);">${i}</span>`;
    }
    container.appendChild(dayCell);
  }
}

function handleAddLesson(e) {
  e.preventDefault();
  const stId = DB.selectedStudentId;
  if (!stId) { alert("Спочатку оберіть учня!"); return; }

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
  renderApp();
  e.target.reset();
}

function handleAddPayment(e) {
  e.preventDefault();
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

  renderApp();
  closeModal('addPaymentModal');
}

function handleEditStudentSubmit(e) {
  e.preventDefault();
  const st = DB.students[DB.selectedStudentId];
  if (!st) return;

  st.name = document.getElementById('editStName').value;
  st.phone = document.getElementById('editStPhone').value;
  st.email = document.getElementById('editStEmail').value;
  st.tg = document.getElementById('editStTg').value;
  st.level = document.getElementById('editStLevel').value;
  st.notes = document.getElementById('editStNotes').value;

  syncData("saveStudents", DB.students);
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
    renderApp();
  }
}

function openEditStudentModal() {
  const st = DB.students[DB.selectedStudentId];
  if (!st) return;
  document.getElementById('editStName').value = st.name;
  document.getElementById('editStPhone').value = st.phone || '';
  document.getElementById('editStEmail').value = st.email;
  document.getElementById('editStTg').value = st.tg || '';
  document.getElementById('editStLevel').value = st.level;
  document.getElementById('editStNotes').value = st.notes || '';
  openModal('editStudentModal');
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function switchTab(tabId, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  ['progressTab', 'testsTab', 'calendarTab', 'paymentsTab'].forEach(id => document.getElementById(id).classList.add('hidden'));
  document.getElementById(tabId).classList.remove('hidden');
}
function toggleTheme() {
  document.body.setAttribute('data-theme', document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

window.onload = function() {
  startRandomWordsAnimation();
  checkInitialConfig();
};
