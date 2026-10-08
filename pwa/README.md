# RM TV — نسخة الويب (PWA)

| المسار | الوصف |
|---|---|
| `/` | نسخة المشاهدة العامة، تعمل على كل الهواتف والمتصفحات ويمكن تثبيتها كتطبيق |
| `/admin/` | لوحة التحكم، تعمل من أي متصفح (أندرويد، iOS، ويندوز) ويمكن تثبيتها كتطبيق |

كلاهما يقرأ ويكتب في نفس قاعدة Firestore الخاصة بتطبيقات أندرويد (`networks`, `channels`, `settings/appUpdate`).

## التجربة محلياً
```
powershell -ExecutionPolicy Bypass -File pwa\serve.ps1
```
ثم افتح http://localhost:8080 و http://localhost:8080/admin/

## الإعداد لأول مرة (Firebase Console — مشروع rmtv-tv-488b9)
1. **Authentication > Sign-in method**: فعّل Email/Password.
2. **Authentication > Users**: أضف حساب المدير وانسخ الـ UID.
3. **Firestore**: أنشئ مستنداً `admins/<UID>` (أي محتوى، مثلاً `name: "admin"`).
4. (اختياري) **Project settings > Add app > Web**: انسخ `appId` إلى `pwa/config.js`.

## النشر على Firebase Hosting
```
npm i -g firebase-tools
firebase login
firebase deploy --only hosting
firebase deploy --only firestore:rules
```
> ⚠️ قواعد `firestore.rules` تمنع أي تعديل بدون تسجيل دخول مدير، وهذا يعني أن تطبيق الأدمن الحالي (أندرويد) لن يستطيع الحفظ بعد نشرها لأنه لا يسجّل دخولاً.

عند كل تحديث للملفات غيّر `VERSION` في `sw.js` حتى يحصل المستخدمون على النسخة الجديدة.

## ملاحظات
- روابط البث التي تبدأ بـ `http://` لا يسمح المتصفح بتشغيلها من موقع `https` (قيود أمان المتصفح). تعمل فقط روابط `https`.
- بعض السيرفرات تمنع التشغيل من المتصفح (CORS) حتى لو كان الرابط يعمل في التطبيق.
- على iOS: التثبيت من Safari عبر زر المشاركة ثم «إضافة إلى الشاشة الرئيسية».
