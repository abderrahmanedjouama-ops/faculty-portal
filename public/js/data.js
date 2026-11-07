/**
 * هيكلة البيانات المشتركة والثوابت الأكاديمية وطبقة الاتصال المباشر بـ Firebase Realtime Database + API
 * البوابة الرقمية لطلب الوثائق البيداغوجية والإدارية — كلية العلوم والتكنولوجيا
 */

const FIREBASE_DB_URL =
  'https://faculty-portal-6148c-default-rtdb.europe-west1.firebasedatabase.app';

const PORTAL_CONSTANTS = {
  // خريطة المسارات المستقلة للأقسام الخمسة (Standalone Department Routes)
  DEPARTMENT_ROUTES: {
    automatique: {
      slug: 'automatique',
      username: 'automatique',
      defaultPassword: 'auto2026',
      path: '/admin/automatique',
      name: 'قسم الآلية والإلكترونيك',
      subtitle: 'إدارة طلبات الوثائق البيداغوجية لطلبة الآلية والإلكترونيك',
      code: 'AUTO'
    },
    electrique: {
      slug: 'electrique',
      username: 'electrique',
      defaultPassword: 'elec2026',
      path: '/admin/electrique',
      name: 'قسم الهندسة الكهربائية',
      subtitle: 'إدارة طلبات الوثائق البيداغوجية لطلبة الهندسة الكهربائية',
      code: 'ELEC'
    },
    'tronc-commun': {
      slug: 'tronc-commun',
      username: 'tronc-commun',
      defaultPassword: 'tronc2026',
      path: '/admin/tronc-commun',
      name: 'قسم جذع مشترك (خاص بالسنة الأولى)',
      subtitle: 'إدارة طلبات الوثائق البيداغوجية لطلبة السنة الأولى جذع مشترك',
      code: 'TC-L1'
    },
    procedes: {
      slug: 'procedes',
      username: 'procedes',
      defaultPassword: 'proc2026',
      path: '/admin/procedes',
      name: 'قسم هندسة الطرائق',
      subtitle: 'إدارة طلبات الوثائق البيداغوجية لطلبة هندسة الطرائق',
      code: 'PROC'
    },
    mecanique: {
      slug: 'mecanique',
      username: 'mecanique',
      defaultPassword: 'meca2026',
      path: '/admin/mecanique',
      name: 'قسم الميكانيك',
      subtitle: 'إدارة طلبات الوثائق البيداغوجية لطلبة هندسة الميكانيك',
      code: 'MECA'
    }
  },

  // 5. القسم (قائمة منسدلة تحتوي حصراً على الخيارات التالية)
  DEPARTMENTS: [
    'قسم الآلية والإلكترونيك',
    'قسم الهندسة الكهربائية',
    'قسم جذع مشترك (خاص بالسنة الأولى)',
    'قسم هندسة الطرائق',
    'قسم الميكانيك'
  ],

  // 6. عام البكالوريا (من 2014 إلى 2026)
  BAC_YEARS: Array.from({ length: 2026 - 2014 + 1 }, (_, i) => String(2026 - i)),

  // 7. نوع الوثيقة المطلوبة
  DOCUMENT_TYPES: [
    'شهادة مدرسية',
    'كشف النقاط',
    'شهادة الترتيب',
    'شهادة حسن سيرة وسلوك'
  ],

  // الحقول الشرطية لشهادة الترتيب (degree_level)
  CYCLES: ['ليسانس', 'ماستر'],

  // الحقول الشرطية لكشف النقاط (requested_year)
  TARGET_YEARS: [
    'سنة أولى ليسانس',
    'سنة ثانية ليسانس',
    'سنة ثالثة ليسانس',
    'سنة أولى ماستر',
    'سنة ثانية ماستر'
  ],

  // اقتراحات المواسم الجامعية (academic_year)
  ACADEMIC_YEARS: [
    '2025/2026',
    '2024/2025',
    '2023/2024',
    '2022/2023',
    '2021/2022',
    '2020/2021',
    '2019/2020',
    '2018/2019',
    '2017/2018',
    '2016/2017',
    '2015/2016',
    '2014/2015'
  ],

  STATUS_META: {
    pending: {
      key: 'pending',
      label: 'قيد المعالجة',
      adminLabel: 'قيد الانتظار',
      badgeClass: 'pending'
    },
    ready: {
      key: 'ready',
      label: 'جاهزة للاستلام',
      adminLabel: 'جاهزة للاستلام',
      badgeClass: 'ready'
    },
    rejected: {
      key: 'rejected',
      label: 'مرفوضة',
      adminLabel: 'مرفوض',
      badgeClass: 'rejected'
    }
  }
};

/**
 * إزالة أية مسافات من رمز تطبيق جوجل المكون من 16 حرفاً
 */
function stripAppPasswordSpaces(rawPassword) {
  return String(rawPassword || '').replace(/\s+/g, '');
}

/**
 * دالة اتصال مباشر بقاعدة بيانات Firebase Realtime Database عبر واجهة REST القياسية
 */
