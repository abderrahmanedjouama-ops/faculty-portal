# البوابة الرقمية لطلب الوثائق البيداغوجية والإدارية — كلية العلوم والتكنولوجيا

منصة ويب رسمية باللغة العربية (اتجاه `RTL`) مخصصة لطلب واستخراج الوثائق البيداغوجية والإدارية لطلبة **كلية العلوم والتكنولوجيا — جامعة محمد خيضر بسكرة**، مع لوحات تحكم مستقلة ومحمية للأقسام البيداغوجية الخمسة ونظام إشعارات آلي عبر البريد الإلكتروني (`Gmail SMTP`).

---

## الأقسام البيداغوجية المعتمدة
1. **قسم الآلية والإلكترونيك** (`/admin/automatique`)
2. **قسم الهندسة الكهربائية** (`/admin/electrique`)
3. **قسم جذع مشترك (خاص بالسنة الأولى)** (`/admin/tronc-commun`)
4. **قسم هندسة الطرائق** (`/admin/procedes`)
5. **قسم الميكانيك** (`/admin/mecanique`)

---

## هيكلة المشروع
- `public/` — الواجهة الأمامية الرسمية (`index.html`، `student.html`، `login.html`، `department.html`، ملفات `css/` و`js/` وشعار الكلية `images/fst-logo.jpg`).
- `netlify/functions/api.js` — الدالة السحابية (`Serverless Function`) المشغلة للواجهة الخلفية عبر `serverless-http`.
- `netlify.toml` — إعدادات النشر والتوجيه التلقائي على منصة **Netlify**.
- `server.js` — خادم الواجهة الخلفية لمعالجة الطلبات، مصادقة الأقسام، وإرسال إشعارات البريد الإلكتروني.
- `db/` — مخطط وطبقة قاعدة البيانات (`schema.sql` و`database.js`).
- `services/emailService.js` — خدمة إرسال إشعارات الجاهزية والرفض عبر `Nodemailer`.

---

## التشغيل المحلي (Local Development)

```bash
npm install
npm start
```

يعمل الخادم محلياً على الرابط: `http://localhost:3001`

---

## النشر التلقائي على Netlify عبر GitHub (Continuous Deployment)

المشروع مهيأ بالكامل للنشر التلقائي المباشر عبر **Netlify** بمجرد ربط المستودع:
1. سجّل الدخول إلى حسابك في **Netlify** واضغط على **Add new site** ثم **Import an existing project**.
2. اختر **GitHub** وحدد هذا المستودع (`FST`).
3. سيقوم Netlify تلقائياً بقراءة إعدادات ملف `netlify.toml`:
   - **Publish directory:** `public`
   - **Functions directory:** `netlify/functions`
4. اضغط على **Deploy site** ليتم نشر الواجهة الأمامية والدالة السحابية معاً بشكل فوري.
