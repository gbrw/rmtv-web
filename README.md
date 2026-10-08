# RM TV

تطبيق بث مباشر للقنوات (IPTV) مع نسخة ويب ولوحة تحكم، وكلها تعمل على قاعدة بيانات Firebase Firestore واحدة.

## مكونات المشروع

| المجلد | الوصف |
|---|---|
| `android/` | تطبيق أندرويد / أندرويد TV (Kotlin + ExoPlayer) — الإصدار 1.4 |
| `admin_app/` | تطبيق الإدارة القديم لأندرويد (Kotlin) |
| `pwa/` | نسخة الويب العامة (PWA) — https://rmtv-tv.vercel.app |
| `pwa/admin/` | لوحة التحكم على الويب (PWA) — https://rmtv-tv.vercel.app/admin/ |
| `firestore.rules` | قواعد حماية Firestore (القراءة للجميع، التعديل للمدير فقط) |

### بيانات Firestore
- `networks` — الباقات: `name`, `logoUrl`, `order`, `isActive`
- `channels` — القنوات: `name`, `logoUrl`, `url`, `streamType` (`direct` / `youtube`), `networkId`, `order`, `isActive`, `showOnWeb` (اختياري)
- `settings/appUpdate` — تحديث تطبيق أندرويد: `latestVersionCode`, `apkUrl`, `forceUpdate`

## تطبيق أندرويد (`android/`)
- قوائم للباقات والقنوات، بحث، وتنقّل كامل بالريموت.
- مشغل ExoPlayer بواجهة احترافية: قائمة قنوات جانبية، تغيير حجم الشاشة، رقم القناة عند التبديل.
- إعادة اتصال تلقائية + مراقب لتجمّد الصورة + استئناف عند رجوع الإنترنت.
- مشغلات خارجية (VLC، MX Player، ...) ومشغل افتراضي قابل للاختيار.
- ثيمات: 4 خلفيات × 7 ألوان.

البناء (يتطلب JDK 17 و Android SDK 34):
```
cd android
gradlew assembleRelease
```
الناتج: `android/app/build/outputs/apk/release/app-release.apk`

> مفتاح التوقيع وملفات `local.properties` غير مرفوعة (انظر `.gitignore`).

## نسخة الويب (`pwa/`)
ملفات ثابتة بدون أي خطوة بناء، منشورة على Vercel:
```
cd pwa
vercel deploy --prod
```
- تعرض فقط القنوات التي تعمل في المتصفح (روابط https ويوتيوب).
- 9 مشغلات ويب (hls.js، Video.js، Shaka، Clappr، Plyr، ArtPlayer، DPlayer، ...) مع تبديل تلقائي عند الفشل.
- قابلة للتثبيت كتطبيق (PWA) على أندرويد و iOS والكمبيوتر.
- التجربة محلياً: `powershell -ExecutionPolicy Bypass -File pwa\serve.ps1`

### لوحة التحكم (`pwa/admin/`)
- دخول بحساب Google؛ الحسابات المسموحة في `pwa/config.js` (`ADMIN_EMAILS`) وفي `firestore.rules`.
- إدارة الباقات والقنوات، الترتيب، التفعيل، الظهور على الويب، ونشر تحديثات تطبيق أندرويد.

## Firebase
```
firebase deploy --only firestore:rules
```
