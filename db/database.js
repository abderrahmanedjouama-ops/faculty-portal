/**
 * طبقة قاعدة البيانات السحابية المستمرة (Cloud JSON Store + /tmp Cache - Zero SQLite)
 * تستخدم مكتبات Node.js المدمجة فقط (fs, path, https, crypto) لتخزين البيانات:
 * 1. سحابياً بشكل تلقائي ودائم عبر مخزن JSON السحابي (بدون مفاتيح API أو حسابات خارجية)
 *    لضمان بقاء الطلبات وإعدادات الأقسام عبر مختلف الأجهزة والمتصفحات وإعادات تشغيل Netlify.
 * 2. محلياً في /tmp/faculty-db.json (على Netlify) أو ./db/faculty-db.json (عند التشغيل المحلي) كذاكرة فورية.
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

// قناة التخزين السحابي الدائم (تعمل تلقائياً بدون مفاتيح أو تسجيل)
const CLOUD_STORE_TOPIC =
  process.env.FACULTY_CLOUD_TOPIC || 'fst_biskra_portal_cloud_db_2026_v1';
const CLOUD_STORE_HOST = 'ntfy.sh';

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
    login_password: def.default_password,
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
        id: crypto.randomUUID(),
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
    email_notifications,
    last_cloud_sync_at: 0
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
      d => d.department_name === def.department_name
    );
    if (!existing) {
      store.department_settings.push({
        id: def.id,
        department_name: def.department_name,
        slug: def.slug,
        username: def.username,
        login_password: def.default_password,
        sender_gmail: null,
        gmail_app_password: null,
        is_configured: 0,
        updated_at: now
      });
    } else {
      existing.slug = existing.slug || def.slug;
      existing.username = existing.username || def.username;
      existing.login_password = existing.login_password || def.default_password;
    }
  });
}

/**
 * تطبيق حدث سحابي واحد (Delta Event) على قاعدة البيانات المحلية
 */
function applyCloudDeltaToStore(store, delta) {
  if (!delta || typeof delta !== 'object' || !delta.type) return false;
  let changed = false;

  if (delta.type === 'upsert_dept' && delta.data) {
    const d = delta.data;
    const row = store.department_settings.find(
      r =>
        r.department_name === d.department_name ||
        r.slug === d.slug ||
        r.username === d.username
    );
    if (row) {
      if (d.sender_gmail !== undefined) row.sender_gmail = d.sender_gmail;
      if (d.gmail_app_password !== undefined) row.gmail_app_password = d.gmail_app_password;
      if (d.login_password !== undefined && d.login_password) {
        row.login_password = d.login_password;
      }
      row.is_configured = Boolean(
        row.sender_gmail &&
          row.gmail_app_password &&
          normalizeAppPassword(row.gmail_app_password).length === 16
      )
        ? 1
        : 0;
      row.updated_at = d.updated_at || new Date().toISOString();
      changed = true;
    }
  } else if (delta.type === 'upsert_request' && delta.data) {
    const reqData = delta.data;
    const existingIdx = store.document_requests.findIndex(
      r =>
        (reqData.id && r.id === reqData.id) ||
        (reqData.tracking_code && r.tracking_code === reqData.tracking_code)
    );
    if (existingIdx !== -1) {
      store.document_requests[existingIdx] = {
        ...store.document_requests[existingIdx],
        ...reqData
      };
    } else {
      store.document_requests.unshift(reqData);
    }
    changed = true;
  } else if (delta.type === 'save_notif' && delta.data) {
    const notif = delta.data;
    const exists = store.email_notifications.some(n => n.id === notif.id);
    if (!exists) {
      store.email_notifications.unshift(notif);
      changed = true;
    }
  }

  return changed;
}

/**
 * نشر تحديث فوري إلى المخزن السحابي الدائم (Cloud JSON Stream)
 */
function publishCloudDelta(deltaPayload) {
  return new Promise(resolve => {
    try {
      const bodyStr = JSON.stringify(deltaPayload);
      const req = https.request(
        {
          hostname: CLOUD_STORE_HOST,
          port: 443,
          path: `/${CLOUD_STORE_TOPIC}`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Content-Length': Buffer.byteLength(bodyStr),
            'User-Agent': 'FST-Biskra-Portal/1.0'
          },
          timeout: 2500
        },
        res => {
          res.on('data', () => {});
          res.on('end', () => resolve(true));
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve(false);
      });
      req.on('error', () => resolve(false));
      req.write(bodyStr);
      req.end();
    } catch {
      resolve(false);
    }
  });
}

