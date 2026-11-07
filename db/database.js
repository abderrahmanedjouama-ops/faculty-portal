/**
 * طبقة قاعدة البيانات السحابية المستمرة عبر Firebase Realtime Database + ذاكرة /tmp (Zero SQLite)
 * تتصل مباشرة بقاعدة بيانات Firebase Realtime Database عبر واجهة REST القياسية:
 *   https://faculty-portal-6148c-default-rtdb.europe-west1.firebasedatabase.app
 * وتحتفظ بنسخة محلية سريعة في /tmp/faculty-db.json (على Netlify) أو ./db/faculty-db.json (محلياً).
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const {
  normalizeAppPassword,
  buildReadyEmailTemplate,
  buildRejectedEmailTemplate
} = require('../services/emailService');

const FIREBASE_DB_URL = (
  process.env.FIREBASE_DB_URL ||
  'https://faculty-portal-6148c-default-rtdb.europe-west1.firebasedatabase.app'
).replace(/\/+$/, '');

function resolveJsonDbPath() {
  const isServerless = Boolean(
    process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT
  );

  if (isServerless) {
    return '/tmp/faculty-db.json';
  }

  return path.join(__dirname, 'faculty-db.json');
}

const DB_FILE_PATH = resolveJsonDbPath();

const DEPARTMENT_DEFINITIONS = [
  {
    id: 'd502290f-8b2d-4d62-9f73-220000000001',
    department_name: 'قسم الآلية والإلكترونيك',
    slug: 'automatique',
    username: 'automatique',
    default_password: 'auto2026'
  },
  {
    id: 'd502290f-8b2d-4d62-9f73-220000000002',
    department_name: 'قسم الهندسة الكهربائية',
    slug: 'electrique',
    username: 'electrique',
    default_password: 'elec2026'
  },
  {
    id: 'd502290f-8b2d-4d62-9f73-220000000003',
    department_name: 'قسم جذع مشترك (خاص بالسنة الأولى)',
    slug: 'tronc-commun',
    username: 'tronc-commun',
    default_password: 'tronc2026'
  },
  {
    id: 'd502290f-8b2d-4d62-9f73-220000000004',
    department_name: 'قسم هندسة الطرائق',
    slug: 'procedes',
    username: 'procedes',
    default_password: 'proc2026'
  },
  {
    id: 'd502290f-8b2d-4d62-9f73-220000000005',
    department_name: 'قسم الميكانيك',
    slug: 'mecanique',
    username: 'mecanique',
    default_password: 'meca2026'
  }
];

const EXACT_DEPARTMENTS = DEPARTMENT_DEFINITIONS.map(d => d.department_name);

function buildInitialSeedStore() {
  const now = new Date().toISOString();

  const department_settings = DEPARTMENT_DEFINITIONS.map(def => ({
    id: def.id,
    department_name: def.department_name,
    slug: def.slug,
    username: def.username,
    route: `/admin/${def.slug}`,
    login_password: def.default_password,
    default_password: def.default_password,
    sender_gmail: null,
    gmail_app_password: null,
    is_configured: 0,
    updated_at: now
  }));

  const document_requests = [
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    },
    {
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
    }
  ];

  const email_notifications = [];
  for (const r of document_requests) {
    if (r.status === 'ready' || r.status === 'rejected') {
      const tpl =
        r.status === 'ready' ? buildReadyEmailTemplate(r) : buildRejectedEmailTemplate(r);
      email_notifications.push({
        id: `notif-${r.tracking_code.toLowerCase()}`,
        request_id: r.id,
        tracking_code: r.tracking_code,
        sender_gmail: 'pedagogy.dept@gmail.com',
        recipient_email: r.email,
        student_name: `${r.first_name} ${r.last_name}`,
        document_type: r.document_type,
        department: r.department,
        notification_type: r.status,
        subject: tpl.subject,
        html_body: tpl.htmlBody,
        text_body: tpl.textBody,
        delivery_status: 'sent',
        provider: 'nodemailer-gmail-smtp',
        sent_at: r.created_at
      });
    }
  }

  return {
    department_settings,
    document_requests,
    email_notifications
  };
}

let memoryStore = null;
let lastCloudSyncTimestamp = 0;

function readStore() {
  try {
    if (fs.existsSync(DB_FILE_PATH)) {
      const raw = fs.readFileSync(DB_FILE_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        ensureDepartmentsInStore(parsed);
        memoryStore = parsed;
        return parsed;
      }
    }
  } catch {
    // في حال تعذر القراءة نستخدم البيانات الأولية
  }

  if (!memoryStore) {
    memoryStore = buildInitialSeedStore();
    writeStore(memoryStore);
  }
  return memoryStore;
}

function writeStore(store) {
  memoryStore = store;
  try {
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(DB_FILE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch {
    // الاحتفاظ بنسخة الذاكرة إذا كانت الكتابة غير متاحة مؤقتاً
  }
}

function ensureDepartmentsInStore(store) {
  if (!Array.isArray(store.department_settings)) {
    store.department_settings = [];
  }
  if (!Array.isArray(store.document_requests)) {
    store.document_requests = [];
  }
  if (!Array.isArray(store.email_notifications)) {
    store.email_notifications = [];
  }

  const now = new Date().toISOString();
  DEPARTMENT_DEFINITIONS.forEach(def => {
    const existing = store.department_settings.find(
      d => d.department_name === def.department_name || d.slug === def.slug
    );
    if (!existing) {
      store.department_settings.push({
        id: def.id,
        department_name: def.department_name,
        slug: def.slug,
        username: def.username,
        route: `/admin/${def.slug}`,
        login_password: def.default_password,
        default_password: def.default_password,
        sender_gmail: null,
        gmail_app_password: null,
        is_configured: 0,
        updated_at: now
      });
    } else {
      existing.id = existing.id || def.id;
      existing.department_name = def.department_name;
      existing.slug = def.slug;
      existing.username = def.username;
      existing.route = `/admin/${def.slug}`;
      existing.default_password = def.default_password;
      existing.login_password = existing.login_password || def.default_password;
    }
  });
}

/**
 * دالة اتصال مباشر بـ Firebase Realtime Database عبر مكتبة https المدمجة
 */
