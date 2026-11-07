/**
 * طبقة قاعدة البيانات المستمرة (Persistent SQLite Database)
 * تستخدم محرك node:sqlite المدمج لتنفيذ جدولي:
 * 1. document_requests
 * 2. department_settings (محمل مسبقاً بالأقسام الـ 5)
 */

const { DatabaseSync } = require('node:sqlite');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const {
  normalizeAppPassword,
  buildReadyEmailTemplate,
  buildRejectedEmailTemplate
} = require('../services/emailService');

function resolveWritableDbPath() {
  const isServerless = Boolean(
    process.env.NETLIFY ||
      process.env.AWS_LAMBDA_FUNCTION_NAME ||
      process.env.LAMBDA_TASK_ROOT
  );

  if (isServerless) {
    return path.join(os.tmpdir(), 'portal.sqlite');
  }

  const localDataDir = path.join(__dirname, '..', 'data');
  try {
    fs.mkdirSync(localDataDir, { recursive: true });
    return path.join(localDataDir, 'portal.sqlite');
  } catch {
    return path.join(os.tmpdir(), 'portal.sqlite');
  }
}

const DB_PATH = resolveWritableDbPath();
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

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

const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA journal_mode = WAL;');

// تنفيذ مخطط الجداول والفهارس من ملف schema.sql
const schemaSql = fs.readFileSync(SCHEMA_PATH, 'utf8');
db.exec(schemaSql);

// ضمان توافق الجداول إذا كانت منشأة من إصدار سابق
try {
  db.exec('ALTER TABLE email_notifications ADD COLUMN sender_gmail TEXT NULL;');
} catch {
  // العمود موجود مسبقاً
}
try {
  db.exec('ALTER TABLE department_settings ADD COLUMN slug TEXT NULL;');
} catch {
  // العمود موجود مسبقاً
}
try {
  db.exec('ALTER TABLE department_settings ADD COLUMN username TEXT NULL;');
} catch {
  // العمود موجود مسبقاً
}
try {
  db.exec('ALTER TABLE department_settings ADD COLUMN login_password TEXT NULL;');
} catch {
  // العمود موجود مسبقاً
}

/**
 * بذر جدول department_settings بالأقسام الـ 5 حصراً وبيانات الدخول الافتراضية
 */
function seedDepartmentSettings() {
  const checkStmt = db.prepare(
    'SELECT * FROM department_settings WHERE department_name = ? LIMIT 1'
  );
  const insertStmt = db.prepare(`
    INSERT INTO department_settings (
      id, department_name, slug, username, login_password,
      sender_gmail, gmail_app_password, is_configured, updated_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, 0, ?)
  `);
  const backfillStmt = db.prepare(`
    UPDATE department_settings
    SET slug = COALESCE(slug, ?),
        username = COALESCE(username, ?),
        login_password = COALESCE(NULLIF(login_password, ''), ?)
    WHERE department_name = ?
  `);

  const now = new Date().toISOString();
  DEPARTMENT_DEFINITIONS.forEach(def => {
    const existing = checkStmt.get(def.department_name);
    if (!existing) {
      insertStmt.run(
        def.id,
        def.department_name,
        def.slug,
        def.username,
        def.default_password,
        now
      );
    } else {
      backfillStmt.run(def.slug, def.username, def.default_password, def.department_name);
    }
  });
}

seedDepartmentSettings();

/**
 * توحيد كائن إعدادات القسم المُرجع من قاعدة البيانات
 */
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

/**
 * استرجاع إعدادات جميع الأقسام الـ 5
 */
function getAllDepartmentSettings() {
  const rows = db.prepare('SELECT * FROM department_settings').all();
  const mapByName = new Map(rows.map(r => [r.department_name, normalizeDepartmentSettingRow(r)]));
  return EXACT_DEPARTMENTS.map(deptName => mapByName.get(deptName)).filter(Boolean);
}

/**
 * استرجاع إعدادات قسم محدد بالاسم أو المعرف (slug / username / department_name)
 */
function getDepartmentSettings(identifier) {
  const val = String(identifier || '').trim();
  const row = db
    .prepare(
      'SELECT * FROM department_settings WHERE department_name = ? OR LOWER(slug) = LOWER(?) OR LOWER(username) = LOWER(?) LIMIT 1'
    )
    .get(val, val, val);
  return normalizeDepartmentSettingRow(row);
}

/**
 * التحقق من بيانات تسجيل الدخول للقسم (اسم المستخدم/القسم + كلمة المرور)
 */
