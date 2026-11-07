/**
 * المنطق التفاعلي المعزول لواجهة الطالب (/student route)
 * يحتوي حصراً على استمارة تقديم طلب الوثيقة ونافذة التأكيد
 */

document.addEventListener('DOMContentLoaded', () => {
  initStudentDropdownOptions();
  bindStudentEvents();
});

function initStudentDropdownOptions() {
  // 5. القسم (قائمة منسدلة تحتوي حصراً على الخيارات الـ 5)
  const deptSelect = document.getElementById('department');
  if (deptSelect) {
    deptSelect.innerHTML = `<option value="">-- اختر القسم التابع له --</option>`;
    PORTAL_CONSTANTS.DEPARTMENTS.forEach(dept => {
      const opt = document.createElement('option');
      opt.value = dept;
      opt.textContent = dept;
      deptSelect.appendChild(opt);
    });
  }

  // 6. عام البكالوريا (من 2014 إلى 2026)
  const bacSelect = document.getElementById('bacYear');
  if (bacSelect) {
    bacSelect.innerHTML = `<option value="">-- اختر عام الحصول على البكالوريا --</option>`;
    PORTAL_CONSTANTS.BAC_YEARS.forEach(year => {
      const opt = document.createElement('option');
      opt.value = year;
      opt.textContent = `بكالوريا دورة ${year}`;
      bacSelect.appendChild(opt);
    });
  }

  // 7. نوع الوثيقة المطلوبة
  const docTypeSelect = document.getElementById('documentType');
  if (docTypeSelect) {
    docTypeSelect.innerHTML = `<option value="">-- اختر نوع الوثيقة البيداغوجية المطلوبة --</option>`;
    PORTAL_CONSTANTS.DOCUMENT_TYPES.forEach(doc => {
      const opt = document.createElement('option');
      opt.value = doc;
      opt.textContent = doc;
      docTypeSelect.appendChild(opt);
    });
  }

  // الحقول الشرطية: السنة المطلوبة لكشف النقاط
  const targetYearSelect = document.getElementById('targetYear');
  if (targetYearSelect) {
    targetYearSelect.innerHTML = `<option value="">-- اختر السنة الجامعية المطلوبة --</option>`;
    PORTAL_CONSTANTS.TARGET_YEARS.forEach(yr => {
      const opt = document.createElement('option');
      opt.value = yr;
      opt.textContent = yr;
      targetYearSelect.appendChild(opt);
    });
  }

  // قائمة المواسم الجامعية المساعدة
  const academicYearDatalist = document.getElementById('academicYearsList');
  if (academicYearDatalist) {
    academicYearDatalist.innerHTML = '';
    PORTAL_CONSTANTS.ACADEMIC_YEARS.forEach(ay => {
      const opt = document.createElement('option');
      opt.value = ay;
      academicYearDatalist.appendChild(opt);
    });
  }
}

function bindStudentEvents() {
  const docTypeSelect = document.getElementById('documentType');
  docTypeSelect?.addEventListener('change', e => {
    handleDocumentTypeConditionalLogic(e.target.value);
    clearFieldError('documentType');
    hideDuplicateWarningBanner();
  });

  const watchedFields = [
    'firstName',
    'lastName',
    'studentCardNumber',
    'email',
    'department',
    'bacYear',
    'targetYear',
    'academicYear'
  ];
  watchedFields.forEach(fieldId => {
    const el = document.getElementById(fieldId);
    if (el) {
      el.addEventListener('input', () => {
        clearFieldError(fieldId);
        if (fieldId === 'studentCardNumber') hideDuplicateWarningBanner();
      });
      el.addEventListener('change', () => clearFieldError(fieldId));
    }
  });

  document.querySelectorAll('input[name="cycle"]').forEach(radio => {
    radio.addEventListener('change', () => clearFieldError('cycle'));
  });

  document.getElementById('documentRequestForm')?.addEventListener('submit', handleStudentFormSubmit);

  document.getElementById('resetFormBtn')?.addEventListener('click', () => {
    resetStudentForm();
  });

  document.getElementById('closeConfirmModalBtn')?.addEventListener('click', closeConfirmationModal);
  document.getElementById('confirmDoneBtn')?.addEventListener('click', closeConfirmationModal);
  document.getElementById('printReceiptBtn')?.addEventListener('click', () => window.print());
}

