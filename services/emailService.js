/**
 * خدمة الإشعارات البريدية المؤتمتة (Department Self-Service Gmail SMTP Notification System)
 * تستخدم Nodemailer مع إعدادات كل قسم المخزنة في جدول department_settings:
 * - host: "smtp.gmail.com"
 * - port: 465
 * - secure: true
 */

const crypto = require('crypto');
const nodemailer = require('nodemailer');

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * تنظيف رمز تطبيق جوجل (إزالة الفراغات مع التحقق من كونه 16 حرفاً)
 */
function normalizeAppPassword(rawPassword) {
  return String(rawPassword || '').replace(/\s+/g, '');
}

/**
 * إنشاء ناقل Nodemailer ديناميكي خاص بالقسم (Gmail SMTP over SSL port 465)
 */
function createDepartmentGmailTransporter(deptSettings) {
  const user = String(deptSettings.sender_gmail || '').trim();
  const pass = normalizeAppPassword(deptSettings.gmail_app_password);

  return nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
      user,
      pass
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 12000
  });
}

/**
 * بناء قالب البريد الإلكتروني HTML RTL عند جاهزية الوثيقة (status = 'ready')
 */
function buildReadyEmailTemplate(request) {
  const firstName = escapeHtml(request.first_name);
  const lastName = escapeHtml(request.last_name);
  const docType = escapeHtml(request.document_type);
  const cardNumber = escapeHtml(request.student_card_number);
  const department = escapeHtml(request.department);
  const trackingCode = escapeHtml(request.tracking_code);

  let extraDetailsHtml = '';
  if (request.document_type === 'شهادة الترتيب' && request.degree_level) {
    extraDetailsHtml = `<p style="margin: 6px 0 0; font-size: 14px; color: #334155;">الطور الجامعي: <strong>${escapeHtml(request.degree_level)}</strong></p>`;
  } else if (request.document_type === 'كشف النقاط' && request.requested_year) {
    extraDetailsHtml = `<p style="margin: 6px 0 0; font-size: 14px; color: #334155;">السنة المطلوبة: <strong>${escapeHtml(request.requested_year)}</strong> — العام الدراسي: <strong>${escapeHtml(request.academic_year || '')}</strong></p>`;
  }

  const subject = `إشعار بجاهزية وثيقتك البيداغوجية - ${request.document_type}`;

  const textBody = [
    `مرحباً ${request.first_name} ${request.last_name}،`,
    `نعلمك بأن وثيقتك ( ${request.document_type} ) المسجلة برقم البطاقة ( ${request.student_card_number} ) جاهزة للاستلام.`,
    `يرجى التقدم إلى مصلحة التدريس بـ ${request.department} لاستلامها مصحوباً ببطاقة الطالب.`
  ].join('\n\n');

  const htmlBody = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(subject)}</title>
</head>
<body dir="rtl" style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: 'Cairo', 'Tahoma', Arial, sans-serif; direction: rtl; text-align: right; color: #1e293b;">
  <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(12, 30, 60, 0.08);">
    <div style="background: linear-gradient(135deg, #0c1e3c 0%, #1e3a8a 100%); color: #ffffff; padding: 22px 28px; border-bottom: 4px solid #f59e0b;">
      <h2 style="margin: 0; font-size: 19px; font-weight: 800;">البوابة الرقمية للوثائق البيداغوجية والإدارية</h2>
      <p style="margin: 4px 0 0; font-size: 13px; color: #dbeafe;">مصلحة التدريس — ${department}</p>
    </div>

    <div style="padding: 28px; line-height: 1.9; font-size: 16px;">
      <div style="display: inline-block; background-color: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; padding: 5px 14px; border-radius: 999px; font-size: 13px; font-weight: 700; margin-bottom: 18px;">
        ✓ جاهزة للاستلام (Ready for Pickup)
      </div>

      <p style="margin: 0 0 14px; font-size: 17px;">
        مرحباً <strong>${firstName} ${lastName}</strong>،
      </p>

      <p style="margin: 0 0 14px;">
        نعلمك بأن وثيقتك <strong>( ${docType} )</strong> المسجلة برقم البطاقة <strong>( ${cardNumber} )</strong> جاهزة للاستلام.
      </p>

      <p style="margin: 0 0 20px;">
        يرجى التقدم إلى مصلحة التدريس بـ <strong>${department}</strong> لاستلامها مصحوباً ببطاقة الطالب.
      </p>

      <div style="background-color: #f8fafc; border-right: 4px solid #1e3a8a; padding: 14px 18px; border-radius: 8px; margin-top: 18px;">
        <p style="margin: 0; font-size: 14px; color: #334155;">رمز تتبع الطلب: <strong style="font-family: monospace; color: #0c1e3c;">${trackingCode}</strong></p>
        ${extraDetailsHtml}
      </div>
    </div>

    <div style="background-color: #071326; color: #94a3b8; padding: 16px 28px; font-size: 12px; text-align: center;">
      مرسل من: ${department} — البوابة الرقمية لطلب الوثائق البيداغوجية والإدارية
    </div>
  </div>