function firebaseRestRequest(subPath, method = 'GET', bodyObj = null) {
  return new Promise(resolve => {
    try {
      const targetUrl = new URL(`${FIREBASE_DB_URL}${subPath}`);
      const payloadStr = bodyObj !== null ? JSON.stringify(bodyObj) : null;

      const req = https.request(
        {
          hostname: targetUrl.hostname,
          port: 443,
          path: targetUrl.pathname + targetUrl.search,
          method,
          headers: {
            Accept: 'application/json',
            'User-Agent': 'FST-Biskra-Firebase-Adapter/1.0',
            ...(payloadStr !== null
              ? {
                  'Content-Type': 'application/json; charset=utf-8',
                  'Content-Length': Buffer.byteLength(payloadStr)
                }
              : {})
          },
          timeout: 3800
        },
        res => {
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            if (res.statusCode < 200 || res.statusCode >= 300) {
              return resolve({ ok: false, status: res.statusCode, data: null });
            }
            try {
              const parsed = raw ? JSON.parse(raw) : null;
              resolve({ ok: true, status: res.statusCode, data: parsed });
            } catch {
              resolve({ ok: false, status: res.statusCode, data: null });
            }
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        resolve({ ok: false, status: 0, data: null });
      });
      req.on('error', () => resolve({ ok: false, status: 0, data: null }));

      if (payloadStr !== null) {
        req.write(payloadStr);
      }
      req.end();
    } catch {
      resolve({ ok: false, status: 0, data: null });
    }
  });
}

function extractArrayFromFirebaseNode(node) {
  if (!node) return [];
  if (Array.isArray(node)) return node.filter(Boolean);
  if (typeof node === 'object') return Object.values(node).filter(Boolean);
  return [];
}

/**
 * مزامنة شاملة مع Firebase Realtime Database (مع التهيئة التلقائية للأقسام الخمسة والطلبات إذا كانت فارغة)
 */
