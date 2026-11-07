/**
 * منطق لوحة التحكم المستقلة لكل قسم (Standalone Department Dashboard)
 * المسارات المدعومة:
 *  - /admin/automatique   -> قسم الآلية والإلكترونيك
 *  - /admin/electrique    -> قسم الهندسة الكهربائية
 *  - /admin/tronc-commun  -> قسم جذع مشترك (خاص بالسنة الأولى)
 *  - /admin/procedes      -> قسم هندسة الطرائق
 *  - /admin/mecanique     -> قسم الميكانيك
 */

const DeptState = {
  slug: 'automatique',
  path: '/admin/automatique',
  departmentName: 'قسم الآلية والإلكترونيك',
  subtitle: '',
  requests: [],
  notifications: [],
  deptSetting: null,
  searchQuery: '',
  statusFilter: 'all',
  pendingRejectRequestId: null
};

document.addEventListener('DOMContentLoaded', async () => {
  DataRepository.initLocalStore();
  resolveLockedDepartmentFromUrl();

  // حماية المسارات الصارمة (Strict Route Protection):
  // التحقق من جلسة القسم المسجل حالياً ومنعه من فتح صفحة أي قسم آخر
  const session = await DataRepository.getAuthSession();
  if (!session || !session.slug) {
    window.location.replace(`/login?redirect=${encodeURIComponent(DeptState.path)}`);
    return;
  }

  if (session.slug !== DeptState.slug) {
    window.location.replace(
      `/admin/${session.slug}?forbidden_dept=${encodeURIComponent(DeptState.slug)}`
    );
    return;
  }

  applyLockedDepartmentBranding();
  bindDepartmentEvents();
  await refreshDepartmentData();

  // إظهار تنبيه إذا حاول القسم فتح رابط قسم آخر وتمت إعادته لصفحته المخصصة
  const urlParams = new URLSearchParams(window.location.search);
  const forbiddenDept = urlParams.get('forbidden_dept');
  if (forbiddenDept) {
    const routes = PORTAL_CONSTANTS.DEPARTMENT_ROUTES || {};
    const targetName = routes[forbiddenDept]?.name || forbiddenDept;
    showToast({
      type: 'error',
      title: 'وصول مقيد بحساب القسم الحالي',
      message: `أنت مسجل الدخول حالياً في (${DeptState.departmentName}). لا يمكنك الدخول إلى (${targetName}) إلا بعد تسجيل الخروج أولاً.`
    });
    window.history.replaceState({}, document.title, DeptState.path);
  }
});

/**
 * استخراج القسم المخصص حصراً لهذه الصفحة من الرابط (/admin/<slug>)
 */
function resolveLockedDepartmentFromUrl() {
  const pathname = (window.location.pathname || '').replace(/\/+$/, '');
  const parts = pathname.split('/').filter(Boolean);
  const slugCandidate = parts[parts.length - 1] || '';

  const queryParams = new URLSearchParams(window.location.search);
  const queryDept = queryParams.get('dept') || '';

  const routes = PORTAL_CONSTANTS.DEPARTMENT_ROUTES || {};
  const matchedRoute =
    routes[slugCandidate] ||
    routes[queryDept] ||
    Object.values(routes).find(r => r.name === queryDept) ||
    routes.automatique;

  DeptState.slug = matchedRoute.slug;
  DeptState.path = matchedRoute.path;
  DeptState.departmentName = matchedRoute.name;
  DeptState.subtitle = matchedRoute.subtitle;
}

/**
 * تثبيت اسم القسم في الترويسة والعناوين ونافذة الإعدادات (بدون أي قائمة لتبديل القسم)
 */