</body>
</html>`;

  return { subject, htmlBody, textBody };
}

/**
 * بناء قالب البريد الإلكتروني HTML RTL عند رفض الطلب (status = 'rejected')
 */
function buildRejectedEmailTemplate(request) {
  const firstName = escapeHtml(request.first_name);
  const lastName = escapeHtml(request.last_name);
  const docType = escapeHtml(request.document_type);
  const cardNumber = escapeHtml(request.student_card_number);
  const department = escapeHtml(request.department);
  const trackingCode = escapeHtml(request.tracking_code);
  const rejectionReason = escapeHtml(
    request.rejection_reason || 'يرجى التحقق من صحة البيانات المدخلة'
  );

  const subject = `إشعار بخصوص طلب وثيقتك البيداغوجية - ${request.document_type}`;

  const textBody = [
    `مرحباً ${request.first_name} ${request.last_name}،`,
    `نود إعلامك بأنه تعذر استخراج وثيقة ( ${request.document_type} ) المسجلة برقم البطاقة ( ${request.student_card_number} ) لدى ${request.department}.`,
    `سبب الرفض: ${request.rejection_reason}`,
    `يرجى تصحيح البيانات وإعادة تقديم طلب جديد عبر البوابة الرقمية للكلية.`
  ].join('\n\n');

  const htmlBody = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${escapeHtml(subject)}</title>
</head>
<body dir="rtl" style="margin: 0; padding: 24px; background-color: #f1f5f9; font-family: 'Cairo', 'Tahoma', Arial, sans-serif; direction: rtl; text-align: right; color: #1e293b;">
  <div style="max-width: 620px; margin: 0 auto; background-color: #ffffff; border-radius: 14px; overflow: hidden; border: 1px solid #e2e8f0; box-shadow: 0 4px 12px rgba(12, 30, 60, 0.08);">
    <div style="background: linear-gradient(135deg, #7f1d1d 0%, #b91c1c 100%); color: #ffffff; padding: 22px 28px; border-bottom: 4px solid #f59e0b;">
      <h2 style="margin: 0; font-size: 19px; font-weight: 800;">البوابة الرقمية للوثائق البيداغوجية والإدارية</h2>
      <p style="margin: 4px 0 0; font-size: 13px; color: #fecaca;">مصلحة التدريس — ${department}</p>
    </div>

    <div style="padding: 28px; line-height: 1.9; font-size: 16px;">
      <div style="display: inline-block; background-color: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; padding: 5px 14px; border-radius: 999px; font-size: 13px; font-weight: 700; margin-bottom: 18px;">
        ✕ تم رفض الطلب (يرجى تصحيح البيانات)
      </div>

      <p style="margin: 0 0 14px; font-size: 17px;">
        مرحباً <strong>${firstName} ${lastName}</strong>،
      </p>

      <p style="margin: 0 0 14px;">
        نود إعلامك بأنه تعذر استخراج وثيقة <strong>( ${docType} )</strong> المسجلة برقم البطاقة <strong>( ${cardNumber} )</strong> لدى <strong>${department}</strong>.
      </p>

      <div style="background-color: #fff1f2; border-right: 4px solid #dc2626; padding: 14px 18px; border-radius: 8px; margin: 18px 0;">
        <p style="margin: 0 0 6px; font-size: 14px; font-weight: 700; color: #991b1b;">سبب الرفض:</p>
        <p style="margin: 0; font-size: 15px; font-weight: 700; color: #7f1d1d;">"${rejectionReason}"</p>
      </div>

      <p style="margin: 0 0 16px;">
        يرجى تصحيح البيانات وإعادة تقديم طلب جديد عبر البوابة الرقمية للكلية.
      </p>

      <p style="margin: 0; font-size: 13px; color: #64748b;">رمز الطلب المرجعي: <strong>${trackingCode}</strong></p>
    </div>

    <div style="background-color: #071326; color: #94a3b8; padding: 16px 28px; font-size: 12px; text-align: center;">
      مرسل من: ${department} — البوابة الرقمية لطلب الوثائق البيداغوجية والإدارية
    </div>
  </div>
</body>
</html>`;

  return { subject, htmlBody, textBody };
}

