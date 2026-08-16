# RMTV Flutter Web Build

[العربية](#العربية) | [English](#english)

## العربية

نسخة نشر مجمّعة بتقنية Flutter Web لتطبيق RMTV. يحتوي هذا المستودع على الملفات اللازمة لتقديم نسخة الويب الحالية، بما فيها حزمة تطبيق JavaScript وملفات عارض Flutter وأصول التطبيق وبيانات PWA الوصفية وعامل خدمة للتخزين المؤقت دون اتصال.

### الإمكانات المضمّنة

- تطبيق Flutter مجمّع يُحمّل عبر `flutter_bootstrap.js`.
- عرض CanvasKit باستخدام ملفات JavaScript وWebAssembly محلية.
- بيان Progressive Web App يتضمن أيقونات قياسية وأيقونات قابلة للاقتصاص (`maskable`).
- عامل خدمة Flutter يخزّن موارد النسخة مؤقتاً.
- تحميل Video.js 7.21.5 من شبكة CDN الخاصة به عبر صفحة الاستضافة.
- شعارات وأيقونات تطبيق وصور تلفاز وصورة للمشرف وخط مخصص مضمّنة في الحزمة.
- بيانات وصفية للنسخة ذات إصدار التطبيق `2.1.0` ورقم البناء `3`.

تتضمن إشعارات الأطراف الثالثة المُنشأة حزم Flutter الخاصة بـ Firebase Core وCloud Firestore وRiverpod وطلبات HTTP والتفضيلات المشتركة وفتح عناوين URL وتشغيل الفيديو ودعم إبقاء الجهاز في وضع الاستيقاظ.

### التقنيات المستخدمة

- Flutter Web وDart مجمّعان باستخدام `dart2js`
- CanvasKit وWebAssembly
- عامل خدمة JavaScript وبيان تطبيق ويب
- Video.js
- حزمتا Firebase Core وCloud Firestore المضمّنتان في إشعارات النسخة

### التشغيل محلياً

لا تفتح `index.html` مباشرة كملف. قدّم المجلد كاملاً عبر HTTP لكي يتمكن التطبيق وموارد WebAssembly وعامل الخدمة من التحميل بصورة صحيحة.

1. افتح نافذة أوامر في مجلد المشروع.
2. شغّل خادم ملفات ثابتة:

   ```bash
   python -m http.server 8000
   ```

3. افتح `http://localhost:8000` في المتصفح.

أبقِ بنية المجلد من دون تغيير. يتوقع الوسم `<base href="/">` المضمّن استضافة النسخة في جذر نطاق أو خادم محلي. يلزم اتصال بالإنترنت لشبكة CDN الخاصة بـ Video.js ولأي خدمات بعيدة يستخدمها التطبيق المجمّع.

### بنية المشروع

```text
.
|-- index.html                    # صفحة استضافة الويب
|-- flutter_bootstrap.js          # إعدادات مُحمّل Flutter المُنشأة
|-- flutter.js                    # مُحمّل بيئة تشغيل Flutter Web
|-- main.dart.js                  # حزمة التطبيق المجمّعة
|-- flutter_service_worker.js     # ذاكرة التخزين المؤقت للموارد دون اتصال المُنشأة
|-- manifest.json                 # بيانات PWA الوصفية
|-- version.json                  # إصدار التطبيق ورقم البناء
|-- assets/                       # الخطوط والصور والمظللات والإشعارات
|-- canvaskit/                    # ملفات JavaScript وWebAssembly الخاصة بالعارض
`-- icons/                        # أيقونات PWA
```

### الحالة الحالية

هذا المستودع عنصر نشر مُنشأ وليس مشروع Flutter المصدري. لا يتضمن ملفات Dart المصدرية أو `pubspec.yaml` أو إعدادات البناء أو اختبارات آلية. يمكنك تقديم النسخة الحالية ونشرها، لكن إعادة بنائها أو تغيير سلوك التطبيق يتطلب مشروع Flutter المصدري الأصلي.

يحتوي `assets/NOTICES` على إشعارات الأطراف الثالثة المُنشأة مع نسخة Flutter. لا يتضمن هذا المستودع ملف ترخيص على مستوى المشروع.

## English

A compiled Flutter Web deployment for the RMTV application. This repository contains the files needed to serve the existing web build, including the JavaScript application bundle, Flutter renderer files, application assets, PWA metadata, and an offline cache service worker.

### Included Capabilities

- Compiled Flutter application loaded through `flutter_bootstrap.js`.
- CanvasKit rendering with local JavaScript and WebAssembly files.
- Progressive Web App manifest with standard and maskable icons.
- Flutter service worker that caches the build resources.
- Video.js 7.21.5 loaded from its CDN by the host page.
- Packaged logos, app icons, TV images, an admin image, and a custom font.
- Build metadata for application version `2.1.0`, build number `3`.

The generated third-party notices include Flutter packages for Firebase Core, Cloud Firestore, Riverpod, HTTP requests, shared preferences, URL launching, video playback, and wake-lock support.

### Tech Stack

- Flutter Web and Dart compiled with `dart2js`
- CanvasKit and WebAssembly
- JavaScript service worker and web app manifest
- Video.js
- Firebase Core and Cloud Firestore packages included in the build notices

### Run Locally

Do not open `index.html` directly as a file. Serve the complete directory over HTTP so the application, WebAssembly resources, and service worker can load correctly.

1. Open a terminal in the project directory.
2. Start a static file server:

   ```bash
   python -m http.server 8000
   ```

3. Open `http://localhost:8000` in a browser.

Keep the directory structure unchanged. The included `<base href="/">` expects the build to be hosted at the root of a domain or local server. Internet access is required for the Video.js CDN and for any remote services used by the compiled application.

### Project Structure

```text
.
|-- index.html                    # Web host page
|-- flutter_bootstrap.js          # Generated Flutter loader configuration
|-- flutter.js                    # Flutter web runtime loader
|-- main.dart.js                  # Compiled application bundle
|-- flutter_service_worker.js     # Generated offline resource cache
|-- manifest.json                 # PWA metadata
|-- version.json                  # Application version and build number
|-- assets/                       # Fonts, images, shaders, and notices
|-- canvaskit/                    # Renderer JavaScript and WebAssembly
`-- icons/                        # PWA icons
```

### Current Status

This repository is a generated deployment artifact, not the Flutter source project. It does not include Dart source files, `pubspec.yaml`, build configuration, or automated tests. You can serve and deploy the current build, but rebuilding or changing application behavior requires the original Flutter source project.

`assets/NOTICES` contains third-party notices generated with the Flutter build. No project-level license file is included in this repository.