function handleDocumentTypeConditionalLogic(selectedDocType) {
  const rankBox = document.getElementById('conditionalRankSection');
  const transcriptBox = document.getElementById('conditionalTranscriptSection');
  const targetYearSelect = document.getElementById('targetYear');
  const academicYearInput = document.getElementById('academicYear');
  const cycleRadios = document.querySelectorAll('input[name="cycle"]');

  if (rankBox) rankBox.style.display = 'none';
  if (transcriptBox) transcriptBox.style.display = 'none';

  if (selectedDocType === 'شهادة الترتيب') {
    if (rankBox) rankBox.style.display = 'block';
    if (targetYearSelect) targetYearSelect.value = '';
    if (academicYearInput) academicYearInput.value = '';
    clearFieldError('targetYear');
    clearFieldError('academicYear');
  } else if (selectedDocType === 'كشف النقاط') {
    if (transcriptBox) transcriptBox.style.display = 'block';
    cycleRadios.forEach(r => {
      r.checked = false;
    });
    clearFieldError('cycle');
  } else {
    cycleRadios.forEach(r => {
      r.checked = false;
    });
    if (targetYearSelect) targetYearSelect.value = '';
    if (academicYearInput) academicYearInput.value = '';
    clearFieldError('cycle');
    clearFieldError('targetYear');
    clearFieldError('academicYear');
  }
}

function showFieldError(fieldId, message) {
  const input = document.getElementById(fieldId);
  const errorEl = document.getElementById(`${fieldId}Error`);
  if (input) input.classList.add('input-error');
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.classList.add('visible');
  }
}

function clearFieldError(fieldId) {
  const input = document.getElementById(fieldId);
  const errorEl = document.getElementById(`${fieldId}Error`);
  if (input) input.classList.remove('input-error');
  if (errorEl) {
    errorEl.classList.remove('visible');
  }
}

function clearAllFormErrors() {
  [
    'firstName',
    'lastName',
    'studentCardNumber',
    'email',
    'department',
    'bacYear',
    'documentType',
    'cycle',
    'targetYear',
    'academicYear'
  ].forEach(clearFieldError);
}

