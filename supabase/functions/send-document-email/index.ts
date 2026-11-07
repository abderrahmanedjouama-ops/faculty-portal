/**
 * Supabase / Serverless Edge Function: send-document-email
 * يرسل بريد إلكتروني HTML باللغة العربية (اتجاه RTL) للطالب عند تحديث حالة طلبه إلى:
 * - ready (جاهزة للاستلام)
 * - rejected (مرفوض مع بيان سبب الرفض)
 */

// @ts-ignore: Deno environment in Supabase Edge Functions
const RESEND_API_KEY = typeof Deno !== 'undefined' ? Deno.env.get('RESEND_API_KEY') : '';

export interface DocumentRequestPayload {
  id: string;
  tracking_code: string;
  first_name: string;
  last_name: string;
  student_card_number: string;
  email: string;
  department: string;
  document_type: string;
  degree_level?: string | null;
  requested_year?: string | null;
  academic_year?: string | null;
  status: 'ready' | 'rejected';
  rejection_reason?: string | null;
}

export function generateRtlEmail(payload: DocumentRequestPayload): { subject: string; html: string } {
  const {
    first_name,
    last_name,
    student_card_number,
    department,
    document_type,
    status,
    rejection_reason
  } = payload;

  if (status === 'ready') {
    const subject = `إشعار بجاهزية وثيقتك البيداغوجية - ${document_type}`;
    const html = `
      <div dir="rtl" style="font-family: 'Cairo', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; color: #1e293b; line-height: 1.8; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <p>مرحباً <strong>${first_name} ${last_name}</strong>،</p>
        <p>نعلمك بأن طلبك الخاص باستخراج وثيقة <strong>( ${document_type} )</strong> المسجل تحت رقم بطاقة الطالب <strong>( ${student_card_number} )</strong> قد تمت معالجته واستخراجه بنجاح.</p>
        <p>يمكنك الآن التقدم إلى مصلحة التدريس في <strong>${department}</strong> لاستلام وثيقتك ورقياً، يرجى إحضار بطاقة الطالب الخاصة بك.</p>
      </div>
    `;
    return { subject, html };
  }

  const subject = `إشعار بخصوص طلب وثيقتك البيداغوجية (مرفوض) - ${document_type}`;
  const html = `
    <div dir="rtl" style="font-family: 'Cairo', Tahoma, Arial, sans-serif; direction: rtl; text-align: right; color: #1e293b; line-height: 1.8; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #fecaca; border-radius: 12px;">
      <p>مرحباً <strong>${first_name} ${last_name}</strong>،</p>
      <p>نود إعلامك بأنه تعذر استخراج وثيقة <strong>( ${document_type} )</strong> المسجلة تحت رقم بطاقة الطالب <strong>( ${student_card_number} )</strong> لدى <strong>${department}</strong>.</p>
      <p style="background: #fee2e2; color: #991b1b; padding: 12px; border-radius: 8px;"><strong>سبب الرفض:</strong> ${rejection_reason || 'يرجى التحقق من صحة البيانات المدخلة'}</p>
      <p>يمكنك تصحيح البيانات وإعادة تقديم طلب جديد عبر البوابة الرقمية للكلية.</p>
    </div>
  `;
  return { subject, html };
}
