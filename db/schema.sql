-- =============================================================================
-- مخطط قاعدة البيانات الرسمي (Database Schema)
-- البوابة الرقمية لطلب الوثائق البيداغوجية والإدارية
-- =============================================================================

-- Table 1: document_requests
CREATE TABLE IF NOT EXISTS document_requests (
    id TEXT PRIMARY KEY,                                  -- UUID Primary Key
    tracking_code TEXT NOT NULL UNIQUE,                   -- Short code e.g. REQ-8492
    first_name TEXT NOT NULL,                             -- الاسم
    last_name TEXT NOT NULL,                              -- اللقب
    student_card_number TEXT NOT NULL,                    -- الرقم التسلسلي لبطاقة الطالب
    email TEXT NOT NULL,                                  -- البريد الإلكتروني للطالب (Student's Gmail)
    department TEXT NOT NULL,                             -- القسم
    bac_year TEXT NOT NULL,                               -- عام البكالوريا (2014 - 2026)
    document_type TEXT NOT NULL,                          -- نوع الوثيقة المطلوبة
    degree_level TEXT NULL,                               -- الطور (ليسانس | ماستر) لشهادة الترتيب فقط
    requested_year TEXT NULL,                             -- السنة المطلوبة لكشف النقاط فقط
    academic_year TEXT NULL,                              -- العام الدراسي لتلك السنة لكشف النقاط فقط
    status TEXT NOT NULL DEFAULT 'pending'                -- الحالة: pending | ready | rejected
        CHECK (status IN ('pending', 'ready', 'rejected')),
    rejection_reason TEXT NULL,                           -- سبب الرفض (في حال الرفض)
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- فهرس للبحث السريع بواسطة الرقم التسلسلي لبطاقة الطالب
CREATE INDEX IF NOT EXISTS idx_document_requests_student_card_number
    ON document_requests (student_card_number);

-- فهرس للفلترة السريعة حسب القسم والحالة
CREATE INDEX IF NOT EXISTS idx_document_requests_department_status
    ON document_requests (department, status);

-- قيد فريد جزئي لمنع تكرار طلب قيد المعالجة (pending) لنفس الطالب ونفس الوثيقة
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_pending_request
    ON document_requests (student_card_number, document_type)
    WHERE status = 'pending';

-- =============================================================================
-- Table 2: department_settings (إعدادات الحساب والبريد الإلكتروني الخاصة بكل قسم)
-- =============================================================================
CREATE TABLE IF NOT EXISTS department_settings (
    id TEXT PRIMARY KEY,                                  -- UUID Primary Key
    department_name TEXT NOT NULL UNIQUE,                 -- اسم القسم (من الأقسام الـ 5 حصراً)
    slug TEXT NULL,                                       -- المعرف الرابطي للقسم (automatique, electrique, ...)
    username TEXT NULL,                                   -- اسم المستخدم لتسجيل الدخول للقسم
    login_password TEXT NULL,                             -- كلمة مرور الدخول الخاصة بالقسم
    sender_gmail TEXT NULL,                               -- البريد الإلكتروني للقسم (Department Gmail)
    gmail_app_password TEXT NULL,                         -- رمز تطبيق جوجل المكون من 16 حرفاً (Google App Password)
    is_configured INTEGER NOT NULL DEFAULT 0,             -- Boolean (0 = false, 1 = true)
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- جدول سجل الإشعارات البريدية المرسلة (Automated Gmail Notifications Log)
CREATE TABLE IF NOT EXISTS email_notifications (
    id TEXT PRIMARY KEY,
    request_id TEXT NULL,
    tracking_code TEXT NULL,
    sender_gmail TEXT NULL,
    recipient_email TEXT NOT NULL,
    student_name TEXT NOT NULL,
    document_type TEXT NOT NULL,
    department TEXT NOT NULL,
    notification_type TEXT NOT NULL CHECK (notification_type IN ('ready', 'rejected', 'test')),
    subject TEXT NOT NULL,
    html_body TEXT NOT NULL,
    text_body TEXT NOT NULL,
    delivery_status TEXT NOT NULL DEFAULT 'sent',
    provider TEXT NOT NULL DEFAULT 'nodemailer-gmail-smtp',
    sent_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