function showDuplicateWarningBanner(message) {
  const banner = document.getElementById('duplicateWarningBanner');
  const msgEl = document.getElementById('duplicateWarningMessage');
  if (msgEl) msgEl.textContent = message;
  if (banner) {
    banner.style.display = 'flex';
    banner.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function hideDuplicateWarningBanner() {
  const banner = document.getElementById('duplicateWarningBanner');
  if (banner) banner.style.display = 'none';
}

async function handleStudentFormSubmit(e) {
  e.preventDefault();
  clearAllFormErrors();
  hideDuplicateWarningBanner();

  const first_name = document.getElementById('firstName')?.value.trim() || '';
  const last_name = document.getElementById('lastName')?.value.trim() || '';
  const student_card_number = document.getElementById('studentCardNumber')?.value.trim() || '';
  const email = document.getElementById('email')?.value.trim().toLowerCase() || '';
  const department = document.getElementById('department')?.value.trim() || '';
  const bac_year = document.getElementById('bacYear')?.value.trim() || '';
  const document_type = document.getElementById('documentType')?.value.trim() || '';

  const selectedCycleRadio = document.querySelector('input[name="cycle"]:checked');
  const degree_level = selectedCycleRadio ? selectedCycleRadio.value : '';
  const requested_year = document.getElementById('targetYear')?.value.trim() || '';
  const academic_year = document.getElementById('academicYear')?.value.trim() || '';

  let isValid = true;

  // 1. الاسم
  if (!first_name || first_name.length < 2) {
    showFieldError('firstName', 'يرجى إدخال الاسم الشخصي للطالب بشكل صحيح.');
    isValid = false;
  }

  // 2. اللقب
  if (!last_name || last_name.length < 2) {
    showFieldError('lastName', 'يرجى إدخال اللقب العائلي للطالب بشكل صحيح.');
    isValid = false;
  }

  // 3. الرقم التسلسلي لبطاقة الطالب
  if (!student_card_number || student_card_number.length < 4) {
    showFieldError('studentCardNumber', 'يرجى إدخال الرقم التسلسلي لبطاقة الطالب (4 أحرف/أرقام على الأقل).');
    isValid = false;
  }

  // 4. البريد الإلكتروني
  const gmailPattern = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
  if (!email) {
    showFieldError('email', 'حقل البريد الإلكتروني إجباري لاستلام إشعار الجاهزية.');
    isValid = false;
  } else if (!gmailPattern.test(email)) {
    showFieldError('email', 'يرجى إدخال بريد إلكتروني صالح (مثال: student@gmail.com).');
    isValid = false;
  }

  // 5. القسم
  if (!department || !PORTAL_CONSTANTS.DEPARTMENTS.includes(department)) {
    showFieldError('department', 'يرجى اختيار القسم من القائمة المنسدلة.');
    isValid = false;
  }

  // 6. عام البكالوريا
  if (!bac_year || !PORTAL_CONSTANTS.BAC_YEARS.includes(bac_year)) {
    showFieldError('bacYear', 'يرجى اختيار عام البكالوريا (من 2014 إلى 2026).');
    isValid = false;
  }

  // 7. نوع الوثيقة المطلوبة
  if (!document_type || !PORTAL_CONSTANTS.DOCUMENT_TYPES.includes(document_type)) {
    showFieldError('documentType', 'يرجى تحديد نوع الوثيقة المطلوبة.');
    isValid = false;
  }

  // التحقق من الحقول الشرطية
  if (document_type === 'شهادة الترتيب') {
    if (!degree_level || !PORTAL_CONSTANTS.CYCLES.includes(degree_level)) {
      showFieldError('cycle', 'يرجى اختيار الطور (ليسانس أو ماستر) لاستخراج شهادة الترتيب.');
      isValid = false;
    }
  } else if (document_type === 'كشف النقاط') {
    if (!requested_year || !PORTAL_CONSTANTS.TARGET_YEARS.includes(requested_year)) {
      showFieldError('targetYear', 'يرجى اختيار السنة المطلوبة لكشف النقاط.');
      isValid = false;
    }
    const academicYearRegex = /^\d{4}\/\d{4}$/;
    if (!academic_year) {
      showFieldError('academicYear', 'يرجى تحديد العام الدراسي لتلك السنة (مثال: 2024/2025).');
      isValid = false;
    } else if (!academicYearRegex.test(academic_year)) {
      showFieldError('academicYear', 'يرجى كتابة العام الدراسي بالصيغة الصحيحة مثل: 2024/2025');
      isValid = false;
    }
  }

  if (!isValid) {
    showToast('يرجى مراجعة الحقول المطلوبة باللون الأحمر قبل إرسال الطلب.', 'error');
    return;
  }

  const submitBtn = document.getElementById('submitRequestBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = `<span>جاري تسجيل الطلب...</span>`;
  }

  try {
    const payload = {
      first_name,
      last_name,
      student_card_number,
      email,
      department,
      bac_year,
      document_type,
      degree_level: document_type === 'شهادة الترتيب' ? degree_level : null,
      requested_year: document_type === 'كشف النقاط' ? requested_year : null,
      academic_year: document_type === 'كشف النقاط' ? academic_year : null
    };

    const createdRequest = await DataRepository.createRequest(payload);
    openConfirmationModal(createdRequest);
    resetStudentForm();
    showToast(
      `تم تسجيل طلبكم بنجاح، وستصلكم رسالة على بريدكم (${createdRequest.email}) فور جاهزية الوثيقة.`,
      'success'
    );
  } catch (err) {
    if (err.isDuplicatePending) {
      showDuplicateWarningBanner(err.message);
      showToast(err.message, 'info');
    } else {
      showToast(err.message || 'حدث خطأ أثناء حفظ الطلب.', 'error');
    }
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
        <span>إرسال الطلب</span>
      `;
    }
  }
}

function resetStudentForm() {
  const form = document.getElementById('documentRequestForm');
  if (form) form.reset();
  handleDocumentTypeConditionalLogic('');
  clearAllFormErrors();
  hideDuplicateWarningBanner();
}

function openConfirmationModal(request) {
  const modal = document.getElementById('confirmationModal');
  if (!modal) return;

  const displayCode = request.tracking_code || request.id;
  document.getElementById('confirmTrackingId').textContent = displayCode;

  const summaryBody = document.getElementById('confirmSummaryTableBody');
  if (summaryBody) {
    const degreeLevel = request.degree_level ?? request.conditionalDetails?.cycle;
    const requestedYear = request.requested_year ?? request.conditionalDetails?.targetYear;
    const academicYear = request.academic_year ?? request.conditionalDetails?.academicYear;

    let conditionalRowHtml = '';
    if (request.document_type === 'شهادة الترتيب' && degreeLevel) {
      conditionalRowHtml = `
        <tr>
          <th>الطور الجامعي:</th>
          <td><span class="conditional-tag">${escapeHtml(degreeLevel)}</span></td>
        </tr>
      `;
    } else if (request.document_type === 'كشف النقاط' && requestedYear) {
      conditionalRowHtml = `
        <tr>
          <th>السنة المطلوبة:</th>
          <td><span class="conditional-tag">${escapeHtml(requestedYear)}</span></td>
        </tr>
        <tr>
          <th>العام الدراسي:</th>
          <td><span class="conditional-tag">${escapeHtml(academicYear || '')}</span></td>
        </tr>
      `;
    }

    summaryBody.innerHTML = `
      <tr>
        <th>الاسم واللقب:</th>
        <td>${escapeHtml(request.first_name)} ${escapeHtml(request.last_name)}</td>
      </tr>
      <tr>
        <th>الرقم التسلسلي لبطاقة الطالب:</th>
        <td style="font-family: monospace; font-size: 1rem;">${escapeHtml(request.student_card_number)}</td>
      </tr>
      <tr>
        <th>البريد الإلكتروني:</th>
        <td style="direction: ltr; text-align: right;">${escapeHtml(request.email)}</td>
      </tr>
      <tr>
        <th>القسم:</th>
        <td>${escapeHtml(request.department)}</td>
      </tr>
      <tr>
        <th>عام البكالوريا:</th>
        <td>بكالوريا ${escapeHtml(request.bac_year)}</td>
      </tr>
      <tr>
        <th>نوع الوثيقة المطلوبة:</th>
        <td style="color: var(--navy-700);">${escapeHtml(request.document_type)}</td>
      </tr>
      ${conditionalRowHtml}
      <tr>
        <th>تاريخ الإيداع:</th>
        <td>${formatArabicDateTime(request.created_at)}</td>
      </tr>
    `;
  }

  modal.classList.add('open');
}

function closeConfirmationModal() {
  document.getElementById('confirmationModal')?.classList.remove('open');
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatArabicDateTime(isoString) {
  if (!isoString) return '—';
  try {
    const dt = new Date(isoString);
    return new Intl.DateTimeFormat('ar-DZ', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    }).format(dt);
  } catch {
    return isoString;
  }
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast-item ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;

  let iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2.2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
  if (type === 'success') {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" stroke-width="2.5"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
  } else if (type === 'error') {
    iconSvg = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>`;
  }

  toast.innerHTML = `
    <div style="flex-shrink: 0; margin-top: 2px;">${iconSvg}</div>
    <div style="font-size: 0.9rem; font-weight: 600; line-height: 1.45;">${escapeHtml(message)}</div>
  `;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.25s ease';
    setTimeout(() => toast.remove(), 260);
  }, 4500);
}