async function syncFromCloud(force = false) {
  const now = Date.now();
  if (!force && now - lastCloudSyncTimestamp < 1500) {
    return readStore();
  }
  lastCloudSyncTimestamp = now;

  const store = readStore();
  const rootRes = await firebaseRestRequest('/.json', 'GET');
  if (!rootRes.ok) {
    return store;
  }

  const fbRoot = rootRes.data || {};
  const fbDeptsList = extractArrayFromFirebaseNode(fbRoot.department_settings);
  const fbReqsList = extractArrayFromFirebaseNode(fbRoot.requests);
  const fbNotifsList = extractArrayFromFirebaseNode(fbRoot.email_notifications);

  let storeChanged = false;

  // 1. إذا كانت إعدادات الأقسام الخمسة غير موجودة في Firebase، نقوم بزرعها تلقائياً
  if (fbDeptsList.length === 0) {
    const deptMap = {};
    store.department_settings.forEach(d => {
      deptMap[d.slug] = normalizeDepartmentSettingRow(d);
    });
    await firebaseRestRequest('/department_settings.json', 'PUT', deptMap);
  } else {
    fbDeptsList.forEach(fbDept => {
      if (!fbDept) return;
      const localRow = store.department_settings.find(
        r =>
          r.slug === fbDept.slug ||
          r.department_name === fbDept.department_name ||
          r.username === fbDept.username
      );
      if (localRow) {
        if (fbDept.sender_gmail !== undefined) localRow.sender_gmail = fbDept.sender_gmail;
        if (fbDept.gmail_app_password !== undefined) {
          localRow.gmail_app_password = fbDept.gmail_app_password;
        }
        if (fbDept.login_password) {
          localRow.login_password = fbDept.login_password;
        }
        localRow.is_configured = Boolean(
          localRow.sender_gmail &&
            localRow.gmail_app_password &&
            normalizeAppPassword(localRow.gmail_app_password).length === 16
        )
          ? 1
          : 0;
        localRow.updated_at = fbDept.updated_at || localRow.updated_at;
        storeChanged = true;
      }
    });
  }

  // 2. إذا كانت قائمة الطلبات فارغة في Firebase، نقوم بزرع الطلبات الأولية
  if (fbReqsList.length === 0 && !fbRoot.requests) {
    const reqMap = {};
    store.document_requests.forEach(r => {
      if (r && r.id) reqMap[r.id] = r;
    });
    await firebaseRestRequest('/requests.json', 'PUT', reqMap);
  } else if (fbReqsList.length > 0) {
    const mergedReqMap = new Map();
    store.document_requests.forEach(r => {
      if (r && r.id) mergedReqMap.set(r.id, r);
    });
    fbReqsList.forEach(fbReq => {
      if (fbReq && fbReq.id) {
        mergedReqMap.set(fbReq.id, {
          ...(mergedReqMap.get(fbReq.id) || {}),
          ...fbReq
        });
      }
    });
    store.document_requests = Array.from(mergedReqMap.values()).sort(
      (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
    );
    storeChanged = true;
  }

  // 3. مزامنة سجل الإشعارات المرسلة
  if (fbNotifsList.length === 0 && !fbRoot.email_notifications) {
    const notifMap = {};
    store.email_notifications.forEach(n => {
      if (n && n.id) notifMap[n.id] = n;
    });
    await firebaseRestRequest('/email_notifications.json', 'PUT', notifMap);
  } else if (fbNotifsList.length > 0) {
    const mergedNotifMap = new Map();
    store.email_notifications.forEach(n => {
      if (n && n.id) mergedNotifMap.set(n.id, n);
    });
    fbNotifsList.forEach(fbNotif => {
      if (fbNotif && fbNotif.id) {
        mergedNotifMap.set(fbNotif.id, fbNotif);
      }
    });
    store.email_notifications = Array.from(mergedNotifMap.values()).sort(
      (a, b) => new Date(b.sent_at || 0) - new Date(a.sent_at || 0)
    );
    storeChanged = true;
  }

  if (storeChanged) {
    writeStore(store);
  }

  return store;
}

// تهيئة قاعدة البيانات عند بدء التشغيل
readStore();

function normalizeDepartmentSettingRow(row) {
  if (!row) return null;
  const def =
    DEPARTMENT_DEFINITIONS.find(
      d => d.department_name === row.department_name || d.slug === row.slug
    ) || {};
  const isConfigured = Boolean(
    row.is_configured &&
      row.sender_gmail &&
      String(row.sender_gmail).trim() !== '' &&
      row.gmail_app_password &&
      normalizeAppPassword(row.gmail_app_password).length === 16
  );

  const slug = row.slug || def.slug || '';
  const username = row.username || def.username || slug;
  const loginPassword = row.login_password || def.default_password || '';

  return {
    id: row.id || def.id,
    department_name: row.department_name || def.department_name,
    slug,
    username,
    route: `/admin/${slug}`,
    login_password: loginPassword,
    default_password: def.default_password || loginPassword,
    sender_gmail: row.sender_gmail || null,
    gmail_app_password: row.gmail_app_password || null,
    is_configured: isConfigured,
    updated_at: row.updated_at || new Date().toISOString()
  };
}

function getAllDepartmentSettings() {
  const store = readStore();
  const mapByName = new Map(
    store.department_settings.map(r => [r.department_name, normalizeDepartmentSettingRow(r)])
  );
  return EXACT_DEPARTMENTS.map(deptName => mapByName.get(deptName)).filter(Boolean);
}

function getDepartmentSettings(identifier) {
  const val = String(identifier || '').trim().toLowerCase();
  if (!val) return null;
  const store = readStore();
  const row = store.department_settings.find(
    r =>
      r.department_name === identifier ||
      String(r.department_name || '').toLowerCase() === val ||
      String(r.slug || '').toLowerCase() === val ||
      String(r.username || '').toLowerCase() === val
  );
  return normalizeDepartmentSettingRow(row);
}

function verifyDepartmentCredentials(identifier, password) {
  const dept = getDepartmentSettings(identifier);
  if (!dept) return null;
  const cleanInputPass = String(password || '').trim();
  if (
    !cleanInputPass ||
    (cleanInputPass !== dept.login_password && cleanInputPass !== dept.default_password)
  ) {
    return null;
  }
  return dept;
}

function updateDepartmentSettings(
  identifier,
  { sender_gmail, gmail_app_password, login_password }
) {
  const store = readStore();
  const val = String(identifier || '').trim().toLowerCase();
  const row = store.department_settings.find(
    r =>
      r.department_name === identifier ||
      String(r.department_name || '').toLowerCase() === val ||
      String(r.slug || '').toLowerCase() === val ||
      String(r.username || '').toLowerCase() === val
  );

  if (!row) {
    throw new Error('القسم المحدد غير موجود في جدول department_settings.');
  }

  const nextEmail =
    sender_gmail !== undefined
      ? String(sender_gmail || '').trim().toLowerCase() || null
      : row.sender_gmail;
  const nextAppPass =
    gmail_app_password !== undefined
      ? normalizeAppPassword(gmail_app_password) || null
      : row.gmail_app_password;
  const nextLoginPass =
    login_password !== undefined && String(login_password).trim() !== ''
      ? String(login_password).trim()
      : row.login_password;

  row.sender_gmail = nextEmail;
  row.gmail_app_password = nextAppPass;
  row.login_password = nextLoginPass;
  row.is_configured = Boolean(nextEmail && nextAppPass && nextAppPass.length === 16) ? 1 : 0;
  row.updated_at = new Date().toISOString();

  writeStore(store);

  const normalized = normalizeDepartmentSettingRow(row);
  firebaseRestRequest(
    `/department_settings/${encodeURIComponent(normalized.slug)}.json`,
    'PUT',
    normalized
  );

  return normalized;
}

function generateUniqueTrackingCode(store) {
  const existingCodes = new Set(
    (store.document_requests || []).map(r => String(r.tracking_code || '').toUpperCase())
  );
  for (let attempt = 0; attempt < 25; attempt++) {
    const code = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    if (!existingCodes.has(code)) return code;
  }
  return `REQ-${Date.now().toString().slice(-5)}`;
}

function normalizeRequestRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    tracking_code: row.tracking_code,
    first_name: row.first_name,
    last_name: row.last_name,
    student_card_number: row.student_card_number,
    email: row.email,
    department: row.department,
    bac_year: row.bac_year,
    document_type: row.document_type,
    degree_level: row.degree_level ?? null,
    requested_year: row.requested_year ?? null,
    academic_year: row.academic_year ?? null,
    status: row.status || 'pending',
    rejection_reason: row.rejection_reason ?? null,
    created_at: row.created_at,

    trackingCode: row.tracking_code,
    firstName: row.first_name,
    lastName: row.last_name,
    studentCardNumber: row.student_card_number,
    bacYear: row.bac_year,
    documentType: row.document_type,
    degreeLevel: row.degree_level ?? null,
    requestedYear: row.requested_year ?? null,
    academicYear: row.academic_year ?? null,
    rejectionReason: row.rejection_reason ?? '',
    createdAt: row.created_at,
    conditionalDetails: {
      cycle: row.degree_level ?? null,
      targetYear: row.requested_year ?? null,
      academicYear: row.academic_year ?? null
    }
  };
}