function applyLockedDepartmentBranding() {
  const deptName = DeptState.departmentName;

  document.title = `لوحة تحكم - ${deptName} | كلية العلوم والتكنولوجيا`;

  const deptHeroTitle = document.getElementById('deptHeroTitle');
  if (deptHeroTitle) {
    deptHeroTitle.textContent = `لوحة تحكم - ${deptName}`;
  }

  const tableSectionTitle = document.getElementById('tableSectionTitle');
  if (tableSectionTitle) {
    tableSectionTitle.textContent = `جدول الطلبات الواردة — ${deptName}`;
  }

  const settingsModalHeaderDeptName = document.getElementById('settingsModalHeaderDeptName');
  if (settingsModalHeaderDeptName) {
    settingsModalHeaderDeptName.textContent = deptName;
  }

  const lockedDepartmentNameLabel = document.getElementById('lockedDepartmentNameLabel');
  if (lockedDepartmentNameLabel) {
    lockedDepartmentNameLabel.textContent = deptName;
  }
}

/**
 * تحميل وتحديث البيانات الخاصة بهذا القسم حصراً من الخادم
 */
async function refreshDepartmentData() {
  const [requests, notifications, allSettings] = await Promise.all([
    DataRepository.fetchRequests(DeptState.departmentName),
    DataRepository.fetchNotifications(DeptState.departmentName),
    DataRepository.fetchDepartmentSettings()
  ]);

  // ضمان عرض طلبات هذا القسم حصراً
  DeptState.requests = (requests || []).filter(
    r => r.department === DeptState.departmentName
  );
  DeptState.notifications = notifications || [];
  DeptState.deptSetting =
    (allSettings || []).find(s => s.department_name === DeptState.departmentName) || {
      department_name: DeptState.departmentName,
      slug: DeptState.slug,
      username: DeptState.slug,
      sender_gmail: null,
      gmail_app_password: null,
      is_configured: false
    };

  renderDepartmentEmailIndicators();
  renderDepartmentStats();
  renderDepartmentRequestsTable();
  updateNotificationCountBadge();
}

/**
 * ربط الأحداث التفاعلية في صفحة القسم
 */
