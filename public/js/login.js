/**
 * منطق صفحة تسجيل الدخول (/login)
 * يتضمن التحقق الفوري من بيانات اعتماد الأقسام الخمسة (Client-Side Verification)
 * وحفظ الجلسة في sessionStorage و localStorage والتوجيه الفوري إلى /admin/[dept].
 */

const DEPARTMENT_CREDENTIALS = {
  automatique: {
    passwords: ['auto2026'],
    slug: 'automatique',
    name: 'قسم الآلية والإلكترونيك'
  },
  electrique: {
    passwords: ['elec2026'],
    slug: 'electrique',
    name: 'قسم الهندسة الكهربائية'
  },
  'tronc-commun': {
    passwords: ['tc2026', 'tronc2026'],
    slug: 'tronc-commun',
    name: 'قسم جذع مشترك (خاص بالسنة الأولى)'
  },
  procedes: {
    passwords: ['proc2026'],
    slug: 'procedes',
    name: 'قسم هندسة الطرائق'
  },
  mecanique: {
    passwords: ['meca2026'],
    slug: 'mecanique',
    name: 'قسم الميكانيك'
  }
};

function showLoginError(msg) {
  const box = document.getElementById('loginErrorAlert');
  const text = document.getElementById('loginErrorText');
  const message = msg || 'اسم المستخدم أو كلمة المرور غير صحيحة';
  if (text) {
    text.textContent = message;
  }
  if (box) {
    box.style.display = 'flex';
  }
}

function hideLoginError() {
  const box = document.getElementById('loginErrorAlert');
  if (box) {
    box.style.display = 'none';
  }
}

function findDepartmentCredential(identifier, password) {
  const cleanId = String(identifier || '').trim().toLowerCase();
  const cleanPass = String(password || '').trim();
  if (!cleanId || !cleanPass) return null;

  for (const [slug, dept] of Object.entries(DEPARTMENT_CREDENTIALS)) {
    if (slug === cleanId || dept.name.toLowerCase() === cleanId) {
      if (dept.passwords.includes(cleanPass)) {
        return dept;
      }
    }
  }
  return null;
}

/**
 * معالج تسجيل الدخول الرئيسي المتاح عالمياً (Global handleLogin)
 */
function handleLogin(e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }
  hideLoginError();

  const usernameInput =
    document.getElementById('username') ||
    document.getElementById('loginUsernameInput');
  const passwordInput =
    document.getElementById('password') ||
    document.getElementById('loginPasswordInput');
  const submitBtn = document.getElementById('loginSubmitBtn');

  const identifier = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  if (!identifier || !password) {
    showLoginError('اسم المستخدم أو كلمة المرور غير صحيحة');
    if (!identifier && usernameInput) usernameInput.focus();
    else if (!password && passwordInput) passwordInput.focus();
    return false;
  }

  // 1. التحقق الفوري المباشر عبر خريطة بيانات الاعتماد المحلية للأقسام الخمسة
  const matchedDept = findDepartmentCredential(identifier, password);
  if (matchedDept) {
    const deptSlug = matchedDept.slug;

    // حفظ الجلسة في sessionStorage
    try {
      sessionStorage.setItem('currentDepartment', deptSlug);
      sessionStorage.setItem('isAuthenticated', 'true');
    } catch (err) {
      console.warn('sessionStorage error:', err);
    }

    // حفظ الجلسة أيضاً في DataRepository / localStorage لدعم صفحات الإدارة
    const sessionObj = {
      slug: deptSlug,
      username: deptSlug,
      department_name: matchedDept.name,
      redirect_url: `/admin/${deptSlug}`,
      logged_in_at: new Date().toISOString()
    };

    try {
      if (typeof DataRepository !== 'undefined' && DataRepository.saveLocalAuthSession) {
        DataRepository.saveLocalAuthSession(sessionObj);
      }
    } catch (err) {
      console.warn('localStorage error:', err);
    }

    // إرسال طلب تسجيل الجلسة في الخادم في الخلفية دون تعطيل المتصفح
    if (typeof fetch === 'function') {
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: deptSlug,
          username: deptSlug,
          password
        })
      }).catch(() => {});
    }

    // التوجيه الفوري إلى لوحة تحكم القسم
    window.location.replace('/admin/' + deptSlug);
    return false;
  }

  // 2. فحص إضافي عبر DataRepository في حال تم تحديث كلمة المرور سحابياً
  if (typeof DataRepository !== 'undefined' && DataRepository.loginDepartment) {
    const originalBtnHtml = submitBtn ? submitBtn.innerHTML : '';
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>جاري التحقق...</span>';
    }

    DataRepository.loginDepartment({ identifier, password })
      .then(session => {
        sessionStorage.setItem('currentDepartment', session.slug);
        sessionStorage.setItem('isAuthenticated', 'true');
        window.location.replace('/admin/' + session.slug);
      })
      .catch(() => {
        showLoginError('اسم المستخدم أو كلمة المرور غير صحيحة');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = originalBtnHtml;
        }
      });
    return false;
  }

  // 3. فشل التحقق
  showLoginError('اسم المستخدم أو كلمة المرور غير صحيحة');
  return false;
}