function getAllRequests(filters = {}) {
  const { department, studentCardNumber, search, status } = filters;
  const store = readStore();
  let rows = [...(store.document_requests || [])];

  if (department && department !== 'all') {
    rows = rows.filter(r => r.department === department);
  }

  if (studentCardNumber) {
    const val = String(studentCardNumber).trim().toLowerCase();
    rows = rows.filter(
      r =>
        String(r.student_card_number || '').toLowerCase() === val ||
        String(r.tracking_code || '').toLowerCase() === val ||
        String(r.id || '').toLowerCase() === val
    );
  }

  if (status && status !== 'all') {
    rows = rows.filter(r => r.status === status);
  }

  if (search) {
    const q = String(search).trim().toLowerCase();
    rows = rows.filter(r => {
      const fullName = `${r.first_name || ''} ${r.last_name || ''}`.toLowerCase();
      return (
        String(r.student_card_number || '').toLowerCase().includes(q) ||
        String(r.first_name || '').toLowerCase().includes(q) ||
        String(r.last_name || '').toLowerCase().includes(q) ||
        fullName.includes(q) ||
        String(r.tracking_code || '').toLowerCase().includes(q)
      );
    });
  }

  rows.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
  return rows.map(normalizeRequestRow);
}

function findActivePendingDuplicate(studentCardNumber, documentType) {
  const store = readStore();
  const cardVal = String(studentCardNumber || '').trim().toLowerCase();
  const docVal = String(documentType || '').trim();

  const found = (store.document_requests || []).find(
    r =>
      String(r.student_card_number || '').trim().toLowerCase() === cardVal &&
      r.document_type === docVal &&
      r.status === 'pending'
  );
  return normalizeRequestRow(found);
}

