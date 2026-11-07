const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const {
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
} = require('./db/database');

const SESSION_SECRET = 'uni-pedagogical-portal-hmac-secret-2026';

function createSignedSessionToken(sessionPayload) {
  const data = Buffer.from(JSON.stringify(sessionPayload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(data).digest('base64url');
  return `${data}.${sig}`;
}

function verifySignedSessionToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    return JSON.parse(Buffer.from(data, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || '';
  const out = {};
  header.split(';').forEach(pair => {
    const idx = pair.indexOf('=');
    if (idx > 0) {
      const k = pair.slice(0, idx).trim();
      const v = pair.slice(idx + 1).trim();
      out[k] = decodeURIComponent(v);
    }
  });
  return out;
}

function getAuthenticatedDepartmentSession(req) {
  const cookies = parseCookies(req);
  const token = cookies.dept_session || '';
  return verifySignedSessionToken(token);
}

const {
  normalizeAppPassword,
  dispatchAutomatedStudentEmail,
  sendDepartmentTestEmail
} = require('./services/emailService');

const DEFAULT_PORT = Number(process.env.PORT) || 3001;
const DIST_DIR = path.join(__dirname, 'dist');
const BUILD_DIR = path.join(__dirname, 'build');
const PUBLIC_DIR = path.join(__dirname, 'public');

/**
 * تحديد مجلد الواجهة الأمامية (يخدم مجلد البناء dist أو build في بيئة الإنتاج،
 * أو مجلد public كخيار أساسي/بديل)
 */
function getStaticRootDir() {
  if (
    process.env.NODE_ENV === 'production' &&
    fs.existsSync(path.join(DIST_DIR, 'index.html'))
  ) {
    return DIST_DIR;
  }
  if (
    process.env.NODE_ENV === 'production' &&
    fs.existsSync(path.join(BUILD_DIR, 'index.html'))
  ) {
    return BUILD_DIR;
  }
  if (fs.existsSync(path.join(PUBLIC_DIR, 'index.html'))) {
    return PUBLIC_DIR;
  }
  if (fs.existsSync(path.join(DIST_DIR, 'index.html'))) {
    return DIST_DIR;
  }
  return PUBLIC_DIR;
}

const ALLOWED_DEPARTMENTS = [
  'قسم الآلية والإلكترونيك',
  'قسم الهندسة الكهربائية',
  'قسم جذع مشترك (خاص بالسنة الأولى)',
  'قسم هندسة الطرائق',
  'قسم الميكانيك'
];

const ALLOWED_DOCUMENT_TYPES = [
  'شهادة مدرسية',
  'كشف النقاط',
  'شهادة الترتيب',
  'شهادة حسن سيرة وسلوك'
];

const ALLOWED_DEGREE_LEVELS = ['ليسانس', 'ماستر'];

const ALLOWED_REQUESTED_YEARS = [
  'سنة أولى ليسانس',
  'سنة ثانية ليسانس',
  'سنة ثالثة ليسانس',
  'سنة أولى ماستر',
  'سنة ثانية ماستر'
];

function sendJson(res, statusCode, payload) {
  const enrichedPayload = {
    success: statusCode >= 200 && statusCode < 300,
    ok: statusCode >= 200 && statusCode < 300,
    ...payload
  };
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept'
  });
  res.end(JSON.stringify(enrichedPayload));
}

function parseBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      const str = req.body.toString('utf8');
      if (!str) return Promise.resolve({});
      try {
        return Promise.resolve(JSON.parse(str));
      } catch {
        return Promise.reject(new Error('تنسيق البيانات المرسلة (JSON) غير صالح.'));
      }
    }
    if (typeof req.body === 'string') {
      if (!req.body) return Promise.resolve({});
      try {
        return Promise.resolve(JSON.parse(req.body));
      } catch {
        return Promise.reject(new Error('تنسيق البيانات المرسلة (JSON) غير صالح.'));
      }
    }
    if (typeof req.body === 'object') {
      return Promise.resolve(req.body);
    }
  }

  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalLen = 0;
    req.on('data', chunk => {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
      totalLen += buf.length;
      if (totalLen > 1e6) {
        req.destroy();
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error('تنسيق البيانات المرسلة (JSON) غير صالح.'));
      }
    });
    req.on('error', reject);
  });
}

/**
 * توحيد مسار الطلب لدعم كل من التشغيل المحلي ودالة Netlify السحابية (/.netlify/functions/api)
 */