function bindDepartmentEvents() {
  // زر تسجيل الخروج من القسم
  const logoutBtn = document.getElementById('logoutDeptBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      await DataRepository.logoutDepartment();
      window.location.replace('/login?logged_out=1');
    });
  }

  // البحث والفلترة داخل طلبات القسم
  const searchInput = document.getElementById('adminSearchInput');
  const statusFilter = document.getElementById('adminStatusFilter');
  const resetFiltersBtn = document.getElementById('resetAdminFiltersBtn');

  if (searchInput) {
    searchInput.addEventListener('input', e => {
      DeptState.searchQuery = e.target.value.trim();
      renderDepartmentRequestsTable();
    });
  }

  if (statusFilter) {
    statusFilter.addEventListener('change', e => {
      DeptState.statusFilter = e.target.value;
      renderDepartmentRequestsTable();
    });
  }

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener('click', () => {
      DeptState.searchQuery = '';
      DeptState.statusFilter = 'all';
      if (searchInput) searchInput.value = '';
      if (statusFilter) statusFilter.value = 'all';
      renderDepartmentRequestsTable();
    });
  }

  // نافذة إعدادات الحساب والبريد الإلكتروني للقسم
  const openSettingsBtn = document.getElementById('openDeptSettingsModalBtn');
  const closeSettingsBtn = document.getElementById('closeDeptSettingsModalBtn');
  const cancelSettingsBtn = document.getElementById('cancelDeptSettingsBtn');
  const settingsModal = document.getElementById('departmentSettingsModal');
  const settingsForm = document.getElementById('departmentSettingsForm');
  const appPassInput = document.getElementById('deptAppPasswordInput');
  const togglePassBtn = document.getElementById('toggleAppPasswordBtn');
  const deptLoginPassInput = document.getElementById('deptLoginPasswordInput');
  const toggleDeptLoginPassBtn = document.getElementById('toggleDeptLoginPassBtn');
  const sendTestEmailBtn = document.getElementById('sendTestEmailBtn');

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener('click', () => {
      openDepartmentSettingsModal(false);
    });
  }

  const closeSettingsModal = () => {
    if (settingsModal) settingsModal.classList.remove('open');
  };

  if (closeSettingsBtn) closeSettingsBtn.addEventListener('click', closeSettingsModal);
  if (cancelSettingsBtn) cancelSettingsBtn.addEventListener('click', closeSettingsModal);
  if (settingsModal) {
    settingsModal.addEventListener('click', e => {
      if (e.target === settingsModal) closeSettingsModal();
    });
  }

  if (appPassInput) {
    appPassInput.addEventListener('input', () => {
      updateAppPasswordCharCount(appPassInput.value);
    });
  }

  if (togglePassBtn && appPassInput) {
    togglePassBtn.addEventListener('click', () => {
      const isHidden = appPassInput.type === 'password';
      appPassInput.type = isHidden ? 'text' : 'password';
      togglePassBtn.textContent = isHidden ? 'إخفاء' : 'إظهار';
    });
  }

  if (toggleDeptLoginPassBtn && deptLoginPassInput) {
    toggleDeptLoginPassBtn.addEventListener('click', () => {
      const isHidden = deptLoginPassInput.type === 'password';
      deptLoginPassInput.type = isHidden ? 'text' : 'password';
      toggleDeptLoginPassBtn.textContent = isHidden ? 'إخفاء' : 'إظهار';
    });
  }

  if (settingsForm) {
    settingsForm.addEventListener('submit', handleSaveDepartmentSettings);
  }

  if (sendTestEmailBtn) {
    sendTestEmailBtn.addEventListener('click', handleSendTestEmail);
  }

  // نافذة رفض الطلب
  const closeRejectBtn = document.getElementById('closeRejectModalBtn');
  const cancelRejectBtn = document.getElementById('cancelRejectBtn');
  const rejectModal = document.getElementById('rejectRequestModal');
  const confirmRejectForm = document.getElementById('confirmRejectForm');

  const closeRejectModal = () => {
    if (rejectModal) rejectModal.classList.remove('open');
    DeptState.pendingRejectRequestId = null;
  };

  if (closeRejectBtn) closeRejectBtn.addEventListener('click', closeRejectModal);
  if (cancelRejectBtn) cancelRejectBtn.addEventListener('click', closeRejectModal);
  if (rejectModal) {
    rejectModal.addEventListener('click', e => {
      if (e.target === rejectModal) closeRejectModal();
    });
  }

  document.querySelectorAll('.reason-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const reasonInput = document.getElementById('rejectionReasonInput');
      if (reasonInput) {
        reasonInput.value = chip.textContent.trim();
        reasonInput.focus();
      }
    });
  });

  if (confirmRejectForm) {
    confirmRejectForm.addEventListener('submit', handleConfirmRejectSubmit);
  }

  // نافذة سجل الإشعارات
  const openNotifBtn = document.getElementById('openNotificationsModalBtn');
  const closeNotifBtn = document.getElementById('closeNotificationsModalBtn');
  const closeNotifFooterBtn = document.getElementById('closeNotificationsFooterBtn');
  const notifModal = document.getElementById('notificationsModal');

  if (openNotifBtn) {
    openNotifBtn.addEventListener('click', () => {
      renderNotificationsLogModal();
      if (notifModal) notifModal.classList.add('open');
    });
  }

  const closeNotifModal = () => {
    if (notifModal) notifModal.classList.remove('open');
  };

  if (closeNotifBtn) closeNotifBtn.addEventListener('click', closeNotifModal);
  if (closeNotifFooterBtn) closeNotifFooterBtn.addEventListener('click', closeNotifModal);
  if (notifModal) {
    notifModal.addEventListener('click', e => {
      if (e.target === notifModal) closeNotifModal();
    });
  }
}

/**
 * تحديث شارات حالة إعداد البريد الإلكتروني للقسم في الترويسة واللافتة
 */