async function firebaseFetch(subPath, method = 'GET', bodyObj = null, timeoutMs = 4500) {
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;

  try {
    const response = await fetch(`${FIREBASE_DB_URL}${subPath}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(bodyObj !== null ? { 'Content-Type': 'application/json' } : {})
      },
      body: bodyObj !== null ? JSON.stringify(bodyObj) : undefined,
      signal: controller ? controller.signal : undefined
    });

    if (timer) clearTimeout(timer);
    if (!response.ok) {
      return { ok: false, status: response.status, data: null };
    }
    const data = await response.json();
    return { ok: true, status: response.status, data };
  } catch {
    if (timer) clearTimeout(timer);
    return { ok: false, status: 0, data: null };
  }
}

function firebaseNodeToArray(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node.filter(Boolean);
  if (typeof node === 'object') return Object.values(node).filter(Boolean);
  return [];
}

/**
 * دالة اتصال آمنة بالخادم (Safe JSON Fetch) مع مهلة زمنية سريعة
 */
async function safeApiFetch(apiPath, options = {}) {
  const candidateOrigins = [''];
  if (typeof window !== 'undefined' && window.location) {
    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    if (isLocal) {
      const currentPort = window.location.port;
      if (currentPort !== '3001') candidateOrigins.push('http://localhost:3001');
      if (currentPort !== '3000') candidateOrigins.push('http://localhost:3000');
    }
  }

  const mergedHeaders = {
    Accept: 'application/json',
    ...(options.headers || {})
  };

  const timeoutMs = options.timeoutMs || 8000;

  for (const origin of candidateOrigins) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
      const response = await fetch(`${origin}${apiPath}`, {
        credentials: 'same-origin',
        ...options,
        headers: mergedHeaders,
        signal: controller ? controller.signal : undefined
      });
      if (timer) clearTimeout(timer);

      const contentType = (response.headers.get('content-type') || '').toLowerCase();
      if (contentType.includes('application/json')) {
        const data = await response.json();
        return {
          reachable: true,
          isJson: true,
          ok: response.ok,
          status: response.status,
          data
        };
      }
    } catch {
      if (timer) clearTimeout(timer);
    }
  }

  return {
    reachable: false,
    isJson: false,
    ok: false,
    status: 0,
    data: null
  };
}

/**
 * توحيد سجل الطلب ليشمل كافة أعمدة جدول document_requests القياسية
 */
function normalizeRecord(raw) {
  if (!raw) return null;
  const degree_level =
    raw.degree_level ?? raw.degreeLevel ?? raw.conditionalDetails?.cycle ?? null;
  const requested_year =
    raw.requested_year ?? raw.requestedYear ?? raw.conditionalDetails?.targetYear ?? null;
  const academic_year =
    raw.academic_year ?? raw.academicYear ?? raw.conditionalDetails?.academicYear ?? null;
  const tracking_code = raw.tracking_code || raw.trackingCode || raw.id;
  const first_name = raw.first_name ?? raw.firstName ?? '';
  const last_name = raw.last_name ?? raw.lastName ?? '';
  const student_card_number = raw.student_card_number ?? raw.studentCardNumber ?? '';
  const bac_year = raw.bac_year ?? raw.bacYear ?? '';
  const document_type = raw.document_type ?? raw.documentType ?? '';
  const rejection_reason = raw.rejection_reason ?? raw.rejectionReason ?? null;
  const created_at = raw.created_at ?? raw.createdAt ?? new Date().toISOString();

  return {
    id: raw.id,
    tracking_code,
    first_name,
    last_name,
    student_card_number,
    email: raw.email,
    department: raw.department,
    bac_year,
    document_type,
    degree_level,
    requested_year,
    academic_year,
    status: raw.status || 'pending',
    rejection_reason,
    created_at,

    trackingCode: tracking_code,
    firstName: first_name,
    lastName: last_name,
    studentCardNumber: student_card_number,
    bacYear: bac_year,
    documentType: document_type,
    degreeLevel: degree_level,
    requestedYear: requested_year,
    academicYear: academic_year,
    rejectionReason: rejection_reason || '',
    createdAt: created_at,
    conditionalDetails: {
      cycle: degree_level,
      targetYear: requested_year,
      academicYear: academic_year
    }
  };
}

const INITIAL_DEPARTMENT_SETTINGS = Object.values(PORTAL_CONSTANTS.DEPARTMENT_ROUTES).map(
  (route, idx) => ({
    id: `d502290f-8b2d-4d62-9f73-22000000000${idx + 1}`,
    department_name: route.name,
    slug: route.slug,
    username: route.username,
    route: route.path,
    login_password: route.defaultPassword,
    default_password: route.defaultPassword,
    sender_gmail: null,
    gmail_app_password: null,
    is_configured: false,
    updated_at: '2026-11-06T08:00:00.000Z'
  })
);

const INITIAL_SEED_REQUESTS = [
  normalizeRecord({
    id: 'b401189e-7a1c-4c51-8e62-110000000001',
    tracking_code: 'REQ-4821',
    first_name: 'محمد أمين',
    last_name: 'بن علي',
    student_card_number: '202134015',
    email: 'amine.benali2021@gmail.com',
    department: 'قسم الآلية والإلكترونيك',
    bac_year: '2021',
    document_type: 'كشف النقاط',
    degree_level: null,
    requested_year: 'سنة ثالثة ليسانس',
    academic_year: '2023/2024',
    status: 'pending',
    rejection_reason: null,
    created_at: '2026-11-05T09:30:00.000Z'
  }),
  normalizeRecord({
    id: 'b401189e-7a1c-4c51-8e62-110000000002',
    tracking_code: 'REQ-5104',
    first_name: 'سارة',
    last_name: 'بوجمعة',
    student_card_number: '202031042',
    email: 'sara.boudjemaa@gmail.com',
    department: 'قسم الهندسة الكهربائية',
    bac_year: '2020',
    document_type: 'شهادة الترتيب',
    degree_level: 'ماستر',
    requested_year: null,
    academic_year: null,
    status: 'ready',
    rejection_reason: null,
    created_at: '2026-11-04T11:15:00.000Z'
  }),
  normalizeRecord({
    id: 'b401189e-7a1c-4c51-8e62-110000000003',
    tracking_code: 'REQ-3912',
    first_name: 'ياسين',
    last_name: 'مرابط',
    student_card_number: '202439205',
    email: 'yacine.merabet24@gmail.com',
    department: 'قسم جذع مشترك (خاص بالسنة الأولى)',
    bac_year: '2024',
    document_type: 'شهادة مدرسية',
    degree_level: null,
    requested_year: null,
    academic_year: null,
    status: 'pending',
    rejection_reason: null,
    created_at: '2026-11-06T08:45:00.000Z'
  }),
  normalizeRecord({
    id: 'b401189e-7a1c-4c51-8e62-110000000004',
    tracking_code: 'REQ-2789',
    first_name: 'إيمان',
    last_name: 'قاسمي',
    student_card_number: '202235089',
    email: 'imane.kasmi22@gmail.com',
    department: 'قسم هندسة الطرائق',
    bac_year: '2022',
    document_type: 'كشف النقاط',
    degree_level: null,
    requested_year: 'سنة ثانية ليسانس',
    academic_year: '2023/2024',
    status: 'rejected',
    rejection_reason: 'خطأ في الرقم التسلسلي لبطاقة الطالب غير مطابق لسجلات الدفعة 2022',
    created_at: '2026-11-03T10:00:00.000Z'
  }),
  normalizeRecord({
    id: 'b401189e-7a1c-4c51-8e62-110000000005',
    tracking_code: 'REQ-6390',
    first_name: 'عبد الرحمن',
    last_name: 'زروقي',
    student_card_number: '201932077',
    email: 'abderrahmane.zerrouki@gmail.com',
    department: 'قسم الميكانيك',
    bac_year: '2019',
    document_type: 'شهادة حسن سيرة وسلوك',
    degree_level: null,
    requested_year: null,
    academic_year: null,
    status: 'ready',
    rejection_reason: null,
    created_at: '2026-11-02T13:25:00.000Z'
  }),
  normalizeRecord({
    id: 'b401189e-7a1c-4c51-8e62-110000000006',
    tracking_code: 'REQ-7415',
    first_name: 'شيماء',
    last_name: 'بلقاسم',
    student_card_number: '202338110',
    email: 'chaima.belkacem23@gmail.com',
    department: 'قسم الهندسة الكهربائية',
    bac_year: '2023',
    document_type: 'شهادة الترتيب',
    degree_level: 'ليسانس',
    requested_year: null,
    academic_year: null,
    status: 'pending',
    rejection_reason: null,
    created_at: '2026-11-06T10:12:00.000Z'
  }),
  normalizeRecord({
    id: 'b401189e-7a1c-4c51-8e62-110000000007',
    tracking_code: 'REQ-8520',
    first_name: 'محمد أمين',
    last_name: 'بن علي',
    student_card_number: '202134015',
    email: 'amine.benali2021@gmail.com',
    department: 'قسم الآلية والإلكترونيك',
    bac_year: '2021',
    document_type: 'شهادة مدرسية',
    degree_level: null,
    requested_year: null,
    academic_year: null,
    status: 'ready',
    rejection_reason: null,
    created_at: '2026-11-01T09:00:00.000Z'
  })
];

function formatConditionalDetails(request) {
  if (!request) return '—';
  const degreeLevel = request.degree_level ?? request.conditionalDetails?.cycle;
  const requestedYear = request.requested_year ?? request.conditionalDetails?.targetYear;
  const academicYear = request.academic_year ?? request.conditionalDetails?.academicYear;
  const docType = request.document_type ?? request.documentType;

  if (docType === 'شهادة الترتيب' && degreeLevel) {
    return `الطور: ${degreeLevel}`;
  }
  if (docType === 'كشف النقاط' && requestedYear) {
    return `${requestedYear} (${academicYear || '—'})`;
  }
  return 'وثيقة عامة (بدون شروط إضافية)';
}

function buildGmailNotificationPayload(
  rawRequest,
  statusType = 'ready',
  senderGmail = 'pedagogy.dept@gmail.com'
) {
  const req = normalizeRecord(rawRequest);

  if (statusType === 'rejected') {
    const subject = `إشعار بخصوص طلب وثيقتك البيداغوجية - ${req.document_type}`;
    const htmlBody = `
      <div dir="rtl" style="font-family: 'Cairo', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; color: #1e293b; line-height: 1.85; padding: 18px; background: #ffffff; border: 1px solid #fecaca; border-radius: 10px;">
        <p style="margin: 0 0 12px;">مرحباً <strong>${req.first_name} ${req.last_name}</strong>،</p>
        <p style="margin: 0 0 12px;">نود إعلامك بأنه تعذر استخراج وثيقة <strong>( ${req.document_type} )</strong> المسجلة برقم البطاقة <strong>( ${req.student_card_number} )</strong> لدى <strong>${req.department}</strong>.</p>
        <div style="background: #fff1f2; border-right: 4px solid #dc2626; padding: 10px 14px; border-radius: 6px; margin: 12px 0; color: #7f1d1d;">
          <strong>سبب الرفض:</strong> "${req.rejection_reason || 'يرجى التحقق من صحة البيانات المدخلة'}"
        </div>
        <p style="margin: 0;">يرجى تصحيح البيانات وإعادة تقديم طلب جديد عبر البوابة الرقمية للكلية.</p>
      </div>
    `;
    const textBody = `مرحباً ${req.first_name} ${req.last_name}،\nنود إعلامك بأنه تعذر استخراج وثيقة ( ${req.document_type} ) المسجلة برقم البطاقة ( ${req.student_card_number} ).\nسبب الرفض: ${req.rejection_reason}\nيرجى تصحيح البيانات وإعادة تقديم طلب جديد عبر البوابة الرقمية للكلية.`;

    return {
      id: `NOTIF-${Math.floor(1000 + Math.random() * 9000)}`,
      requestId: req.id,
      trackingCode: req.tracking_code,
      senderGmail,
      to: req.email,
      studentName: `${req.first_name} ${req.last_name}`,
      documentType: req.document_type,
      department: req.department,
      notificationType: 'rejected',
      subject,
      htmlBody,
      textBody,
      body: textBody,
      sentAt: new Date().toISOString()
    };
  }

  const subject = `إشعار بجاهزية وثيقتك البيداغوجية - ${req.document_type}`;
  const htmlBody = `
    <div dir="rtl" style="font-family: 'Cairo', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; color: #1e293b; line-height: 1.85; padding: 18px; background: #ffffff; border: 1px solid #bbf7d0; border-radius: 10px;">
      <p style="margin: 0 0 12px;">مرحباً <strong>${req.first_name} ${req.last_name}</strong>،</p>
      <p style="margin: 0 0 12px;">نعلمك بأن وثيقتك <strong>( ${req.document_type} )</strong> المسجلة برقم البطاقة <strong>( ${req.student_card_number} )</strong> جاهزة للاستلام.</p>
      <p style="margin: 0;">يرجى التقدم إلى مصلحة التدريس بـ <strong>${req.department}</strong> لاستلامها مصحوباً ببطاقة الطالب.</p>
    </div>
  `;
  const textBody = [
    `مرحباً ${req.first_name} ${req.last_name}،`,
    `نعلمك بأن وثيقتك ( ${req.document_type} ) المسجلة برقم البطاقة ( ${req.student_card_number} ) جاهزة للاستلام.`,
    `يرجى التقدم إلى مصلحة التدريس بـ ${req.department} لاستلامها مصحوباً ببطاقة الطالب.`
  ].join('\n');

  return {
    id: `NOTIF-${Math.floor(1000 + Math.random() * 9000)}`,
    requestId: req.id,
    trackingCode: req.tracking_code,
    senderGmail,
    to: req.email,
    studentName: `${req.first_name} ${req.last_name}`,
    documentType: req.document_type,
    department: req.department,
    notificationType: 'ready',
    subject,
    htmlBody,
    textBody,
    body: textBody,
    sentAt: new Date().toISOString()
  };
}

const INITIAL_SEED_NOTIFICATIONS = [
  buildGmailNotificationPayload(INITIAL_SEED_REQUESTS[1], 'ready'),
  buildGmailNotificationPayload(INITIAL_SEED_REQUESTS[3], 'rejected'),
  buildGmailNotificationPayload(INITIAL_SEED_REQUESTS[4], 'ready')
];

const STORAGE_KEYS = {
  REQUESTS: 'uni_portal_requests_v3',
  NOTIFICATIONS: 'uni_portal_notifications_v3',
  DEPT_SETTINGS: 'uni_portal_dept_settings_v3',
  AUTH_SESSION: 'uni_portal_dept_auth_session_v1'
};

function generateClientUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function normalizeDeptSettingObject(raw) {
  if (!raw) return null;
  const routes = Object.values(PORTAL_CONSTANTS.DEPARTMENT_ROUTES);
  const matchedRoute =
    routes.find(
      r =>
        r.slug === raw.slug ||
        r.name === raw.department_name ||
        r.username === raw.username
    ) || {};

  const slug = raw.slug || matchedRoute.slug || '';
  const cleanPass = stripAppPasswordSpaces(raw.gmail_app_password || '');
  const cleanEmail = String(raw.sender_gmail || '').trim().toLowerCase() || null;
  const isConfigured = Boolean(cleanEmail && cleanPass && cleanPass.length === 16);

  return {
    id: raw.id || `dept-${slug}`,
    department_name: raw.department_name || matchedRoute.name || '',
    slug,
    username: raw.username || matchedRoute.username || slug,
    route: `/admin/${slug}`,
    login_password: raw.login_password || matchedRoute.defaultPassword || '',
    default_password: matchedRoute.defaultPassword || raw.default_password || '',
    sender_gmail: cleanEmail,
    gmail_app_password: cleanPass || null,
    is_configured: isConfigured,
    updated_at: raw.updated_at || new Date().toISOString()
  };
}

const DataRepository = {
  initLocalStore() {
    if (!localStorage.getItem(STORAGE_KEYS.REQUESTS)) {
      localStorage.setItem(STORAGE_KEYS.REQUESTS, JSON.stringify(INITIAL_SEED_REQUESTS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) {
      localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(INITIAL_SEED_NOTIFICATIONS));
    }
    if (!localStorage.getItem(STORAGE_KEYS.DEPT_SETTINGS)) {
      localStorage.setItem(STORAGE_KEYS.DEPT_SETTINGS, JSON.stringify(INITIAL_DEPARTMENT_SETTINGS));
    }
  },

  getLocalAuthSession() {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.AUTH_SESSION);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  saveLocalAuthSession(session) {
    if (!session) {
      localStorage.removeItem(STORAGE_KEYS.AUTH_SESSION);
    } else {
      localStorage.setItem(STORAGE_KEYS.AUTH_SESSION, JSON.stringify(session));
    }
  },

  /**
   * تسجيل دخول القسم مع دعم فوري لـ Firebase Realtime Database والخادم والنسخة الاحتياطية للأقسام الخمسة
   */
  async loginDepartment({ identifier, password }) {
    const cleanId = String(identifier || '').trim();
    const cleanPass = String(password || '').trim();

    if (!cleanId || !cleanPass) {
      throw new Error('يرجى إدخال اسم المستخدم للقسم وكلمة المرور.');
    }

    // 1. جلب أحدث إعدادات الأقسام من Firebase Realtime Database (أو زرعها تلقائياً إذا كانت فارغة)
    const deptSettings = await this.fetchDepartmentSettings();
    const lowerId = cleanId.toLowerCase();

    const matchedDept = deptSettings.find(
      d =>
        String(d.slug || '').toLowerCase() === lowerId ||
        String(d.username || '').toLowerCase() === lowerId ||
        d.department_name === cleanId
    );

    if (matchedDept) {
      const validPass =
        cleanPass === matchedDept.login_password ||
        cleanPass === matchedDept.default_password;

      if (validPass) {
        const session = {
          slug: matchedDept.slug,
          username: matchedDept.username || matchedDept.slug,
          department_name: matchedDept.department_name,
          redirect_url: `/admin/${matchedDept.slug}`,
          logged_in_at: new Date().toISOString()
        };
        this.saveLocalAuthSession(session);

        // محاولة تسجيل جلسة الكوكي على الخادم في الخلفية (بمهلة قصيرة حتى لا يتأخر التوجيه)
        safeApiFetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: cleanId,
            username: cleanId,
            password: cleanPass
          }),
          timeoutMs: 2200
        }).catch(() => {});

        return session;
      }
    }

    // 2. التحقق عبر الخادم في حال تم تغيير كلمة المرور على الخادم فقط
    const res = await safeApiFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identifier: cleanId,
        username: cleanId,
        password: cleanPass
      }),
      timeoutMs: 3000
    });

    if (res.isJson && res.ok && res.data?.ok && res.data?.session) {
      const session = res.data.session;
      this.saveLocalAuthSession(session);
      return session;
    }

    throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
  },

  async getAuthSession() {
    const localSess = this.getLocalAuthSession();
    if (localSess && localSess.slug) {
      return localSess;
    }

    const res = await safeApiFetch('/api/auth/session', { timeoutMs: 2500 });
    if (res.isJson && res.ok && res.data?.authenticated && res.data?.session) {
      this.saveLocalAuthSession(res.data.session);
      return res.data.session;
    }
    return null;
  },

  async logoutDepartment() {
    this.saveLocalAuthSession(null);
    await safeApiFetch('/api/auth/logout', { method: 'POST', timeoutMs: 2000 });
  },

  getLocalDepartmentSettings() {
    this.initLocalStore();
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.DEPT_SETTINGS));
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map(normalizeDeptSettingObject).filter(Boolean);
      }
      return [...INITIAL_DEPARTMENT_SETTINGS];
    } catch {
      return [...INITIAL_DEPARTMENT_SETTINGS];
    }
  },

  saveLocalDepartmentSettings(list) {
    localStorage.setItem(
      STORAGE_KEYS.DEPT_SETTINGS,
      JSON.stringify((list || []).map(normalizeDeptSettingObject).filter(Boolean))
    );
  },

  /**
   * جلب إعدادات الأقسام الخمسة من Firebase Realtime Database (وزرعها تلقائياً إذا كانت فارغة)
   */
  async fetchDepartmentSettings() {
    const fbRes = await firebaseFetch('/department_settings.json', 'GET');
    if (fbRes.ok) {
      const fbList = firebaseNodeToArray(fbRes.data)
        .map(normalizeDeptSettingObject)
        .filter(Boolean);

      if (fbList.length === 0) {
        // زرع حسابات الأقسام الخمسة في Firebase تلقائياً إذا كانت فارغة
        const seedMap = {};
        const localSeed = this.getLocalDepartmentSettings();
        localSeed.forEach(d => {
          seedMap[d.slug] = normalizeDeptSettingObject(d);
        });
        await firebaseFetch('/department_settings.json', 'PUT', seedMap);
        this.saveLocalDepartmentSettings(localSeed);
        return localSeed;
      }

      // دمج الأقسام الخمسة لضمان وجودها جميعاً
      const bySlug = new Map(fbList.map(d => [d.slug, d]));
      const merged = INITIAL_DEPARTMENT_SETTINGS.map(def => {
        const existing = bySlug.get(def.slug);
        return existing ? normalizeDeptSettingObject({ ...def, ...existing }) : def;
      });

      this.saveLocalDepartmentSettings(merged);
      return merged;
    }

    const res = await safeApiFetch('/api/department-settings', { timeoutMs: 3500 });
    if (res.isJson && res.ok && Array.isArray(res.data?.settings)) {
      this.saveLocalDepartmentSettings(res.data.settings);
      return res.data.settings;
    }
    return this.getLocalDepartmentSettings();
  },

  /**
   * حفظ إعدادات البريد الإلكتروني (Gmail + App Password) وكلمة مرور القسم مباشرة في Firebase والخادم
   */
  async saveDepartmentSetting(
    department_name,
    { sender_gmail, gmail_app_password, login_password }
  ) {
    const cleanEmail = String(sender_gmail || '').trim().toLowerCase();
    const cleanPass = stripAppPasswordSpaces(gmail_app_password);
    const cleanLoginPass =
      login_password !== undefined ? String(login_password || '').trim() : undefined;

    if (cleanEmail && !/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(cleanEmail)) {
      throw new Error('يرجى إدخال عنوان بريد إلكتروني صحيح للقسم ينتهي بـ @gmail.com.');
    }

    if (cleanPass && cleanPass.length !== 16) {
      throw new Error(
        `يرجى إدخال رمز تطبيق جوجل (App Password) المكون من 16 حرفاً بالضبط (الحالي بعد إزالة المسافات: ${cleanPass.length} حرفاً).`
      );
    }

    if ((cleanEmail && !cleanPass) || (!cleanEmail && cleanPass)) {
      throw new Error(
        'لإعداد البريد الإلكتروني للقسم يرجى إدخال كل من عنوان Gmail ورمز التطبيق المكون من 16 حرفاً معاً.'
      );
    }

    if (cleanLoginPass !== undefined && cleanLoginPass.length < 4) {
      throw new Error('كلمة مرور تسجيل الدخول للقسم يجب أن تتكون من 4 أحرف أو أرقام على الأقل.');
    }

    const list = await this.fetchDepartmentSettings();
    const idx = list.findIndex(
      d => d.department_name === department_name || d.slug === department_name
    );
    const prev = idx !== -1 ? list[idx] : INITIAL_DEPARTMENT_SETTINGS[0];

    const updatedItem = normalizeDeptSettingObject({
      ...prev,
      department_name: prev.department_name || department_name,
      sender_gmail: cleanEmail || null,
      gmail_app_password: cleanPass || null,
      login_password: cleanLoginPass || prev.login_password || prev.default_password,
      is_configured: Boolean(cleanEmail && cleanPass && cleanPass.length === 16),
      updated_at: new Date().toISOString()
    });

    if (idx !== -1) {
      list[idx] = updatedItem;
    } else {
      list.push(updatedItem);
    }
    this.saveLocalDepartmentSettings(list);

    // 1. حفظ مباشر في Firebase Realtime Database
    await firebaseFetch(
      `/department_settings/${encodeURIComponent(updatedItem.slug)}.json`,
      'PUT',
      updatedItem
    );

    // 2. مزامنة مع الخادم
    await safeApiFetch('/api/department-settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department_name: updatedItem.department_name,
        sender_gmail: cleanEmail,
        gmail_app_password: cleanPass,
        login_password: updatedItem.login_password
      }),
      timeoutMs: 4000
    });

    return updatedItem;
  },

  async sendDepartmentTestEmail({ department_name, sender_gmail, gmail_app_password }) {
    const cleanEmail = String(sender_gmail || '').trim().toLowerCase();
    const cleanPass = stripAppPasswordSpaces(gmail_app_password);

    if (!cleanEmail || !/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(cleanEmail)) {
      throw new Error('يرجى إدخال عنوان بريد إلكتروني صحيح للقسم ينتهي بـ @gmail.com.');
    }

    if (cleanPass.length !== 16) {
      throw new Error(
        `رمز تطبيق جوجل (App Password) يجب أن يتكون من 16 حرفاً بالضبط (الحالي بعد إزالة المسافات: ${cleanPass.length} حرفاً).`
      );
    }

    const res = await safeApiFetch('/api/department-settings/test-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        department_name,
        sender_gmail: cleanEmail,
        gmail_app_password: cleanPass
      }),
      timeoutMs: 12000
    });

    if (res.isJson) {
      if (!res.ok || !res.data?.ok) {
        throw new Error(
          res.data?.message || 'فشل إرسال الرسالة التجريبية، يرجى التحقق من رمز التطبيق.'
        );
      }
      await this.saveDepartmentSetting(department_name, {
        sender_gmail: cleanEmail,
        gmail_app_password: cleanPass
      });
      if (res.data.notification) {
        const notifs = this.getLocalNotifications();
        this.saveLocalNotifications([res.data.notification, ...notifs]);
      }
      return res.data;
    }

    throw new Error('تعذر الاتصال بخادم البريد لإرسال الرسالة التجريبية.');
  },

  getLocalRequests() {
    this.initLocalStore();
    try {
      const list = JSON.parse(localStorage.getItem(STORAGE_KEYS.REQUESTS)) || [];
      return list.map(normalizeRecord).filter(Boolean);
    } catch {
      return [...INITIAL_SEED_REQUESTS];
    }
  },

  saveLocalRequests(list) {
    localStorage.setItem(
      STORAGE_KEYS.REQUESTS,
      JSON.stringify((list || []).map(normalizeRecord).filter(Boolean))
    );
  },

  getLocalNotifications() {
    this.initLocalStore();
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEYS.NOTIFICATIONS)) || [];
    } catch {
      return [...INITIAL_SEED_NOTIFICATIONS];
    }
  },

  saveLocalNotifications(list) {
    localStorage.setItem(STORAGE_KEYS.NOTIFICATIONS, JSON.stringify(list));
  },

  /**
   * جلب جميع الطلبات مباشرة من Firebase Realtime Database (`requests.json`)
   */
  async fetchRequests(departmentFilter = null) {
    const fbRes = await firebaseFetch('/requests.json', 'GET');
    if (fbRes.ok) {
      const fbList = firebaseNodeToArray(fbRes.data).map(normalizeRecord).filter(Boolean);

      if (fbList.length === 0 && !fbRes.data) {
        // إذا كانت قاعدة بيانات Firebase فارغة تماماً، نقوم بزرع الطلبات الأولية
        const seedMap = {};
        INITIAL_SEED_REQUESTS.forEach(r => {
          seedMap[r.id] = r;
        });
        await firebaseFetch('/requests.json', 'PUT', seedMap);
        this.saveLocalRequests(INITIAL_SEED_REQUESTS);
        if (departmentFilter && departmentFilter !== 'all') {
          return INITIAL_SEED_REQUESTS.filter(r => r.department === departmentFilter);
        }
        return [...INITIAL_SEED_REQUESTS];
      }

      fbList.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
      this.saveLocalRequests(fbList);

      if (departmentFilter && departmentFilter !== 'all') {
        return fbList.filter(r => r.department === departmentFilter);
      }
      return fbList;
    }

    // في حال تعذر الوصول المباشر لـ Firebase، الجلب من الخادم
    const query =
      departmentFilter && departmentFilter !== 'all'
        ? `?department=${encodeURIComponent(departmentFilter)}`
        : '';
    const res = await safeApiFetch(`/api/requests${query}`, { timeoutMs: 4000 });
    if (res.isJson && res.ok && Array.isArray(res.data?.requests)) {
      const serverList = res.data.requests.map(normalizeRecord).filter(Boolean);
      this.saveLocalRequests(serverList);
      if (departmentFilter && departmentFilter !== 'all') {
        return serverList.filter(r => r.department === departmentFilter);
      }
      return serverList;
    }

    let local = this.getLocalRequests();
    if (departmentFilter && departmentFilter !== 'all') {
      local = local.filter(r => r.department === departmentFilter);
    }
    local.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return local;
  },

  /**
   * إنشاء طلب وثيقة جديد وحفظه مباشرة في Firebase Realtime Database (`requests.json`) وفي الخادم
   */
  async createRequest(payload) {
    const existingList = await this.fetchRequests();
    const cardNo = String(payload.student_card_number ?? payload.studentCardNumber ?? '').trim();
    const docType = String(payload.document_type ?? payload.documentType ?? '').trim();

    const duplicate = existingList.find(
      r =>
        String(r.student_card_number || '').trim().toLowerCase() === cardNo.toLowerCase() &&
        r.document_type === docType &&
        r.status === 'pending'
    );

    if (duplicate) {
      const err = new Error(
        `عذراً الطالب(ة) الكريم(ة)، لديكم بالفعل طلب نشط "قيد المعالجة" لاستخراج وثيقة (${docType}) مسجل بنفس رقم بطاقة الطالب (${cardNo}) تحت رمز التتبع (${duplicate.tracking_code}). يرجى انتظار استكمال معالجة طلبكم الحالي.`
      );
      err.isDuplicatePending = true;
      err.existingRequest = duplicate;
      throw err;
    }

    const now = new Date().toISOString();
    const existingCodes = new Set(
      existingList.map(r => String(r.tracking_code || '').toUpperCase())
    );
    let trackingCode = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    while (existingCodes.has(trackingCode)) {
      trackingCode = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    }

    const newReq = normalizeRecord({
      id: generateClientUuid(),
      tracking_code: trackingCode,
      first_name: String(payload.first_name ?? payload.firstName ?? '').trim(),
      last_name: String(payload.last_name ?? payload.lastName ?? '').trim(),
      student_card_number: cardNo,
      email: String(payload.email ?? '').trim().toLowerCase(),
      department: String(payload.department ?? '').trim(),
      bac_year: String(payload.bac_year ?? payload.bacYear ?? '').trim(),
      document_type: docType,
      degree_level:
        payload.degree_level ?? payload.degreeLevel ?? payload.conditionalDetails?.cycle ?? null,
      requested_year:
        payload.requested_year ??
        payload.requestedYear ??
        payload.conditionalDetails?.targetYear ??
        null,
      academic_year:
        payload.academic_year ??
        payload.academicYear ??
        payload.conditionalDetails?.academicYear ??
        null,
      status: 'pending',
      rejection_reason: null,
      created_at: now
    });

    // 1. حفظ مباشر في Firebase Realtime Database
    await firebaseFetch(`/requests/${encodeURIComponent(newReq.id)}.json`, 'PUT', newReq);

    // 2. تحديث الذاكرة المحلية
    this.saveLocalRequests([newReq, ...existingList.filter(r => r.id !== newReq.id)]);

    // 3. مزامنة مع الخادم في الخلفية
    safeApiFetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newReq),
      timeoutMs: 3500
    }).catch(() => {});

    return newReq;
  },

  /**
   * تحديث حالة الطلب ("تأكيد الجاهزية" / "رفض الطلب") مباشرة في Firebase Realtime Database
   * وإرسال إشعار Gmail للطالب عبر نقطة النهاية /api/requests/:id/status مع Auto-Upsert كامل
   */
  async updateRequestStatus(
    requestId,
    status,
    rejectionReason = '',
    requestObj = null,
    deptSettingObj = null
  ) {
    const allRequests = await this.fetchRequests();
    const resolvedRequest =
      requestObj ||
      allRequests.find(r => r.id === requestId || r.tracking_code === requestId) ||
      this.getLocalRequests().find(r => r.id === requestId || r.tracking_code === requestId) ||
      null;

    if (!resolvedRequest) {
      throw new Error('تعذر العثور على بيانات الطلب.');
    }

    const deptSettingsList = await this.fetchDepartmentSettings();
    const resolvedDeptSetting =
      deptSettingObj ||
      deptSettingsList.find(d => d.department_name === resolvedRequest.department) ||
      null;

    if (
      (status === 'ready' || status === 'rejected') &&
      (!resolvedDeptSetting ||
        !resolvedDeptSetting.is_configured ||
        !resolvedDeptSetting.sender_gmail ||
        !resolvedDeptSetting.gmail_app_password)
    ) {
      const err = new Error(
        'يرجى إدخال البريد الإلكتروني للقسم ورمز التطبيق في خانة الإعدادات أولاً قبل إرسال الإشعارات'
      );
      err.isDeptEmailUnconfigured = true;
      err.department = resolvedRequest.department;
      throw err;
    }

    // 1. استدعاء الخادم لإرسال بريد Gmail الفعلي عبر Nodemailer وتحديث قاعدة البيانات
    const res = await safeApiFetch(
      `/api/requests/${encodeURIComponent(resolvedRequest.id || requestId)}/status`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...resolvedRequest,
          status,
          rejection_reason: status === 'rejected' ? rejectionReason : null,
          rejectionReason: status === 'rejected' ? rejectionReason : '',
          request: resolvedRequest,
          department_setting: resolvedDeptSetting,
          sender_gmail: resolvedDeptSetting?.sender_gmail,
          gmail_app_password: resolvedDeptSetting?.gmail_app_password
        }),
        timeoutMs: 12000
      }
    );

    if (res.isJson && !res.ok) {
      if (res.status === 428 || res.data?.code === 'DEPARTMENT_EMAIL_NOT_CONFIGURED') {
        const err = new Error(
          res.data?.message ||
            'يرجى إدخال البريد الإلكتروني للقسم ورمز التطبيق في خانة الإعدادات أولاً قبل إرسال الإشعارات'
        );
        err.isDeptEmailUnconfigured = true;
        err.department = res.data?.department || resolvedRequest.department;
        throw err;
      }
      throw new Error(res.data?.message || 'تعذر تحديث حالة الطلب أو إرسال البريد الإلكتروني.');
    }

    const updatedRecord = normalizeRecord({
      ...resolvedRequest,
      ...(res.isJson && res.data?.request ? res.data.request : {}),
      status,
      rejection_reason: status === 'rejected' ? rejectionReason : null
    });

    // 2. حفظ التحديث مباشرة وبشكل دائم في Firebase Realtime Database
    await firebaseFetch(
      `/requests/${encodeURIComponent(updatedRecord.id)}.json`,
      'PUT',
      updatedRecord
    );

    // 3. تحديث النسخة المحلية وسجل الإشعارات
    const list = this.getLocalRequests();
    const idx = list.findIndex(
      r => r.id === updatedRecord.id || r.tracking_code === updatedRecord.tracking_code
    );
    if (idx !== -1) {
      list[idx] = updatedRecord;
    } else {
      list.unshift(updatedRecord);
    }
    this.saveLocalRequests(list);

    const notification =
      (res.isJson && res.data?.notification) ||
      buildGmailNotificationPayload(
        updatedRecord,
        status,
        resolvedDeptSetting?.sender_gmail || 'pedagogy.dept@gmail.com'
      );

    if (notification) {
      const notifs = this.getLocalNotifications();
      this.saveLocalNotifications([notification, ...notifs]);
      firebaseFetch(
        `/email_notifications/${encodeURIComponent(notification.id || generateClientUuid())}.json`,
        'PUT',
        notification
      ).catch(() => {});
    }

    return { request: updatedRecord, notification };
  },

  async fetchNotifications(departmentFilter = null) {
    const fbRes = await firebaseFetch('/email_notifications.json', 'GET');
    if (fbRes.ok && fbRes.data) {
      let list = firebaseNodeToArray(fbRes.data);
      list.sort(
        (a, b) => new Date(b.sentAt || b.sent_at || 0) - new Date(a.sentAt || a.sent_at || 0)
      );
      this.saveLocalNotifications(list);
      if (departmentFilter && departmentFilter !== 'all') {
        return list.filter(n => n.department === departmentFilter);
      }
      return list;
    }

    const res = await safeApiFetch('/api/notifications', { timeoutMs: 3500 });
    let list = [];
    if (res.isJson && res.ok && Array.isArray(res.data?.notifications)) {
      this.saveLocalNotifications(res.data.notifications);
      list = res.data.notifications;
    } else {
      list = this.getLocalNotifications();
    }
    if (departmentFilter && departmentFilter !== 'all') {
      return list.filter(n => n.department === departmentFilter);
    }
    return list;
  }
};

/**
 * إزالة أي شارة عائمة خارجية ("Powered by Netlify") يتم حقنها ديناميكياً في الصفحة
 */
(function initNetlifyBadgeRemover() {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;

  const BADGE_SELECTORS = [
    'a[href*="netlify.com"]',
    'iframe[src*="netlify"]',
    '#netlify-badge',
    '.netlify-badge',
    '[data-netlify-badge]',
    '[data-netlify-deploy-badge]'
  ].join(', ');

  function purgeInjectedBadges() {
    try {
      document.querySelectorAll(BADGE_SELECTORS).forEach(el => {
        el.remove();
      });

      const candidates = document.querySelectorAll('a, div, span, aside, p, iframe');
      candidates.forEach(el => {
        if (
          el === document.body ||
          el === document.documentElement ||
          el.classList.contains('gateway-wrapper') ||
          el.classList.contains('main-container') ||
          el.classList.contains('student-desktop-container') ||
          el.classList.contains('login-desktop-stage')
        ) {
          return;
        }
        const text = (el.textContent || '').trim().toLowerCase();
        if (
          text === 'powered by netlify' ||
          (text.includes('powered by netlify') && text.length < 80)
        ) {
          el.remove();
        }
      });
    } catch {
      // تجاهل أي أخطاء أثناء الفحص
    }
  }

  purgeInjectedBadges();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', purgeInjectedBadges);
  }

  if (typeof MutationObserver !== 'undefined') {
    const observer = new MutationObserver(() => {
      purgeInjectedBadges();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
  }
})();