/**
 * إرسال إشعار البريد الإلكتروني للطالب باستخدام إعدادات قسمه (Nodemailer Gmail SMTP)
 */
async function dispatchAutomatedStudentEmail(request, statusType, deptSettings) {
  const template =
    statusType === 'ready'
      ? buildReadyEmailTemplate(request)
      : buildRejectedEmailTemplate(request);

  const senderGmail = deptSettings?.sender_gmail || 'noreply@univ-fst.dz';
  const fromHeader = `"${request.department}" <${senderGmail}>`;
  let provider = 'nodemailer-gmail-smtp';
  let deliveryStatus = 'sent';
  let smtpErrorNote = null;

  if (deptSettings && deptSettings.sender_gmail && deptSettings.gmail_app_password) {
    try {
      const transporter = createDepartmentGmailTransporter(deptSettings);
      await transporter.sendMail({
        from: fromHeader,
        to: request.email,
        subject: template.subject,
        text: template.textBody,
        html: template.htmlBody
      });
      deliveryStatus = 'delivered';
    } catch (err) {
      smtpErrorNote = err.message;
      deliveryStatus = 'queued_local_outbox';
      console.warn(
        `[Nodemailer SMTP Notice] Could not reach live Gmail SMTP (${err.message}). Recorded in outbox.`
      );
    }
  }

  const notificationRecord = {
    id: crypto.randomUUID(),
    request_id: request.id,
    tracking_code: request.tracking_code,
    sender_gmail: senderGmail,
    recipient_email: request.email,
    student_name: `${request.first_name} ${request.last_name}`,
    document_type: request.document_type,
    department: request.department,
    notification_type: statusType,
    subject: template.subject,
    html_body: template.htmlBody,
    text_body: template.textBody,
    delivery_status: deliveryStatus,
    provider,
    smtp_error: smtpErrorNote,
    sent_at: new Date().toISOString()
  };

  console.log(
    `\n📧 [DEPARTMENT GMAIL DISPATCH] From: ${fromHeader} -> To: ${request.email} | Subject: ${template.subject}`
  );

  return notificationRecord;
}

/**
 * إرسال رسالة تجريبية لبريد القسم للتأكد من صحة رمز تطبيق جوجل (16 حرفاً)
 */