function renderDepartmentEmailIndicators() {
  const setting = DeptState.deptSetting;
  const isConfigured = Boolean(
    setting && setting.is_configured && setting.sender_gmail && setting.gmail_app_password
  );

  const headerBadge = document.getElementById('headerEmailConfigStatus');
  if (headerBadge) {
    if (isConfigured) {
      headerBadge.className = 'status-badge ready';
      headerBadge.textContent = '✓ بريد القسم مُفعّل';
    } else {
      headerBadge.className = 'status-badge pending';
      headerBadge.textContent = '⚠️ بريد القسم غير مُعدّ';
    }
  }

  const senderGmailEl = document.getElementById('deptCurrentSenderGmail');
  if (senderGmailEl) {
    if (isConfigured) {
      senderGmailEl.textContent = setting.sender_gmail;
      senderGmailEl.style.color = 'var(--emerald-700)';
    } else {
      senderGmailEl.textContent = 'غير مُعدّ بعد (اضغط على إعدادات البريد لإعداده)';
      senderGmailEl.style.color = 'var(--crimson-600)';
    }
  }
}

/**
 * فتح نافذة إعدادات البريد الإلكتروني المقفلة لهذا القسم
 */
function openDepartmentSettingsModal(showWarningBanner = false) {
  const modal = document.getElementById('departmentSettingsModal');
  const warningBox = document.getElementById('settingsUnconfiguredWarningBox');
  const senderInput = document.getElementById('deptSenderGmailInput');
  const appPassInput = document.getElementById('deptAppPasswordInput');
  const loginPassInput = document.getElementById('deptLoginPasswordInput');
  const statusBadge = document.getElementById('deptSettingsConfigStatusBadge');
  const togglePassBtn = document.getElementById('toggleAppPasswordBtn');
  const toggleDeptLoginPassBtn = document.getElementById('toggleDeptLoginPassBtn');

  if (!modal) return;

  if (warningBox) {
    warningBox.style.display = showWarningBanner ? 'flex' : 'none';
  }

  const setting = DeptState.deptSetting || {};
  const routeInfo = PORTAL_CONSTANTS.DEPARTMENT_ROUTES[DeptState.slug] || {};
  const isConfigured = Boolean(
    setting.is_configured && setting.sender_gmail && setting.gmail_app_password
  );

  if (senderInput) senderInput.value = setting.sender_gmail || '';
  if (appPassInput) {
    appPassInput.value = setting.gmail_app_password || '';
    appPassInput.type = 'password';
  }
  if (togglePassBtn) togglePassBtn.textContent = 'إظهار';

  if (loginPassInput) {
    loginPassInput.value = setting.login_password || routeInfo.defaultPassword || '';
    loginPassInput.type = 'password';
  }
  if (toggleDeptLoginPassBtn) toggleDeptLoginPassBtn.textContent = 'إظهار';

  updateAppPasswordCharCount(setting.gmail_app_password || '');

  if (statusBadge) {
    if (isConfigured) {
      statusBadge.className = 'status-badge ready';
      statusBadge.textContent = `✓ البريد مُفعّل (${setting.sender_gmail})`;
    } else {
      statusBadge.className = 'status-badge pending';
      statusBadge.textContent = '⚠️ البريد غير مُعدّ بعد';
    }
  }

  modal.classList.add('open');
}

function updateAppPasswordCharCount(rawVal) {
  const countEl = document.getElementById('appPasswordCharCount');
  if (!countEl) return;
  const cleanLen = String(rawVal || '').replace(/\s+/g, '').length;
  countEl.textContent = `${cleanLen} / 16 حرفاً`;
  if (cleanLen === 16) {
    countEl.style.color = 'var(--emerald-600)';
  } else if (cleanLen > 0) {
    countEl.style.color = 'var(--amber-600)';
  } else {
    countEl.style.color = 'var(--gray-500)';
  }
}

/**
 * حفظ إعدادات الحساب والبريد الإلكتروني للقسم
 */