function normalizeIncomingPathname(rawPathname) {
  let clean = (rawPathname || '/').replace(/\/+$/, '') || '/';

  if (clean.startsWith('/.netlify/functions/api')) {
    clean = clean.slice('/.netlify/functions/api'.length) || '/';
  }

  const knownApiSubroots = [
    '/health',
    '/auth',
    '/requests',
    '/department-settings',
    '/settings',
    '/send-email',
    '/test-email',
    '/notifications'
  ];

  if (
    !clean.startsWith('/api') &&
    !clean.startsWith('/admin') &&
    knownApiSubroots.some(sub => clean === sub || clean.startsWith(`${sub}/`))
  ) {
    clean = `/api${clean}`;
  }

  return clean;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const app = async (req, res) => {
  const parsedUrl = new URL(req.url || '/', 'http://localhost');
  const pathname = normalizeIncomingPathname(parsedUrl.pathname);

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Accept'
    });
    return res.end();
  }

  // =========================================================================
  // فحص جاهزية الخادم لبيئة الإنتاج (Render / Railway Health Check)
  // =========================================================================
  if (pathname === '/api/health' && req.method === 'GET') {
    return sendJson(res, 200, {
      ok: true,
      success: true,
      status: 'healthy',
      port: DEFAULT_PORT
    });
  }

  // =========================================================================
  // 0. مصادقة الأقسام (Department Login / Session / Logout)
  // =========================================================================
  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const identifier = String(body.identifier || body.username || body.department || '').trim();
      const password = String(body.password || '').trim();

      if (!identifier || !password) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: 'يرجى إدخال اسم المستخدم للقسم وكلمة المرور.'
        });
      }

      const verifiedDept = verifyDepartmentCredentials(identifier, password);
      if (!verifiedDept) {
        return sendJson(res, 401, {
          ok: false,
          success: false,
          message: 'اسم المستخدم أو كلمة المرور غير صحيحة.'
        });
      }

      const sessionPayload = {
        slug: verifiedDept.slug,
        username: verifiedDept.username,
        department_name: verifiedDept.department_name,
        redirect_url: `/admin/${verifiedDept.slug}`,
        logged_in_at: new Date().toISOString()
      };

      const signedToken = createSignedSessionToken(sessionPayload);

      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-store',
        'Set-Cookie': `dept_session=${encodeURIComponent(signedToken)}; Path=/; SameSite=Lax; HttpOnly; Max-Age=86400`,
        'Access-Control-Allow-Origin': '*'
      });
      return res.end(
        JSON.stringify({
          ok: true,
          success: true,
          message: `تم تسجيل الدخول بنجاح في (${verifiedDept.department_name}).`,
          session: sessionPayload
        })
      );
    } catch (err) {
      return sendJson(res, 400, {
        ok: false,
        success: false,
        message: err.message || 'تعذر تسجيل الدخول.'
      });
    }
  }

  if (pathname === '/api/auth/session' && req.method === 'GET') {
    const session = getAuthenticatedDepartmentSession(req);
    return sendJson(res, 200, {
      ok: true,
      success: true,
      authenticated: Boolean(session && session.slug),
      session: session || null
    });
  }

  if (pathname === '/api/auth/logout' && (req.method === 'POST' || req.method === 'GET')) {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': 'dept_session=; Path=/; SameSite=Lax; HttpOnly; Max-Age=0',
      'Access-Control-Allow-Origin': '*'
    });
    return res.end(
      JSON.stringify({
        ok: true,
        success: true,
        message: 'تم تسجيل الخروج بنجاح.'
      })
    );
  }

  // =========================================================================
  // 1. GET /api/department-settings (أو /api/settings)
  // =========================================================================
  if (
    (pathname === '/api/department-settings' || pathname === '/api/settings') &&
    req.method === 'GET'
  ) {
    try {
      const deptParam = parsedUrl.searchParams.get('department');
      if (deptParam) {
        const setting = getDepartmentSettings(deptParam);
        return sendJson(res, 200, { ok: true, success: true, setting });
      }
      const settings = getAllDepartmentSettings();
      return sendJson(res, 200, { ok: true, success: true, settings });
    } catch (err) {
      return sendJson(res, 500, { ok: false, success: false, message: err.message });
    }
  }

  // =========================================================================
  // 2. PUT / POST /api/department-settings (أو /api/settings) — حفظ الإعدادات
  // =========================================================================
  if (
    (pathname === '/api/department-settings' || pathname === '/api/settings') &&
    (req.method === 'PUT' || req.method === 'POST' || req.method === 'PATCH')
  ) {
    try {
      const body = await parseBody(req);
      const department_name = String(body.department_name || body.department || '').trim();
      const sender_gmail = String(body.sender_gmail || '').trim().toLowerCase();
      // إزالة أي مسافات من رمز تطبيق جوجل المكون من 16 حرفاً
      const gmail_app_password = normalizeAppPassword(body.gmail_app_password || '');
      const login_password =
        body.login_password !== undefined ? String(body.login_password || '').trim() : undefined;

      const existingDept = getDepartmentSettings(department_name);
      if (!existingDept) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: 'يرجى اختيار قسم صحيح من الأقسام الخمسة.'
        });
      }

      const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
      if (sender_gmail && !gmailRegex.test(sender_gmail)) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: 'يرجى إدخال عنوان بريد إلكتروني صحيح للقسم ينتهي بـ @gmail.com.'
        });
      }

      if (gmail_app_password && gmail_app_password.length !== 16) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: `يرجى إدخال رمز تطبيق جوجل (App Password) المكون من 16 حرفاً بالضبط بعد إزالة المسافات (الحالي: ${gmail_app_password.length} حرفاً).`
        });
      }

      if ((sender_gmail && !gmail_app_password) || (!sender_gmail && gmail_app_password)) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: 'لإعداد البريد الإلكتروني للقسم يرجى إدخال كل من عنوان Gmail ورمز التطبيق المكون من 16 حرفاً معاً.'
        });
      }

      if (login_password !== undefined && login_password.length < 4) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: 'كلمة مرور تسجيل الدخول للقسم يجب أن تتكون من 4 أحرف أو أرقام على الأقل.'
        });
      }

      const updated = updateDepartmentSettings(existingDept.department_name, {
        sender_gmail,
        gmail_app_password,
        login_password
      });

      return sendJson(res, 200, {
        ok: true,
        success: true,
        message: `تم حفظ إعدادات الحساب والبريد لـ (${existingDept.department_name}) بنجاح!`,
        setting: updated,
        settings: getAllDepartmentSettings()
      });
    } catch (err) {
      return sendJson(res, 400, {
        ok: false,
        success: false,
        message: err.message || 'تعذر حفظ إعدادات القسم.'
      });
    }
  }

  // =========================================================================
  // 3. POST /api/department-settings/test-email (أو /api/test-email)
  // =========================================================================
  if (
    (pathname === '/api/department-settings/test-email' || pathname === '/api/test-email') &&
    req.method === 'POST'
  ) {
    try {
      const body = await parseBody(req);
      const department_name = String(body.department_name || body.department || '').trim();
      const sender_gmail = String(body.sender_gmail || '').trim().toLowerCase();
      // إزالة كافة المسافات قبل المصادقة مع Nodemailer
      const gmail_app_password = normalizeAppPassword(body.gmail_app_password || '');

      if (!ALLOWED_DEPARTMENTS.includes(department_name)) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: 'يرجى تحديد القسم أولاً.'
        });
      }

      const testNotification = await sendDepartmentTestEmail({
        department_name,
        sender_gmail,
        gmail_app_password
      });

      // حفظ الإعدادات المعتمدة وتسجيل رسالة الاختبار
      const updated = updateDepartmentSettings(department_name, {
        sender_gmail,
        gmail_app_password
      });
      saveEmailNotification(testNotification);

      return sendJson(res, 200, {
        ok: true,
        success: true,
        message: `تم الربط بنجاح! تم إرسال رسالة تجريبية إلى (${sender_gmail}) عبر smtp.gmail.com:465.`,
        setting: updated,
        settings: getAllDepartmentSettings(),
        notification: testNotification
      });
    } catch (err) {
      return sendJson(res, 400, {
        ok: false,
        success: false,
        code: err.code || 'SMTP_TEST_FAILED',
        message: err.message || 'فشل إرسال الرسالة التجريبية، يرجى التحقق من رمز التطبيق.'
      });
    }
  }

  // =========================================================================
  // 4. POST /api/send-email — نقطة نهاية مباشرة لإرسال إشعار لطالب محدد
  // =========================================================================
  if (pathname === '/api/send-email' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const requestId = body.request_id || body.requestId || body.id;
      const statusType = body.status || 'ready';
      const targetRequest = getRequestByIdOrTracking(requestId);
      if (!targetRequest) {
        return sendJson(res, 404, {
          ok: false,
          success: false,
          message: 'الطلب غير موجود في قاعدة البيانات.'
        });
      }

      const deptSettings = getDepartmentSettings(targetRequest.department);
      if (
        !deptSettings ||
        !deptSettings.is_configured ||
        !deptSettings.sender_gmail ||
        !deptSettings.gmail_app_password
      ) {
        return sendJson(res, 428, {
          ok: false,
          success: false,
          code: 'DEPARTMENT_EMAIL_NOT_CONFIGURED',
          department: targetRequest.department,
          message:
            'يرجى إدخال البريد الإلكتروني للقسم ورمز التطبيق في خانة الإعدادات أولاً قبل إرسال الإشعارات'
        });
      }

      const sentNotif = await dispatchAutomatedStudentEmail(
        targetRequest,
        statusType,
        deptSettings
      );
      saveEmailNotification(sentNotif);

      return sendJson(res, 200, {
        ok: true,
        success: true,
        message: `تم إرسال البريد الإلكتروني إلى (${targetRequest.email}) بنجاح.`,
        notification: sentNotif
      });
    } catch (err) {
      return sendJson(res, 400, {
        ok: false,
        success: false,
        message: err.message || 'تعذر إرسال البريد الإلكتروني.'
      });
    }
  }

  // =========================================================================
  // 5. GET /api/requests — استرجاع الطلبات من جدول document_requests
  // =========================================================================
  if (pathname === '/api/requests' && req.method === 'GET') {
    try {
      const department = parsedUrl.searchParams.get('department');
      const studentCardNumber =
        parsedUrl.searchParams.get('student_card_number') ||
        parsedUrl.searchParams.get('studentCardNumber');
      const search = parsedUrl.searchParams.get('search');
      const status = parsedUrl.searchParams.get('status');

      const requests = getAllRequests({ department, studentCardNumber, search, status });
      return sendJson(res, 200, { ok: true, success: true, requests });
    } catch (err) {
      return sendJson(res, 500, {
        ok: false,
        success: false,
        message: err.message || 'خطأ في قاعدة البيانات.'
      });
    }
  }

  // =========================================================================
  // 6. POST /api/requests — إنشاء طلب جديد + منع تكرار الطلبات قيد المعالجة
  // =========================================================================
  if (pathname === '/api/requests' && req.method === 'POST') {
    try {
      const body = await parseBody(req);

      const first_name = String(body.first_name ?? body.firstName ?? '').trim();
      const last_name = String(body.last_name ?? body.lastName ?? '').trim();
      const student_card_number = String(
        body.student_card_number ?? body.studentCardNumber ?? ''
      ).trim();
      const email = String(body.email ?? '').trim().toLowerCase();
      const department = String(body.department ?? '').trim();
      const bac_year = String(body.bac_year ?? body.bacYear ?? '').trim();
      const document_type = String(body.document_type ?? body.documentType ?? '').trim();

      const rawDegreeLevel =
        body.degree_level ?? body.degreeLevel ?? body.conditionalDetails?.cycle ?? null;
      const rawRequestedYear =
        body.requested_year ?? body.requestedYear ?? body.conditionalDetails?.targetYear ?? null;
      const rawAcademicYear =
        body.academic_year ?? body.academicYear ?? body.conditionalDetails?.academicYear ?? null;

      if (
        !first_name ||
        !last_name ||
        !student_card_number ||
        !email ||
        !department ||
        !bac_year ||
        !document_type
      ) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: 'يرجى ملء جميع الحقول الإجبارية في الاستمارة.'
        });
      }

      const gmailRegex = /^[a-zA-Z0-9._%+-]+@gmail\.com$/i;
      if (!gmailRegex.test(email)) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: 'يرجى إدخال بريد إلكتروني صحيح بصيغة Gmail (ينتهي بـ @gmail.com).'
        });
      }

      if (!ALLOWED_DEPARTMENTS.includes(department)) {
        return sendJson(res, 400, { ok: false, success: false, message: 'القسم المختار غير صالح.' });
      }

      const bacYearNum = Number(bac_year);
      if (isNaN(bacYearNum) || bacYearNum < 2014 || bacYearNum > 2026) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: 'عام البكالوريا يجب أن يكون بين 2014 و 2026.'
        });
      }

      if (!ALLOWED_DOCUMENT_TYPES.includes(document_type)) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: 'نوع الوثيقة المختار غير صالح.'
        });
      }

      let degree_level = null;
      let requested_year = null;
      let academic_year = null;

      if (document_type === 'شهادة الترتيب') {
        degree_level = String(rawDegreeLevel || '').trim();
        if (!ALLOWED_DEGREE_LEVELS.includes(degree_level)) {
          return sendJson(res, 400, {
            ok: false,
            success: false,
            message: 'يرجى تحديد الطور (ليسانس أو ماستر) لشهادة الترتيب.'
          });
        }
      } else if (document_type === 'كشف النقاط') {
        requested_year = String(rawRequestedYear || '').trim();
        academic_year = String(rawAcademicYear || '').trim();
        if (!ALLOWED_REQUESTED_YEARS.includes(requested_year)) {
          return sendJson(res, 400, {
            ok: false,
            success: false,
            message: 'يرجى تحديد السنة المطلوبة لكشف النقاط.'
          });
        }
        if (!academic_year) {
          return sendJson(res, 400, {
            ok: false,
            success: false,
            message: 'يرجى إدخال العام الدراسي لتلك السنة (مثال: 2024/2025).'
          });
        }
      }

      const existingPending = findActivePendingDuplicate(student_card_number, document_type);
      if (existingPending) {
        return sendJson(res, 409, {
          ok: false,
          success: false,
          code: 'DUPLICATE_PENDING_REQUEST',
          existingRequest: existingPending,
          message: `عذراً الطالب(ة) الكريم(ة)، لديكم بالفعل طلب نشط "قيد المعالجة" لاستخراج وثيقة (${document_type}) مسجل بنفس رقم بطاقة الطالب (${student_card_number}). يرجى انتظار استلام إشعار الجاهزية عبر بريدكم الإلكتروني (Gmail).`
        });
      }

      const createdRequest = createDocumentRequest({
        first_name,
        last_name,
        student_card_number,
        email,
        department,
        bac_year: String(bacYearNum),
        document_type,
        degree_level,
        requested_year,
        academic_year
      });

      return sendJson(res, 201, {
        ok: true,
        success: true,
        message: 'تم إرسال طلب الوثيقة بنجاح وهو الآن قيد المعالجة.',
        request: createdRequest
      });
    } catch (err) {
      if (String(err.message).includes('UNIQUE constraint failed')) {
        return sendJson(res, 409, {
          ok: false,
          success: false,
          code: 'DUPLICATE_PENDING_REQUEST',
          message:
            'عذراً الطالب(ة) الكريم(ة)، لديكم بالفعل طلب نشط قيد المعالجة لنفس الوثيقة ونفس رقم بطاقة الطالب. يرجى متابعة حالة طلبكم الحالي.'
        });
      }
      return sendJson(res, 400, {
        ok: false,
        success: false,
        message: err.message || 'خطأ في معالجة الطلب.'
      });
    }
  }

  // =========================================================================
  // 7. PATCH / POST /api/requests/:id/status — تحديث الحالة + إرسال Gmail
  // =========================================================================
  const statusMatch = pathname.match(/^\/api\/requests\/([^/]+)\/status$/);
  if (statusMatch && (req.method === 'PATCH' || req.method === 'POST' || req.method === 'PUT')) {
    try {
      const requestIdOrCode = decodeURIComponent(statusMatch[1]);
      const body = await parseBody(req);
      const status = body.status;
      const rejectionReason = body.rejection_reason ?? body.rejectionReason ?? '';

      if (!['ready', 'rejected', 'pending'].includes(status)) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: 'حالة الطلب غير صالحة.'
        });
      }

      if (status === 'rejected' && !String(rejectionReason || '').trim()) {
        return sendJson(res, 400, {
          ok: false,
          success: false,
          message: 'يرجى كتابة سبب رفض الطلب.'
        });
      }

      const targetRequest = getRequestByIdOrTracking(requestIdOrCode);
      if (!targetRequest) {
        return sendJson(res, 404, {
          ok: false,
          success: false,
          message: 'الطلب غير موجود في قاعدة البيانات.'
        });
      }

      // التحقق من إعدادات البريد الإلكتروني للقسم في جدول department_settings
      const deptSettings = getDepartmentSettings(targetRequest.department);
      if (
        (status === 'ready' || status === 'rejected') &&
        (!deptSettings ||
          !deptSettings.is_configured ||
          !deptSettings.sender_gmail ||
          !deptSettings.gmail_app_password)
      ) {
        return sendJson(res, 428, {
          ok: false,
          success: false,
          code: 'DEPARTMENT_EMAIL_NOT_CONFIGURED',
          department: targetRequest.department,
          message:
            'يرجى إدخال البريد الإلكتروني للقسم ورمز التطبيق في خانة الإعدادات أولاً قبل إرسال الإشعارات'
        });
      }

      // إرسال البريد الإلكتروني أولاً عبر Nodemailer (smtp.gmail.com:465) قبل اعتماد الحالة
      const candidateRequest = {
        ...targetRequest,
        status,
        rejection_reason: status === 'rejected' ? String(rejectionReason).trim() : null
      };

      let notification = null;
      if (status === 'ready' || status === 'rejected') {
        const sentNotif = await dispatchAutomatedStudentEmail(
          candidateRequest,
          status,
          deptSettings
        );
        saveEmailNotification(sentNotif);
        notification = {
          ...sentNotif,
          requestId: sentNotif.request_id,
          trackingCode: sentNotif.tracking_code,
          senderGmail: sentNotif.sender_gmail,
          to: sentNotif.recipient_email,
          studentName: sentNotif.student_name,
          documentType: sentNotif.document_type,
          notificationType: sentNotif.notification_type,
          htmlBody: sentNotif.html_body,
          textBody: sentNotif.text_body,
          sentAt: sentNotif.sent_at
        };
      }

      const updatedRequest = updateRequestStatus(requestIdOrCode, {
        status,
        rejectionReason: status === 'rejected' ? String(rejectionReason).trim() : null
      });

      return sendJson(res, 200, {
        ok: true,
        success: true,
        request: updatedRequest,
        notification
      });
    } catch (err) {
      return sendJson(res, 400, {
        ok: false,
        success: false,
        message: err.message || 'تعذر تحديث حالة الطلب.'
      });
    }
  }

  // =========================================================================
  // 8. GET /api/notifications — سجل رسائل البريد الإلكتروني HTML المرسلة
  // =========================================================================
  if (pathname === '/api/notifications' && req.method === 'GET') {
    try {
      const department = parsedUrl.searchParams.get('department');
      let notifications = getAllNotifications();
      if (department && department !== 'all') {
        notifications = notifications.filter(n => n.department === department);
      }
      return sendJson(res, 200, { ok: true, success: true, notifications });
    } catch (err) {
      return sendJson(res, 500, { ok: false, success: false, message: err.message });
    }
  }

  // =========================================================================
  // ضمان عدم إرجاع HTML لأي مسار يبدأ بـ /api/ إطلاقاً
  // =========================================================================
  if (pathname.startsWith('/api/')) {
    return sendJson(res, 404, {
      ok: false,
      success: false,
      message: `مسار API غير موجود: ${req.method} ${pathname}`
    });
  }

  // =========================================================================
  // المسارات المستقلة والمحمية للواجهات (Gateway, Student, Login, & Protected Dept Routes):
  //  - /                    -> الصفحة الرئيسية للبوابة (بطاقتا بوابة الطالب وبوابة الإدارة) (public/index.html)
  //  - /student             -> واجهة استمارة الطالب المعزولة (public/student.html)
  //  - /login               -> صفحة تسجيل دخول الأقسام الخمسة (public/login.html)
  //  - /admin/[dept]        -> لوحة تحكم القسم المحمية والحصرية (public/department.html)
  // =========================================================================
  const STANDALONE_DEPARTMENT_ROUTES = {
    '/admin/automatique': { slug: 'automatique', name: 'قسم الآلية والإلكترونيك' },
    '/admin/electrique': { slug: 'electrique', name: 'قسم الهندسة الكهربائية' },
    '/admin/tronc-commun': { slug: 'tronc-commun', name: 'قسم جذع مشترك (خاص بالسنة الأولى)' },
    '/admin/procedes': { slug: 'procedes', name: 'قسم هندسة الطرائق' },
    '/admin/mecanique': { slug: 'mecanique', name: 'قسم الميكانيك' }
  };

  if (pathname === '/admin') {
    const activeSession = getAuthenticatedDepartmentSession(req);
    const targetLocation =
      activeSession && activeSession.slug ? `/admin/${activeSession.slug}` : '/login';
    res.writeHead(302, { Location: targetLocation });
    return res.end();
  }

  if (STANDALONE_DEPARTMENT_ROUTES[pathname]) {
    const { slug, name: deptName } = STANDALONE_DEPARTMENT_ROUTES[pathname];
    const activeSession = getAuthenticatedDepartmentSession(req);

    // 1. إذا لم يكن مسجلاً الدخول -> توجيه إلى /login
    if (!activeSession || !activeSession.slug) {
      res.writeHead(302, {
        Location: `/login?redirect=${encodeURIComponent(pathname)}`
      });
      return res.end();
    }

    // 2. إذا كان مسجلاً بحساب قسم آخر -> منعه وتوجيهه حصراً إلى لوحة قسمه
    if (activeSession.slug !== slug) {
      res.writeHead(302, {
        Location: `/admin/${activeSession.slug}?forbidden_dept=${encodeURIComponent(slug)}`
      });
      return res.end();
    }

    const staticRoot = getStaticRootDir();
    const deptHtmlPath = path.join(staticRoot, 'department.html');
    return fs.readFile(deptHtmlPath, 'utf8', (err, htmlContent) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 Not Found');
      }
      const hydratedHtml = htmlContent
        .replace(
          'لوحة تحكم القسم | كلية العلوم والتكنولوجيا',
          `لوحة تحكم - ${deptName} | كلية العلوم والتكنولوجيا`
        )
        .replace('لوحة تحكم القسم', `لوحة تحكم - ${deptName}`);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(hydratedHtml);
    });
  }

  // =========================================================================
  // تقديم ملفات الواجهة الأمامية الثابتة (dist / build / public)
  // مع توجيه كافة المسارات غير المعروفة (* fallback) إلى index.html بعد مسارات /api/*
  // =========================================================================
  const staticRoot = getStaticRootDir();

  let filePath = pathname;
  if (pathname === '/') {
    filePath = '/index.html';
  } else if (pathname === '/student') {
    filePath = '/student.html';
  } else if (pathname === '/login') {
    filePath = '/login.html';
  }

  const resolvedPath = path.join(staticRoot, filePath);
  if (!resolvedPath.startsWith(staticRoot)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(resolvedPath, (statErr, stats) => {
    if (!statErr && stats.isFile()) {
      return fs.readFile(resolvedPath, (readErr, content) => {
        if (readErr) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Internal Server Error');
        }
        const ext = path.extname(resolvedPath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
      });
    }

    // Fallback (* -> index.html) لخدمة التوجيه في الواجهة الأمامية (Client-Side Routing)
    fs.readFile(path.join(staticRoot, 'index.html'), (err2, indexContent) => {
      if (err2) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('404 Not Found');
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(indexContent);
    });
  });
};