// إتاحة الدالة عالمياً لنافذة المتصفح لتعمل مع onsubmit في وسم form
window.handleLogin = handleLogin;

function bindLoginEvents() {
  const usernameInput =
    document.getElementById('username') ||
    document.getElementById('loginUsernameInput');
  const passwordInput =
    document.getElementById('password') ||
    document.getElementById('loginPasswordInput');
  const togglePassBtn = document.getElementById('toggleLoginPassBtn');
  const loginForm =
    document.getElementById('login-form') ||
    document.getElementById('departmentLoginForm');
  const submitBtn = document.getElementById('loginSubmitBtn');

  if (usernameInput) {
    usernameInput.addEventListener('input', hideLoginError);
  }

  if (passwordInput) {
    passwordInput.addEventListener('input', hideLoginError);
  }

  if (togglePassBtn && passwordInput) {
    togglePassBtn.addEventListener('click', e => {
      e.preventDefault();
      const isHidden = passwordInput.type === 'password';
      passwordInput.type = isHidden ? 'text' : 'password';
      togglePassBtn.textContent = isHidden ? 'إخفاء' : 'إظهار';
    });
  }

  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin);
  }

  if (submitBtn) {
    submitBtn.addEventListener('click', handleLogin);
  }
}

function initLoginPage() {
  if (typeof DataRepository !== 'undefined') {
    DataRepository.initLocalStore();
  }

  bindLoginEvents();

  const urlParams = new URLSearchParams(window.location.search);
  const redirectParam = urlParams.get('redirect');
  const loggedOut = urlParams.get('logged_out');
  const urlUsername = (urlParams.get('username') || '').trim();
  const urlPassword = (urlParams.get('password') || '').trim();

  // فحص بيانات الدخول إذا كانت ممررة في الرابط
  if (urlUsername && urlPassword) {
    const usernameInput =
      document.getElementById('username') ||
      document.getElementById('loginUsernameInput');
    const passwordInput =
      document.getElementById('password') ||
      document.getElementById('loginPasswordInput');
    if (usernameInput) usernameInput.value = urlUsername;
    if (passwordInput) passwordInput.value = urlPassword;

    window.history.replaceState({}, document.title, '/login');
    handleLogin();
    return;
  }

  if (redirectParam && !loggedOut) {
    const notice = document.getElementById('loginRedirectNotice');
    const noticeText = document.getElementById('loginRedirectNoticeText');
    if (notice && noticeText) {
      notice.style.display = 'flex';
      noticeText.textContent = 'يرجى تسجيل الدخول للوصول إلى لوحة التحكم.';
    }
  }

  // إذا كانت هناك جلسة مسجلة مسبقاً وغير منتهية
  if (!loggedOut) {
    const sessAuth = sessionStorage.getItem('isAuthenticated');
    const sessDept = sessionStorage.getItem('currentDepartment');
    if (sessAuth === 'true' && sessDept) {
      window.location.replace(`/admin/${sessDept}`);
      return;
    }

    if (typeof DataRepository !== 'undefined') {
      DataRepository.getAuthSession()
        .then(activeSession => {
          if (activeSession && activeSession.slug) {
            window.location.replace(`/admin/${activeSession.slug}`);
          }
        })
        .catch(() => {});
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLoginPage);
} else {
  initLoginPage();
}
