/**
 * منطق صفحة تسجيل الدخول (/login)
 * يربط حدث الإرسال (submit) فوراً وبشكل متزامن لمنع المتصفح من إرسال استمارة GET تقليدية،
 * ويدعم المصادقة الفورية عبر Firebase Realtime Database والخادم والنسخة الاحتياطية للأقسام الخمسة.
 */

let isLoginEventsBound = false;

function initLoginPage() {
  if (typeof DataRepository !== 'undefined') {
    DataRepository.initLocalStore();
  }

  // 1. ربط أحداث الاستمارة فوراً وبشكل متزامن قبل أي عملية غير متزامنة (await)
  bindLoginEvents();

  const urlParams = new URLSearchParams(window.location.search);
  const redirectParam = urlParams.get('redirect');
  const loggedOut = urlParams.get('logged_out');
  const urlUsername = (urlParams.get('username') || '').trim();
  const urlPassword = (urlParams.get('password') || '').trim();

  // 2. إذا كان الرابط يحتوي مسبقاً على ?username=...&password=... نقوم بتسجيل الدخول فوراً وتنظيف الرابط
  if (urlUsername && urlPassword) {
    const usernameInput = document.getElementById('loginUsernameInput');
    const passwordInput = document.getElementById('loginPasswordInput');
    if (usernameInput) usernameInput.value = urlUsername;
    if (passwordInput) passwordInput.value = urlPassword;

    window.history.replaceState({}, document.title, '/login');
    executeDepartmentLogin(urlUsername, urlPassword);
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

  if (!loggedOut && typeof DataRepository !== 'undefined') {
    DataRepository.getAuthSession()
      .then(activeSession => {
        if (activeSession && activeSession.slug) {
          window.location.replace(`/admin/${activeSession.slug}`);
        }
      })
      .catch(() => {});
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLoginPage);
} else {
  initLoginPage();
}

function bindLoginEvents() {
  if (isLoginEventsBound) return;

  const usernameInput = document.getElementById('loginUsernameInput');
  const passwordInput = document.getElementById('loginPasswordInput');
  const togglePassBtn = document.getElementById('toggleLoginPassBtn');
  const loginForm = document.getElementById('departmentLoginForm');
  const submitBtn = document.getElementById('loginSubmitBtn');

  if (!loginForm) return;
  isLoginEventsBound = true;

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

  loginForm.addEventListener('submit', handleLoginSubmit);

  if (submitBtn) {
    submitBtn.addEventListener('click', e => {
      e.preventDefault();
      handleLoginSubmit(e);
    });
  }
}

function showLoginError(msg) {
  const box = document.getElementById('loginErrorAlert');
  const text = document.getElementById('loginErrorText');
  if (box && text) {
    text.textContent = msg;
    box.style.display = 'flex';
  }
}

function hideLoginError() {
  const box = document.getElementById('loginErrorAlert');
  if (box) box.style.display = 'none';
}

async function handleLoginSubmit(e) {
  if (e && typeof e.preventDefault === 'function') {
    e.preventDefault();
  }
  hideLoginError();

  const usernameInput = document.getElementById('loginUsernameInput');
  const passwordInput = document.getElementById('loginPasswordInput');

  const identifier = usernameInput ? usernameInput.value.trim() : '';
  const password = passwordInput ? passwordInput.value.trim() : '';

  if (!identifier) {
    showLoginError('يرجى إدخال اسم المستخدم.');
    if (usernameInput) usernameInput.focus();
    return;
  }

  if (!password) {
    showLoginError('يرجى إدخال كلمة المرور.');
    if (passwordInput) passwordInput.focus();
    return;
  }

  await executeDepartmentLogin(identifier, password);
}

async function executeDepartmentLogin(identifier, password) {
  const submitBtn = document.getElementById('loginSubmitBtn');
  const originalHtml = submitBtn ? submitBtn.innerHTML : '<span>تسجيل الدخول</span>';

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span>جاري التحقق...</span>';
    }

    const session = await DataRepository.loginDepartment({
      identifier,
      password
    });

    const targetUrl = session.redirect_url || `/admin/${session.slug}`;
    window.location.replace(targetUrl);
  } catch (err) {
    showLoginError(err.message || 'اسم المستخدم أو كلمة المرور غير صحيحة.');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = originalHtml;
    }
  }
}
