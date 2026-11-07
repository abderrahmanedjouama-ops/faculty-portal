/**
 * منطق صفحة تسجيل الدخول (/login)
 */

document.addEventListener('DOMContentLoaded', async () => {
  DataRepository.initLocalStore();

  const urlParams = new URLSearchParams(window.location.search);
  const redirectParam = urlParams.get('redirect');
  const loggedOut = urlParams.get('logged_out');

  if (redirectParam && !loggedOut) {
    const notice = document.getElementById('loginRedirectNotice');
    const noticeText = document.getElementById('loginRedirectNoticeText');
    if (notice && noticeText) {
      notice.style.display = 'flex';
      noticeText.textContent = 'يرجى تسجيل الدخول للوصول إلى لوحة التحكم.';
    }
  }

  if (!loggedOut) {
    const activeSession = await DataRepository.getAuthSession();
    if (activeSession && activeSession.slug) {
      window.location.replace(`/admin/${activeSession.slug}`);
      return;
    }
  }

  bindLoginEvents();
});

function bindLoginEvents() {
  const usernameInput = document.getElementById('loginUsernameInput');
  const passwordInput = document.getElementById('loginPasswordInput');
  const togglePassBtn = document.getElementById('toggleLoginPassBtn');
  const loginForm = document.getElementById('departmentLoginForm');

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

  if (loginForm) {
    loginForm.addEventListener('submit', handleLoginSubmit);
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
  e.preventDefault();
  hideLoginError();

  const usernameInput = document.getElementById('loginUsernameInput');
  const passwordInput = document.getElementById('loginPasswordInput');
  const submitBtn = document.getElementById('loginSubmitBtn');

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

  const originalHtml = submitBtn ? submitBtn.innerHTML : '';

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