function verifyDepartmentCredentials(identifier, password) {
  const dept = getDepartmentSettings(identifier);
  if (!dept) return null;
  const cleanInputPass = String(password || '').trim();
  if (!cleanInputPass || cleanInputPass !== dept.login_password) {
    return null;
  }
  return dept;
}

/**
 * حفظ وتحديث إعدادات القسم (البريد الإلكتروني + رمز تطبيق جوجل + كلمة مرور الدخول)
 */
function updateDepartmentSettings(
  identifier,
  { sender_gmail, gmail_app_password, login_password }
) {
  const existing = getDepartmentSettings(identifier);
  if (!existing) {
    throw new Error('القسم المحدد غير موجود في جدول department_settings.');
  }

  const nextEmail =
    sender_gmail !== undefined
      ? String(sender_gmail || '').trim().toLowerCase() || null
      : existing.sender_gmail;
  const nextAppPass =
    gmail_app_password !== undefined
      ? normalizeAppPassword(gmail_app_password) || null
      : existing.gmail_app_password;
  const nextLoginPass =
    login_password !== undefined && String(login_password).trim() !== ''
      ? String(login_password).trim()
      : existing.login_password;

  const isConfigured = Boolean(nextEmail && nextAppPass && nextAppPass.length === 16) ? 1 : 0;
  const updatedAt = new Date().toISOString();

  db.prepare(`
    UPDATE department_settings
    SET sender_gmail = ?,
        gmail_app_password = ?,
        login_password = ?,
        is_configured = ?,
        updated_at = ?
    WHERE department_name = ?
  `).run(nextEmail, nextAppPass, nextLoginPass, isConfigured, updatedAt, existing.department_name);

  return getDepartmentSettings(existing.department_name);
}

/**
 * توليد كود تتبع قصير وفريد بصيغة REQ-XXXX
 */
function generateUniqueTrackingCode() {
  const checkStmt = db.prepare('SELECT 1 FROM document_requests WHERE tracking_code = ?');
  for (let attempt = 0; attempt < 25; attempt++) {
    const code = `REQ-${Math.floor(1000 + Math.random() * 9000)}`;
    const exists = checkStmt.get(code);
    if (!exists) return code;
  }
  return `REQ-${Date.now().toString().slice(-5)}`;
}

/**
 * توحيد كائن الطلب المُرجع من قاعدة البيانات
 */
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

    // مرادفات متوافقة مع الواجهة الأمامية
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

/**
 * بذر البيانات الأولية في جدول document_requests إذا كان فارغاً
 */