const server = http.createServer(app);

function createRequestHandler() {
  return app;
}

function startServer(port) {
  server.once('error', err => {
    if (err.code === 'EADDRINUSE' && !process.env.PORT) {
      startServer(port + 1);
    } else {
      console.error('Server error:', err);
    }
  });

  server.listen(port, () => {
    const activeStaticDir = path.basename(getStaticRootDir());
    console.log(`=============================================================`);
    console.log(`🎓 البوابة الرقمية لكلية العلوم والتكنولوجيا تعمل الآن:`);
    console.log(`   - المنفذ النشط (PORT)      : ${port}`);
    console.log(`   - مجلد الواجهة الأمامية    : ${activeStaticDir}/`);
    console.log(`   - قاعدة البيانات المستمرة : SQLite (data/portal.sqlite)`);
    console.log(`   - الرابط المحلي            : http://localhost:${port}/`);
    console.log(`=============================================================`);

    // في بيئة التطوير المحلية فقط (عند عدم تعيين process.env.PORT)، توفير منفذ رديف 3000
    if (!process.env.PORT && port === 3001) {
      const mirrorServer = http.createServer(createRequestHandler());
      mirrorServer.on('error', () => {});
      mirrorServer.listen(3000, () => {
        console.log(`   - منفذ محلي رديف مفعل     : http://localhost:3000/`);
      });
    }
  });
}

// تشغيل الخادم محلياً فقط عند استدعاء server.js مباشرة، وتصديره للعمل كدالة سحابية في Netlify
if (require.main === module) {
  startServer(DEFAULT_PORT);
}

module.exports = app;
module.exports.app = app;
module.exports.server = server;