async function handleSaveDepartmentSettings(e) {
  e.preventDefault();
  const senderInput = document.getElementById('deptSenderGmailInput');
  const appPassInput = document.getElementById('deptAppPasswordInput');
  const loginPassInput = document.getElementById('deptLoginPasswordInput');
  const saveBtn = document.getElementById('saveDeptSettingsBtn');

  const sender_gmail = senderInput ? senderInput.value.trim().toLowerCase() : '';
  const gmail_app_password = appPassInput ? appPassInput.value.replace(/\s+/g, '') : '';
  const login_password = loginPassInput ? loginPassInput.value.trim() : '';

  try {
    if (saveBtn) saveBtn.disabled = true;
    await DataRepository.saveDepartmentSetting(DeptState.departmentName, {
      sender_gmail,
      gmail_app_password,
      login_password
    });

    await refreshDepartmentData();
    openDepartmentSettingsModal(false);

    showToast({
      type: 'success',
      title: 'تم حفظ إعدادات الحساب والبريد بنجاح',
      message: sender_gmail
        ? `تم تحديث كلمة مرور الدخول واعتماد البريد (${sender_gmail}) لـ (${DeptState.departmentName}).`
        : `تم تحديث كلمة مرور الدخول الخاصة بـ (${DeptState.departmentName}) بنجاح.`
    });
  } catch (err) {
    showToast({
      type: 'error',
      title: 'خطأ في حفظ الإعدادات',
      message: err.message
    });
  } finally {
    if (saveBtn) saveBtn.disabled = false;
  }
}

/**
 * إرسال رسالة تجريبية للقسم عبر smtp.gmail.com:465
 */
async function handleSendTestEmail() {
  const senderInput = document.getElementById('deptSenderGmailInput');
  const appPassInput = document.getElementById('deptAppPasswordInput');
  const testBtn = document.getElementById('sendTestEmailBtn');

  const sender_gmail = senderInput ? senderInput.value.trim().toLowerCase() : '';
  const gmail_app_password = appPassInput ? appPassInput.value.replace(/\s+/g, '') : '';

  const originalHtml = testBtn ? testBtn.innerHTML : '';

  try {
    if (testBtn) {
      testBtn.disabled = true;
      testBtn.innerHTML = '<span>جاري الاتصال بـ smtp.gmail.com:465...</span>';
    }

    const result = await DataRepository.sendDepartmentTestEmail({
      department_name: DeptState.departmentName,
      sender_gmail,
      gmail_app_password
    });

    await refreshDepartmentData();
    openDepartmentSettingsModal(false);

    showToast({
      type: 'email',
      title: 'نجح اختبار البريد الإلكتروني',
      message: result.message || `تم إرسال الرسالة التجريبية بنجاح إلى (${sender_gmail}).`
    });
  } catch (err) {
    showToast({
      type: 'error',
      title: 'فشل اختبار البريد الإلكتروني',
      message: err.message
    });
  } finally {
    if (testBtn) {
      testBtn.disabled = false;
      testBtn.innerHTML = originalHtml;
    }
  }
}

/**
 * تحديث البطاقات الإحصائية الأربع الخاصة بهذا القسم فقط
 */
function renderDepartmentStats() {
  const list = DeptState.requests;
  const total = list.length;
  const pending = list.filter(r => r.status === 'pending').length;
  const ready = list.filter(r => r.status === 'ready').length;
  const rejected = list.filter(r => r.status === 'rejected').length;

  const setNum = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
  };

  setNum('statTotalRequests', total);
  setNum('statPendingRequests', pending);
  setNum('statReadyRequests', ready);
  setNum('statRejectedRequests', rejected);
}

/**
 * عرض جدول الطلبات الخاصة بهذا القسم فقط (8 أعمدة)
 */