function createDocumentRequest(payload) {
  const store = readStore();
  const id = payload.id || crypto.randomUUID();
  const trackingCode = payload.tracking_code || generateUniqueTrackingCode(store);
  const createdAt = payload.created_at || new Date().toISOString();

  const newRow = {
    id,
    tracking_code: trackingCode,
    first_name: payload.first_name,
    last_name: payload.last_name,
    student_card_number: payload.student_card_number,
    email: payload.email,
    department: payload.department,
    bac_year: payload.bac_year,
    document_type: payload.document_type,
    degree_level: payload.degree_level ?? null,
    requested_year: payload.requested_year ?? null,
    academic_year: payload.academic_year ?? null,
    status: payload.status || 'pending',
    rejection_reason: payload.rejection_reason ?? null,
    created_at: createdAt
  };

  store.document_requests = [
    newRow,
    ...store.document_requests.filter(r => r.id !== newRow.id)
  ];
  writeStore(store);

  firebaseRestRequest(`/requests/${encodeURIComponent(newRow.id)}.json`, 'PUT', newRow);

  return normalizeRequestRow(newRow);
}

function getRequestByIdOrTracking(identifier) {
  const store = readStore();
  const val = String(identifier || '').trim();
  const row = (store.document_requests || []).find(
    r => r.id === val || r.tracking_code === val
  );
  return normalizeRequestRow(row);
}

/**
 * حماية Auto-Upsert: إذا لم يكن الطلب موجوداً في الذاكرة المحلية للخادم،
 * يتم إدراجه أو تحديثه تلقائياً وحفظه في Firebase Realtime Database دون إرجاع خطأ 404.
 */