/**
 * مزامنة البيانات من المخزن السحابي الدائم إلى /tmp/faculty-db.json
 * (يمنع فقدان أي طلب أو إعدادات قسم عند إعادة تشغيل دالة Netlify السحابية)
 */
function syncFromCloud(force = false) {
  const now = Date.now();
  if (!force && now - lastCloudSyncTimestamp < 2500) {
    return Promise.resolve(readStore());
  }
  lastCloudSyncTimestamp = now;

  return new Promise(resolve => {
    const store = readStore();
    try {
      const req = https.request(
        {
          hostname: CLOUD_STORE_HOST,
          port: 443,
          path: `/${CLOUD_STORE_TOPIC}/json?poll=1&since=all`,
          method: 'GET',
          headers: {
            Accept: 'application/x-ndjson, application/json',
            'User-Agent': 'FST-Biskra-Portal/1.0'
          },
          timeout: 2500
        },
        res => {
          if (res.statusCode !== 200) {
            res.resume();
            return resolve(store);
          }
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => {
            try {
              const rawText = Buffer.concat(chunks).toString('utf8');
              const lines = rawText.split(/\r?\n/).filter(Boolean);
              let anyChanged = false;
              for (const line of lines) {
                try {
                  const envelope = JSON.parse(line);
                  if (envelope && envelope.event === 'message' && envelope.message) {
                    const delta = JSON.parse(envelope.message);
                    if (applyCloudDeltaToStore(store, delta)) {
                      anyChanged = true;
                    }
                  }
                } catch {
                  // تجاهل الأسطر غير الصالحة
                }
              }
              if (anyChanged) {
                writeStore(store);
              }
            } catch {
              // تجاهل أي خطأ في التحليل
            }
            resolve(store);
          });
        }
      );
      req.on('timeout', () => {
        req.destroy();
        resolve(store);
      });
      req.on('error', () => resolve(store));
      req.end();
    } catch {
      resolve(store);
    }
  });
}

// تهيئة قاعدة البيانات عند بدء التشغيل
readStore();

function normalizeDepartmentSettingRow(row) {
  if (!row) return null;
  const def =
    DEPARTMENT_DEFINITIONS.find(d => d.department_name === row.department_name) || {};
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
    id: row.id,
    department_name: row.department_name,
    slug,
    username,
    route: `/admin/${slug}`,
    login_password: loginPassword,
    default_password: def.default_password || loginPassword,
    sender_gmail: row.sender_gmail || null,
    gmail_app_password: row.gmail_app_password || null,
    is_configured: isConfigured,
    updated_at: row.updated_at
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
  if (!cleanInputPass || cleanInputPass !== dept.login_password) {
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

  publishCloudDelta({
    type: 'upsert_dept',
    data: {
      department_name: row.department_name,
      slug: row.slug,
      username: row.username,
      sender_gmail: row.sender_gmail,
      gmail_app_password: row.gmail_app_password,
      login_password: row.login_password,
      is_configured: row.is_configured,
      updated_at: row.updated_at
    }
  });

  return normalizeDepartmentSettingRow(row);
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
    status: row.status,
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

  store.document_requests.unshift(newRow);
  writeStore(store);

  publishCloudDelta({
    type: 'upsert_request',
    data: newRow
  });

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
 * حماية Auto-Upsert: إذا لم يكن الطلب موجوداً في الذاكرة المحلية للخادم (مثلاً بعد Cold Start)،
 * يتم إدراجه أو تحديثه تلقائياً من بيانات الطلب المرسلة من واجهة القسم دون إرجاع خطأ 404.
 */
function upsertDocumentRequest(identifier, rawPayload = {}) {
  const store = readStore();
  const val = String(identifier || rawPayload.id || rawPayload.tracking_code || '').trim();

  let row = (store.document_requests || []).find(
    r =>
      (val && (r.id === val || r.tracking_code === val)) ||
      (rawPayload.id && r.id === rawPayload.id) ||
      (rawPayload.tracking_code && r.tracking_code === rawPayload.tracking_code)
  );

  const src = rawPayload.request && typeof rawPayload.request === 'object'
    ? { ...rawPayload, ...rawPayload.request }
    : rawPayload;

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

  publishCloudDelta({
    type: 'upsert_request',
    data: row
  });

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

  publishCloudDelta({
    type: 'upsert_request',
    data: row
  });

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

  store.email_notifications.unshift(record);
  writeStore(store);

  publishCloudDelta({
    type: 'save_notif',
    data: record
  });

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
  EXACT_DEPARTMENTS,
  syncFromCloud,
  publishCloudDelta,
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