function renderDepartmentRequestsTable() {
  const tbody = document.getElementById('adminRequestsTableBody');
  const countBadge = document.getElementById('tableResultsCountBadge');
  if (!tbody) return;

  let filtered = [...DeptState.requests];

  if (DeptState.statusFilter !== 'all') {
    filtered = filtered.filter(r => r.status === DeptState.statusFilter);
  }

  if (DeptState.searchQuery) {
    const q = DeptState.searchQuery.toLowerCase();
    filtered = filtered.filter(r => {
      const fullName = `${r.first_name} ${r.last_name}`.toLowerCase();
      return (
        r.student_card_number.toLowerCase().includes(q) ||
        fullName.includes(q) ||
        (r.tracking_code || '').toLowerCase().includes(q) ||
        (r.email || '').toLowerCase().includes(q)
      );
    });
  }

  if (countBadge) {
    countBadge.textContent = `${filtered.length} طلب`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8">
          <div class="empty-state">
            <div class="empty-state-icon">
              <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
            </div>
            <h4>لا توجد طلبات مطابقة في ${escapeHtml(DeptState.departmentName)}</h4>
            <p>لم يتم العثور على طلبات تطابق معايير البحث أو الفلترة الحالية في هذا القسم.</p>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = filtered
    .map(req => {
      const statusMeta =
        PORTAL_CONSTANTS.STATUS_META[req.status] || PORTAL_CONSTANTS.STATUS_META.pending;
      const conditionalText = formatConditionalDetails(req);

      let statusHtml = `<span class="status-badge ${statusMeta.badgeClass}"><span class="status-dot"></span> ${statusMeta.adminLabel}</span>`;
      if (req.status === 'rejected' && req.rejection_reason) {
        statusHtml += `
          <div style="margin-top: 0.35rem; font-size: 0.76rem; color: var(--crimson-700); max-width: 210px; line-height: 1.4;">
            <strong>السبب:</strong> ${escapeHtml(req.rejection_reason)}
          </div>
        `;
      }

      const isReadyDisabled = req.status === 'ready' ? 'disabled' : '';
      const isRejectDisabled = req.status === 'rejected' ? 'disabled' : '';

      return `
        <tr>
          <td>
            <span style="font-family: monospace; font-weight: 800; color: var(--navy-800); background: var(--navy-50); padding: 0.25rem 0.55rem; border-radius: 6px; border: 1px solid var(--navy-100);">
              ${escapeHtml(req.tracking_code)}
            </span>
          </td>
          <td>
            <div class="student-cell-name">${escapeHtml(req.first_name)} ${escapeHtml(req.last_name)}</div>
            <div class="student-cell-email">${escapeHtml(req.email)}</div>
          </td>
          <td>
            <div style="font-weight: 800; font-family: monospace; font-size: 0.92rem; color: var(--navy-900);">
              ${escapeHtml(req.student_card_number)}
            </div>
            <div style="font-size: 0.78rem; color: var(--gray-500);">بكالوريا: ${escapeHtml(req.bac_year)}</div>
          </td>
          <td>
            <span class="doc-type-chip">${escapeHtml(req.document_type)}</span>
          </td>
          <td>
            <span class="doc-sub-details">${escapeHtml(conditionalText)}</span>
          </td>
          <td style="font-size: 0.82rem; color: var(--gray-600); white-space: nowrap;">
            ${formatArabicDate(req.created_at)}
          </td>
          <td>
            ${statusHtml}
          </td>
          <td>
            <div class="table-actions">
              <button
                type="button"
                class="btn btn-success btn-sm action-ready-btn"
                data-id="${escapeHtml(req.id)}"
                ${isReadyDisabled}
                title="تأكيد جاهزية الوثيقة وإرسال إشعار Gmail آلي من بريد القسم للطالب"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg>
                <span>تأكيد الجاهزية</span>
              </button>

              <button
                type="button"
                class="btn btn-danger btn-sm action-reject-btn"
                data-id="${escapeHtml(req.id)}"
                ${isRejectDisabled}
                title="رفض الطلب مع تحديد السبب وإرسال بريد إلكتروني للطالب"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                <span>رفض الطلب</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    })
    .join('');

  tbody.querySelectorAll('.action-ready-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const reqId = btn.getAttribute('data-id');
      handleMarkRequestReady(reqId);
    });
  });

  tbody.querySelectorAll('.action-reject-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const reqId = btn.getAttribute('data-id');
      openRejectRequestModal(reqId);
    });
  });
}

/**
 * التحقق من إعداد بريد القسم قبل إرسال أي إشعار للطالب
 */
function ensureCurrentDepartmentConfigured() {
  const setting = DeptState.deptSetting;
  if (
    !setting ||
    !setting.is_configured ||
    !setting.sender_gmail ||
    !setting.gmail_app_password
  ) {
    showToast({
      type: 'error',
      title: 'إعدادات بريد القسم مطلوبة أولاً',
      message:
        'يرجى إدخال البريد الإلكتروني للقسم ورمز التطبيق في خانة الإعدادات أولاً قبل إرسال الإشعارات'
    });
    openDepartmentSettingsModal(true);
    return false;
  }
  return true;
}

/**
 * معالجة الضغط على زر "تأكيد الجاهزية" وإرسال إشعار Gmail آلي من بريد القسم
 */
async function handleMarkRequestReady(requestId) {
  if (!ensureCurrentDepartmentConfigured()) return;

  try {
    const { request, notification } = await DataRepository.updateRequestStatus(requestId, 'ready');
    await refreshDepartmentData();

    showToast({
      type: 'success',
      title: 'تم تأكيد جاهزية الوثيقة للاستلام',
      message: `تم تحديث حالة الطلب (${request.tracking_code}) للطالب ${request.first_name} ${request.last_name}.`
    });

    if (notification) {
      setTimeout(() => {
        showToast({
          type: 'email',
          title: `إشعار Gmail أُرسل من (${notification.senderGmail || notification.sender_gmail || DeptState.deptSetting?.sender_gmail})`,
          message: `إلى: ${request.email} — "${notification.subject}"`
        });
      }, 350);
    }
  } catch (err) {
    if (err.isDeptEmailUnconfigured) {
      showToast({
        type: 'error',
        title: 'إعدادات بريد القسم غير مكتملة',
        message: err.message
      });
      openDepartmentSettingsModal(true);
      return;
    }
    showToast({
      type: 'error',
      title: 'تعذر تحديث الحالة أو إرسال البريد',
      message: err.message
    });
  }
}

/**
 * فتح نافذة رفض الطلب
 */
function openRejectRequestModal(requestId) {
  if (!ensureCurrentDepartmentConfigured()) return;

  const target = DeptState.requests.find(
    r => r.id === requestId || r.tracking_code === requestId
  );
  if (!target) return;

  DeptState.pendingRejectRequestId = target.id;
  document.getElementById('rejectModalRequestId').textContent = target.tracking_code;
  document.getElementById('rejectModalStudentName').textContent = `${target.first_name} ${target.last_name}`;
  document.getElementById('rejectModalDocType').textContent = target.document_type;

  const reasonInput = document.getElementById('rejectionReasonInput');
  if (reasonInput) {
    reasonInput.value = target.rejection_reason || '';
  }

  const modal = document.getElementById('rejectRequestModal');
  if (modal) modal.classList.add('open');
  if (reasonInput) setTimeout(() => reasonInput.focus(), 100);
}

/**
 * تأكيد رفض الطلب وإرسال بريد إلكتروني بسبب الرفض للطالب
 */
async function handleConfirmRejectSubmit(e) {
  e.preventDefault();
  const requestId = DeptState.pendingRejectRequestId;
  if (!requestId) return;

  const reasonInput = document.getElementById('rejectionReasonInput');
  const reason = reasonInput ? reasonInput.value.trim() : '';

  if (!reason) {
    showToast({
      type: 'error',
      title: 'سبب الرفض مطلوب',
      message: 'يرجى كتابة سبب رفض الطلب أو اختيار أحد الأسباب السريعة.'
    });
    return;
  }

  try {
    const { request, notification } = await DataRepository.updateRequestStatus(
      requestId,
      'rejected',
      reason
    );

    const modal = document.getElementById('rejectRequestModal');
    if (modal) modal.classList.remove('open');
    DeptState.pendingRejectRequestId = null;

    await refreshDepartmentData();

    showToast({
      type: 'error',
      title: 'تم رفض الطلب وإشعار الطالب',
      message: `تم تسجيل سبب الرفض للطلب (${request.tracking_code}).`
    });

    if (notification) {
      setTimeout(() => {
        showToast({
          type: 'email',
          title: `إشعار Gmail بالرفض من (${notification.senderGmail || notification.sender_gmail || DeptState.deptSetting?.sender_gmail})`,
          message: `إلى: ${request.email} — سبب الرفض: "${reason}"`
        });
      }, 350);
    }
  } catch (err) {
    if (err.isDeptEmailUnconfigured) {
      const modal = document.getElementById('rejectRequestModal');
      if (modal) modal.classList.remove('open');
      showToast({
        type: 'error',
        title: 'إعدادات بريد القسم مطلوبة',
        message: err.message
      });
      openDepartmentSettingsModal(true);
      return;
    }
    showToast({
      type: 'error',
      title: 'تعذر رفض الطلب',
      message: err.message
    });
  }
}

/**
 * تحديث شارة عدد إشعارات القسم
 */
function updateNotificationCountBadge() {
  const badge = document.getElementById('gmailNotifCountBadge');
  if (badge) badge.textContent = DeptState.notifications.length;
}

/**
 * عرض سجل الإشعارات المرسلة من هذا القسم
 */
function renderNotificationsLogModal() {
  const container = document.getElementById('notificationsLogContainer');
  if (!container) return;

  const notifications = DeptState.notifications;

  if (notifications.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding: 2rem 1rem;">
        <h4>لا توجد إشعارات مرسلة من ${escapeHtml(DeptState.departmentName)} بعد</h4>
        <p>عند الضغط على "تأكيد الجاهزية" أو "رفض الطلب"، سيتم إرسال بريد إلكتروني آلي للطالب وتوثيقه هنا.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = notifications
    .map(item => {
      const sender = item.senderGmail || item.sender_gmail || 'بريد القسم';
      const recipient = item.to || item.recipient_email || '';
      const trackingCode = item.trackingCode || item.tracking_code || item.requestId || '';

      return `
        <div class="notif-log-item">
          <div class="notif-log-header">
            <div>
              <strong style="color: var(--navy-900);">${escapeHtml(item.subject)}</strong>
              <div style="font-size: 0.78rem; color: var(--gray-500); margin-top: 0.15rem;">
                من حساب القسم: <span style="direction: ltr; display: inline-block; font-weight: 700; color: var(--navy-700);">${escapeHtml(sender)}</span>
                ← إلى الطالب: <span style="direction: ltr; display: inline-block; font-weight: 700; color: var(--emerald-700);">${escapeHtml(recipient)}</span>
                — رمز الطلب: <strong>${escapeHtml(trackingCode)}</strong>
              </div>
            </div>
            <span class="status-badge ready" style="font-size: 0.72rem;">تم الإرسال ✓</span>
          </div>
          <div class="notif-log-body">${item.htmlBody || item.html_body || escapeHtml(item.body || '')}</div>
          <div style="margin-top: 0.45rem; font-size: 0.75rem; color: var(--gray-500); text-align: left;">
            تاريخ الإرسال: ${formatArabicDate(item.sentAt || item.sent_at)}
          </div>
        </div>
      `;
    })
    .join('');
}

function formatArabicDate(isoString) {
  if (!isoString) return '—';
  try {
    const date = new Date(isoString);
    return new Intl.DateTimeFormat('ar-DZ', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  } catch {
    return isoString;
  }
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function showToast({ type = 'success', title = '', message = '' }) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  const typeClass =
    type === 'error' ? 'toast-error' : type === 'email' ? 'toast-email' : 'toast-success';
  toast.className = `toast-item ${typeClass}`;

  let iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#34d399" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  if (type === 'error') {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f87171" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>`;
  } else if (type === 'email') {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" stroke-width="2.3"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`;
  }

  toast.innerHTML = `
    <div style="flex-shrink: 0; margin-top: 2px;">${iconSvg}</div>
    <div class="toast-content">
      <div class="toast-title">${escapeHtml(title)}</div>
      <div class="toast-desc">${escapeHtml(message)}</div>
    </div>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, 5000);
}
