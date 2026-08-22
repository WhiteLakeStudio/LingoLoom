const API_URL = "https://script.google.com/macros/s/AKfycbwxE0F067fGyozTM3O8C_HsgmsatkxVI8VLeeJuAcZmtpLVHPZyTK_pENTfE0-sN8vN/exec";

let authToken = localStorage.getItem("edu_crm_token") || null;
let currentUserRole = null;
let currentLoginRole = 'teacher';
let isTeacherRegistered = false;

const DB = {
  config: null,
  students: {},
  lessons: {},
  tests: {},
  selectedStudentId: null,
  studentProfile: null
};

// ==========================================
// 🔄 СИНХРОНІЗАЦІЯ ТА АВТОРИЗАЦІЯ
// ==========================================

async function checkInitialConfig() {
  try {
    const res = await fetch(`${API_URL}?action=getInitialConfig`);
    const data = await res.json();
    isTeacherRegistered = data.isRegistered;
    updateAuthUIState();

    if (authToken) {
      loadProtectedData();
    }
  } catch (err) {
    console.error("Помилка ініціалізації:", err);
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('loginUsername').value;
  const pass = document.getElementById('loginPassword').value;

  if (currentLoginRole === 'teacher' && !isTeacherRegistered) {
    // Реєстрація викладача
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
      alert("Викладача зареєстровано! Увійдіть з новими даними.");
      isTeacherRegistered = true;
      updateAuthUIState();
    } else {
      alert(result.error || "Помилка реєстрації");
    }
    return;
  }

  // Звичайний вхід
  const loginData = {
    role: currentLoginRole,
    email,
    pass,
    studentId: currentLoginRole === 'student' ? DB.selectedStudentId : null
  };

  const res = await fetch(API_URL, {
    method: "POST",
    body: JSON.stringify({ action: "login", data: loginData })
  });
  const result = await res.json();

  if (result.success) {
    authToken = result.token;
    localStorage.setItem("edu_crm_token", authToken);
    loadProtectedData();
  } else {
    alert(result.error || "Помилка входу");
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
      DB.config = data.config;
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
      DB.lessons[data.studentProfile.id] = data.lessons;
      DB.tests = {};
      DB.tests[data.studentProfile.id] = data.tests;
      DB.selectedStudentId = data.studentProfile.id;
    }

    completeLogin();
  } catch (err) {
    console.error("Помилка завантаження безпечних даних:", err);
  }
}

async function syncData(action, data) {
  try {
    await fetch(API_URL, {
      method: "POST",
      body: JSON.stringify({ action, token: authToken, data })
    });
  } catch (err) {
    console.error("Помилка збереження даних:", err);
  }
}

function logout() {
  authToken = null;
  localStorage.removeItem("edu_crm_token");
  document.getElementById('appContainer').classList.add('hidden');
  document.getElementById('loginScreen').classList.remove('hidden');
  checkInitialConfig();
}

// ==========================================
// 🎨 РЕНДЕР ТА ІНТЕРФЕЙС
// ==========================================

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
  select.value = DB.selectedStudentId;
}

function selectStudent(id) {
  if(!id) return;
  DB.selectedStudentId = id;
  renderApp();
}

function renderStudentProfile() {
  const st = (currentUserRole === 'student') ? DB.studentProfile : DB.students[DB.selectedStudentId];
  if (!st) return;

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

function handleStudentHwSubmit(e) {
  e.preventDefault();
  const lessonId = Number(document.getElementById('activeLessonIdForHw').value);
  const link = document.getElementById('hwSubmissionLink').value;
  const comment = document.getElementById('hwSubmissionComment').value;

  syncData("submitHw", { lessonId, link, comment });
  closeModal('submitHwModal');
  alert("ДЗ надіслано!");
  loadProtectedData();
}

function handleStudentTestSubmit(e) {
  e.preventDefault();
  const testId = Number(document.getElementById('takeTestId').value);
  const stId = DB.selectedStudentId;
  const t = DB.tests[stId].find(item => item.id === testId);
  if (!t) return;

  const studentAnswers = [];
  let correctCount = 0;

  t.questions.forEach((q, idx) => {
    const selected = document.querySelector(`input[name="q_ans_${idx}"]:checked`);
    const ansVal = selected ? Number(selected.value) : -1;
    studentAnswers.push(ansVal);
    if (ansVal === q.correctOpt) correctCount++;
  });

  const percentage = Math.round((correctCount / t.questions.length) * 100);
  const grade = Math.max(1, Math.round((percentage / 100) * 12));

  syncData("submitTest", { testId, studentAnswers, correctCount, percentage, grade });
  closeModal('takeTestModal');
  alert(`Тест здано! Оцінка: ${grade} балів!`);
  loadProtectedData();
}

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function toggleTheme() { document.body.setAttribute('data-theme', document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark'); }

window.onload = function() {
  checkInitialConfig();
};

function closeWelcomeSplash() {
  const splash = document.getElementById('welcomeSplash');
  if (splash) {
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.classList.add('hidden');
    }, 600);
  }
}

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

    // Випадкові координати (з відступами від країв)
    const posX = Math.random() * 80 + 10; 
    const posY = Math.random() * 80 + 10;
    const fontSize = Math.floor(Math.random() * 28) + 20; // 20px - 48px

    wordEl.style.left = `${posX}%`;
    wordEl.style.top = `${posY}%`;
    wordEl.style.fontSize = `${fontSize}px`;

    container.appendChild(wordEl);

    // Видаляємо елемент після завершення анімації (5 сек)
    setTimeout(() => {
      wordEl.remove();
    }, 5000);
  }

  // Початковий запуск кількох слів відразу
  for (let i = 0; i < 6; i++) {
    setTimeout(spawnWord, i * 400);
  }

  // Постійна поява нових слів кожні 700 мс
  splashInterval = setInterval(spawnWord, 700);
}

function closeWelcomeSplash() {
  const splash = document.getElementById('welcomeSplash');
  if (splash) {
    if (splashInterval) clearInterval(splashInterval);
    splash.classList.add('fade-out');
    setTimeout(() => {
      splash.classList.add('hidden');
    }, 800);
  }
}

// Запускаємо анімацію при відкритті сторінки
window.addEventListener('DOMContentLoaded', () => {
  startRandomWordsAnimation();
});