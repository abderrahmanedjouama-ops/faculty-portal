/**
 * منطق صفحة تسجيل الدخول (/login)
 * البوابة الرقمية لكلية العلوم والتكنولوجيا
 */

const DEPARTMENT_CREDENTIALS = {
  automatique: {
    slug: 'automatique',
    username: 'automatique',
    password: 'auto2026',
    name: 'قسم الآلية والإلكترونيك'
  },
  electrique: {
    slug: 'electrique',
    username: 'electrique',
    password: 'elec2026',
    name: 'قسم الهندسة الكهربائية'
  },
  'tronc-commun': {
    slug: 'tronc-commun',
    username: 'tronc-commun',
    password: 'tronc2026',
    name: 'قسم جذع مشترك (خاص بالسنة الأولى)'
  },
  procedes: {
    slug: 'procedes',
    username: 'procedes',
    password: 'proc2026',
    name: 'قسم هندسة الطرائق'
  },
  mecanique: {
    slug: 'mecanique',
    username: 'mecanique',
    password: 'meca2026',
    name: 'قسم الميكانيك'
  }
};

function showLoginError(msg = 'اسم المستخدم أو كلمة المرور غير صحيحة') {
  const box = document.getElementById('loginErrorAlert');
  const text = document.getElementById('loginErrorText');
  if (box && text) {
    text.textContent = msg;
    box.style.display = 'flex';
  } else {
    alert(msg);
  }
}

function hideLoginError() {
  const box = document.getElementById('loginErrorAlert');
  if (box) {
    box.style.display = 'none';
  }
}

function handleLoginSubmit(e) {
  e.preventDefault();
  hideLoginError();

  const usernameInput =
    document.getElementById('loginUsernameInput') ||
    document.getElementById('username') ||
    document.querySelector('input[name="username"]');

  const passwordInput =
    document.getElementById('loginPasswordInput') ||
    document.getElementById('password') ||
    document.querySelector('input[name="password"]');

  const username = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  if (!username) {
    showLoginError('يرجى إدخال اسم المستخدم.');
    if (usernameInput) usernameInput.focus();
    return;
  }

  if (!password) {
    showLoginError('يرجى إدخال كلمة المرور.');
    if (passwordInput) passwordInput.focus();
    return;
  }

  // البحث عن القسم والتحقق من بيانات الدخول
  let matchedDept = null;
  const lowerUser = username.toLowerCase();

  // 1. التحقق من التخصيصات المخزنة في localStorage إن وُجدت
  try {
    const rawSettings = localStorage.getItem('uni_portal_dept_settings_v3');
    if (rawSettings) {
      const list = JSON.parse(rawSettings);
      if (Array.isArray(list)) {
        const found = list.find(
          d =>
            (d.slug && d.slug.toLowerCase() === lowerUser) ||
            (d.username && d.username.toLowerCase() === lowerUser) ||
            (d.department_name && d.department_name === username)
        );
        if (
          found &&
          (found.login_password === password || found.default_password === password)
        ) {
          matchedDept = {
            slug: found.slug || lowerUser,
            username: found.username || username,
            department_name: found.department_name
          };
        }
      }
    }
  } catch {}

  // 2. التحقق من الحسابات الافتراضية الرسمية للأقسام
  if (!matchedDept) {
    for (const key of Object.keys(DEPARTMENT_CREDENTIALS)) {
      const dept = DEPARTMENT_CREDENTIALS[key];
      if (
        (dept.username.toLowerCase() === lowerUser || dept.slug.toLowerCase() === lowerUser) &&
        dept.password === password
      ) {
        matchedDept = {
          slug: dept.slug,
          username: dept.username,
          department_name: dept.name
        };
        break;
      }
    }
  }

  // إذا كانت البيانات غير صحيحة نُظهر رسالة الخطأ بدون إعادة تحميل الصفحة
  if (!matchedDept) {
    showLoginError('اسم المستخدم أو كلمة المرور غير صحيحة');
    return;
  }

  // في حال النجاح: حفظ الجلسة في sessionStorage و localStorage والتوجه للوحة التحكم
  const deptSlug = matchedDept.slug;
  const sessionData = {
    slug: deptSlug,
    username: matchedDept.username,
    department_name: matchedDept.department_name,
    redirect_url: '/admin/' + deptSlug,
    logged_in_at: new Date().toISOString()
  };

  sessionStorage.setItem('dept_session', JSON.stringify(sessionData));
  sessionStorage.setItem('uni_portal_dept_auth_session_v1', JSON.stringify(sessionData));
  localStorage.setItem('uni_portal_dept_auth_session_v1', JSON.stringify(sessionData));

  if (typeof DataRepository !== 'undefined' && DataRepository.saveLocalAuthSession) {
    DataRepository.saveLocalAuthSession(sessionData);
  }

  // مزامنة الكوكي في الخلفية إذا كان الخادم المحلي قيد التشغيل
  try {
    fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ identifier: username, password })
    }).catch(() => {});
  } catch {}

  // التحويل المباشر إلى لوحة تحكم القسم
  window.location.href = '/admin/' + deptSlug;
}

function bindLoginEvents() {
  const loginForm =
    document.getElementById('login-form') ||
    document.getElementById('departmentLoginForm') ||
    document.querySelector('form');

  if (loginForm && !loginForm.__listenerAttached) {
    loginForm.__listenerAttached = true;
    loginForm.addEventListener('submit', handleLoginSubmit);
  }

  const usernameInput =
    document.getElementById('loginUsernameInput') ||
    document.getElementById('username') ||
    document.querySelector('input[name="username"]');

  const passwordInput =
    document.getElementById('loginPasswordInput') ||
    document.getElementById('password') ||
    document.querySelector('input[name="password"]');

  const togglePassBtn = document.getElementById('toggleLoginPassBtn');

  if (usernameInput) {
    usernameInput.addEventListener('input', hideLoginError);
  }

  if (passwordInput) {
    passwordInput.addEventListener('input', hideLoginError);
  }

  if (togglePassBtn && passwordInput) {
    togglePassBtn.addEventListener('click', () => {
      const isHidden = passwordInput.type === 'password';
      passwordInput.type = isHidden ? 'text' : 'password';
      togglePassBtn.textContent = isHidden ? 'إخفاء' : 'إظهار';
    });
  }

  // تنظيف المعلمات في حال تم فتح الصفحة سابقاً عبر GET reload
  const urlParams = new URLSearchParams(window.location.search);
  const queryUser = urlParams.get('username');
  const queryPass = urlParams.get('password');
  if (queryUser && queryPass) {
    if (usernameInput && !usernameInput.value) usernameInput.value = queryUser;
    if (passwordInput && !passwordInput.value) passwordInput.value = queryPass;
    if (window.history && window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  // تنظيف الجلسة القديمة في حال تسجيل الخروج
  if (urlParams.get('logged_out')) {
    sessionStorage.removeItem('dept_session');
    sessionStorage.removeItem('uni_portal_dept_auth_session_v1');
    localStorage.removeItem('uni_portal_dept_auth_session_v1');
  }
}

// ربط النموذج فوراً بمجرد تحميل الملف وبمجرد جاهزية DOM
bindLoginEvents();

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bindLoginEvents);
}