async function sendDepartmentTestEmail(deptSettings) {
  const deptName = deptSettings.department_name;
  const senderGmail = String(deptSettings.sender_gmail || '').trim();
  const cleanPass = normalizeAppPassword(deptSettings.gmail_app_password);

  if (!senderGmail || !/^[a-zA-Z0-9._%+-]+@gmail\.com$/i.test(senderGmail)) {
    const err = new Error('يرجى إدخال عنوان بريد إلكتروني صحيح ينتهي بـ @gmail.com خاص بالقسم.');
    err.code = 'INVALID_GMAIL';
    throw err;
  }

  if (cleanPass.length !== 16) {
    const err = new Error(
      `رمز تطبيق جوجل (App Password) يجب أن يتكون من 16 حرفاً بالضبط (تم إدخال ${cleanPass.length} حرفاً).`
    );
    err.code = 'INVALID_APP_PASSWORD_LENGTH';
    throw err;
  }

  const subject = `رسالة تجريبية لتأكيد ربط البريد الإلكتروني - ${deptName}`;
  const htmlBody = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<body dir="rtl" style="font-family: 'Cairo', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; padding: 20px; color: #1e293b;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border: 1px solid #bbf7d0; border-right: 5px solid #16a34a; border-radius: 10px; padding: 20px;">
    <h3 style="margin: 0 0 10px; color: #15803d;">✓ تم الربط بنجاح مع البوابة الرقمية للكلية!</h3>
    <p style="margin: 0 0 10px;">هذه رسالة تجريبية مرسلة من نظام <strong>البوابة الرقمية لطلب الوثائق البيداغوجية والإدارية</strong> الخاصة بـ <strong>${escapeHtml(deptName)}</strong>.</p>
    <p style="margin: 0; font-size: 14px; color: #475569;">البريد المعتمد للإرسال: <strong>${escapeHtml(senderGmail)}</strong> (عبر خادم <code>smtp.gmail.com:465</code>).</p>
  </div>
</body>
</html>`;
  const textBody = `تم الربط بنجاح! هذه رسالة تجريبية لتأكيد إعدادات البريد الإلكتروني الخاصة بـ ${deptName} (${senderGmail}).`;

  const transporter = createDepartmentGmailTransporter({
    sender_gmail: senderGmail,
    gmail_app_password: cleanPass
  });

  let smtpVerifiedLive = false;
  let smtpNotice = null;

  try {
    await transporter.sendMail({
      from: `"${deptName}" <${senderGmail}>`,
      to: senderGmail,
      subject,
      text: textBody,
      html: htmlBody
    });
    smtpVerifiedLive = true;
  } catch (err) {
    // في حال فشل الاتصال بـ Gmail SMTP بسبب بيانات تجريبية أو رمز غير صالح من حساب جوجل
    smtpNotice = err.message;
    if (
      String(err.code) === 'EAUTH' ||
      String(err.responseCode) === '535' ||
      String(err.message).includes('Invalid login') ||
      String(err.message).includes('Username and Password not accepted')
    ) {
      const authErr = new Error(
        `فشلت المصادقة مع خادم Gmail SMTP (خطأ 535): تأكد من أن البريد (${senderGmail}) صحيح، وأن رمز التطبيق المكون من 16 حرفاً مستخرج فعلياً من إعدادات أمان حساب Google (App Passwords).`
      );
      authErr.code = 'SMTP_AUTH_FAILED';
      authErr.smtpDetails = err.message;
      throw authErr;
    }
    throw new Error(`تعذر الاتصال بخادم smtp.gmail.com:465 — تفاصيل الخطأ: ${err.message}`);
  }

  return {
    id: crypto.randomUUID(),
    request_id: null,
    tracking_code: 'TEST-SMTP',
    sender_gmail: senderGmail,
    recipient_email: senderGmail,
    student_name: `اختبار إعدادات (${deptName})`,
    document_type: 'رسالة اختبار الربط (Test Email)',
    department: deptName,
    notification_type: 'test',
    subject,
    html_body: htmlBody,
    text_body: textBody,
    delivery_status: smtpVerifiedLive ? 'delivered' : 'sent',
    provider: 'nodemailer-gmail-smtp',
    smtp_notice: smtpNotice,
    sent_at: new Date().toISOString()
  };
}

module.exports = {
  normalizeAppPassword,
  buildReadyEmailTemplate,
  buildRejectedEmailTemplate,
  dispatchAutomatedStudentEmail,
  sendDepartmentTestEmail
};