function upsertDocumentRequest(identifier, rawPayload = {}) {
  const store = readStore();
  const val = String(identifier || rawPayload.id || rawPayload.tracking_code || '').trim();

  const src =
    rawPayload.request && typeof rawPayload.request === 'object'
      ? { ...rawPayload, ...rawPayload.request }
      : rawPayload;

  let row = (store.document_requests || []).find(
    r =>
      (val && (r.id === val || r.tracking_code === val)) ||
      (src.id && r.id === src.id) ||
      (src.tracking_code && r.tracking_code === src.tracking_code)
  );

  if (!row) {
    const isTrackingCode = /^REQ-/i.test(val);
    const id = src.id || (!isTrackingCode && val ? val : crypto.randomUUID());
    const tracking_code =
      src.tracking_code ||
      src.trackingCode ||
      (isTrackingCode ? val : generateUniqueTrackingCode(store));

    row = {
      id,
      tracking_code,
      first_name: String(src.first_name ?? src.firstName ?? 'طالب').trim(),
      last_name: String(src.last_name ?? src.lastName ?? '').trim(),
      student_card_number: String(
        src.student_card_number ?? src.studentCardNumber ?? '—'
      ).trim(),
      email: String(src.email ?? '').trim().toLowerCase(),
      department: String(src.department ?? EXACT_DEPARTMENTS[0]).trim(),
      bac_year: String(src.bac_year ?? src.bacYear ?? '2024').trim(),
      document_type: String(src.document_type ?? src.documentType ?? 'شهادة مدرسية').trim(),
      degree_level:
        src.degree_level ?? src.degreeLevel ?? src.conditionalDetails?.cycle ?? null,
      requested_year:
        src.requested_year ?? src.requestedYear ?? src.conditionalDetails?.targetYear ?? null,
      academic_year:
        src.academic_year ?? src.academicYear ?? src.conditionalDetails?.academicYear ?? null,
      status: src.status || 'pending',
      rejection_reason: src.rejection_reason ?? src.rejectionReason ?? null,
      created_at: src.created_at ?? src.createdAt ?? new Date().toISOString()
    };

    store.document_requests.unshift(row);
  } else {
    if (src.first_name || src.firstName) row.first_name = src.first_name || src.firstName;
    if (src.last_name || src.lastName) row.last_name = src.last_name || src.lastName;
    if (src.student_card_number || src.studentCardNumber) {
      row.student_card_number = src.student_card_number || src.studentCardNumber;
    }
    if (src.email) row.email = String(src.email).trim().toLowerCase();
    if (src.department) row.department = src.department;
    if (src.bac_year || src.bacYear) row.bac_year = src.bac_year || src.bacYear;
    if (src.document_type || src.documentType) {
      row.document_type = src.document_type || src.documentType;
    }
  }

  writeStore(store);
  firebaseRestRequest(`/requests/${encodeURIComponent(row.id)}.json`, 'PUT', row);

  return normalizeRequestRow(row);
}

function updateRequestStatus(identifier, { status, rejectionReason = null, requestPayload = null }) {
  const store = readStore();
  const val = String(identifier || '').trim();
  let row = (store.document_requests || []).find(
    r => r.id === val || r.tracking_code === val
  );

  if (!row && requestPayload) {
    upsertDocumentRequest(val, requestPayload);
    row = (store.document_requests || []).find(
      r => r.id === val || r.tracking_code === val
    );
  }

  if (!row) return null;

  row.status = status;
  row.rejection_reason = status === 'rejected' ? String(rejectionReason || '').trim() : null;

  writeStore(store);
  firebaseRestRequest(`/requests/${encodeURIComponent(row.id)}.json`, 'PUT', row);

  return normalizeRequestRow(row);
}

function saveEmailNotification(notif) {
  const store = readStore();
  const record = {
    id: notif.id || crypto.randomUUID(),
    request_id: notif.request_id ?? null,
    tracking_code: notif.tracking_code ?? null,
    sender_gmail: notif.sender_gmail ?? null,
    recipient_email: notif.recipient_email,
    student_name: notif.student_name,
    document_type: notif.document_type,
    department: notif.department,
    notification_type: notif.notification_type,
    subject: notif.subject,
    html_body: notif.html_body,
    text_body: notif.text_body,
    delivery_status: notif.delivery_status,
    provider: notif.provider,
    sent_at: notif.sent_at || new Date().toISOString()
  };

  store.email_notifications = [
    record,
    ...store.email_notifications.filter(n => n.id !== record.id)
  ];
  writeStore(store);

  firebaseRestRequest(`/email_notifications/${encodeURIComponent(record.id)}.json`, 'PUT', record);

  return record;
}

function getAllNotifications() {
  const store = readStore();
  const rows = [...(store.email_notifications || [])];
  rows.sort((a, b) => new Date(b.sent_at) - new Date(a.sent_at));

  return rows.map(r => ({
    ...r,
    requestId: r.request_id,
    trackingCode: r.tracking_code,
    senderGmail: r.sender_gmail,
    to: r.recipient_email,
    studentName: r.student_name,
    documentType: r.document_type,
    notificationType: r.notification_type,
    htmlBody: r.html_body,
    textBody: r.text_body,
    sentAt: r.sent_at
  }));
}

module.exports = {
  FIREBASE_DB_URL,
  EXACT_DEPARTMENTS,
  syncFromCloud,
  firebaseRestRequest,
  getAllRequests,
  findActivePendingDuplicate,
  createDocumentRequest,
  getRequestByIdOrTracking,
  upsertDocumentRequest,
  updateRequestStatus,
  saveEmailNotification,
  getAllNotifications,
  getAllDepartmentSettings,
  getDepartmentSettings,
  updateDepartmentSettings,
  verifyDepartmentCredentials
};