function seedInitialDataIfEmpty() {
  const countRow = db.prepare('SELECT COUNT(*) AS count FROM document_requests').get();
  if (countRow && countRow.count > 0) return;

  const initialRows = [
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

  const insertStmt = db.prepare(`
    INSERT INTO document_requests (
      id, tracking_code, first_name, last_name, student_card_number,
      email, department, bac_year, document_type,
      degree_level, requested_year, academic_year,
      status, rejection_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertNotifStmt = db.prepare(`
    INSERT INTO email_notifications (
      id, request_id, tracking_code, sender_gmail, recipient_email, student_name,
      document_type, department, notification_type,
      subject, html_body, text_body, delivery_status, provider, sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const r of initialRows) {
    insertStmt.run(
      r.id,
      r.tracking_code,
      r.first_name,
      r.last_name,
      r.student_card_number,
      r.email,
      r.department,
      r.bac_year,
      r.document_type,
      r.degree_level,
      r.requested_year,
      r.academic_year,
      r.status,
      r.rejection_reason,
      r.created_at
    );

    if (r.status === 'ready' || r.status === 'rejected') {
      const tpl =
        r.status === 'ready' ? buildReadyEmailTemplate(r) : buildRejectedEmailTemplate(r);
      insertNotifStmt.run(
        crypto.randomUUID(),
        r.id,
        r.tracking_code,
        'pedagogy.dept@gmail.com',
        r.email,
        `${r.first_name} ${r.last_name}`,
        r.document_type,
        r.department,
        r.status,
        tpl.subject,
        tpl.htmlBody,
        tpl.textBody,
        'sent',
        'nodemailer-gmail-smtp',
        r.created_at
      );
    }
  }
}

seedInitialDataIfEmpty();

/**
 * استرجاع الطلبات مع الفلترة
 */
function getAllRequests(filters = {}) {
  const { department, studentCardNumber, search, status } = filters;
  const conditions = [];
  const params = [];

  if (department && department !== 'all') {
    conditions.push('department = ?');
    params.push(department);
  }

  if (studentCardNumber) {
    const val = String(studentCardNumber).trim();
    conditions.push(
      '(LOWER(student_card_number) = LOWER(?) OR LOWER(tracking_code) = LOWER(?) OR LOWER(id) = LOWER(?))'
    );
    params.push(val, val, val);
  }

  if (status && status !== 'all') {
    conditions.push('status = ?');
    params.push(status);
  }

  if (search) {
    const q = `%${String(search).trim()}%`;
    conditions.push(
      "(student_card_number LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR (first_name || ' ' || last_name) LIKE ? OR tracking_code LIKE ?)"
    );
    params.push(q, q, q, q, q);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const sql = `SELECT * FROM document_requests ${whereClause} ORDER BY datetime(created_at) DESC`;

  const rows = db.prepare(sql).all(...params);
  return rows.map(normalizeRequestRow);
}

/**
 * التحقق من وجود طلب نشط (pending) لنفس الرقم التسلسلي ونفس نوع الوثيقة
 */
function findActivePendingDuplicate(studentCardNumber, documentType) {
  const stmt = db.prepare(`
    SELECT * FROM document_requests
    WHERE LOWER(student_card_number) = LOWER(?)
      AND document_type = ?
      AND status = 'pending'
    LIMIT 1
  `);
  const row = stmt.get(String(studentCardNumber).trim(), String(documentType).trim());
  return normalizeRequestRow(row);
}

/**
 * إنشاء طلب وثيقة جديد في جدول document_requests
 */
function createDocumentRequest(payload) {
  const id = crypto.randomUUID();
  const trackingCode = generateUniqueTrackingCode();
  const createdAt = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO document_requests (
      id, tracking_code, first_name, last_name, student_card_number,
      email, department, bac_year, document_type,
      degree_level, requested_year, academic_year,
      status, rejection_reason, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', NULL, ?)
  `);

  stmt.run(
    id,
    trackingCode,
    payload.first_name,
    payload.last_name,
    payload.student_card_number,
    payload.email,
    payload.department,
    payload.bac_year,
    payload.document_type,
    payload.degree_level ?? null,
    payload.requested_year ?? null,
    payload.academic_year ?? null,
    createdAt
  );

  const inserted = db.prepare('SELECT * FROM document_requests WHERE id = ?').get(id);
  return normalizeRequestRow(inserted);
}

/**
 * البحث عن طلب بواسطة UUID أو tracking_code
 */
function getRequestByIdOrTracking(identifier) {
  const stmt = db.prepare(`
    SELECT * FROM document_requests
    WHERE id = ? OR tracking_code = ?
    LIMIT 1
  `);
  const row = stmt.get(identifier, identifier);
  return normalizeRequestRow(row);
}

/**
 * تحديث حالة الطلب (ready أو rejected أو pending)
 */
function updateRequestStatus(identifier, { status, rejectionReason = null }) {
  const existing = getRequestByIdOrTracking(identifier);
  if (!existing) return null;

  const cleanReason = status === 'rejected' ? String(rejectionReason || '').trim() : null;

  db.prepare(`
    UPDATE document_requests
    SET status = ?, rejection_reason = ?
    WHERE id = ?
  `).run(status, cleanReason, existing.id);

  return getRequestByIdOrTracking(existing.id);
}

/**
 * حفظ إشعار البريد الإلكتروني في جدول email_notifications
 */
function saveEmailNotification(notif) {
  db.prepare(`
    INSERT INTO email_notifications (
      id, request_id, tracking_code, sender_gmail, recipient_email, student_name,
      document_type, department, notification_type,
      subject, html_body, text_body, delivery_status, provider, sent_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    notif.id,
    notif.request_id ?? null,
    notif.tracking_code ?? null,
    notif.sender_gmail ?? null,
    notif.recipient_email,
    notif.student_name,
    notif.document_type,
    notif.department,
    notif.notification_type,
    notif.subject,
    notif.html_body,
    notif.text_body,
    notif.delivery_status,
    notif.provider,
    notif.sent_at
  );
  return notif;
}

/**
 * استرجاع سجل الإشعارات البريدية المرسلة
 */
function getAllNotifications() {
  const rows = db
    .prepare('SELECT * FROM email_notifications ORDER BY datetime(sent_at) DESC')
    .all();

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
  db,
  DEPARTMENT_DEFINITIONS,
  getAllRequests,
  findActivePendingDuplicate,
  createDocumentRequest,
  getRequestByIdOrTracking,
  updateRequestStatus,
  saveEmailNotification,
  getAllNotifications,
  getAllDepartmentSettings,
  getDepartmentSettings,
  updateDepartmentSettings,
  verifyDepartmentCredentials
};
