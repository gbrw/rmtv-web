// إعدادات Firebase المشتركة بين نسخة الويب العامة ولوحة التحكم.
// القيم مأخوذة من google-services.json (مشروع rmtv-tv-488b9).
// يُفضّل إضافة "تطبيق ويب" من Firebase Console > Project settings ونسخ appId الخاص به هنا.
export const firebaseConfig = {
  apiKey: "AIzaSyAWMy-PKXCImphxCKg51ex9Uyt_Bipug68",
  authDomain: "rmtv-tv-488b9.firebaseapp.com",
  projectId: "rmtv-tv-488b9",
  storageBucket: "rmtv-tv-488b9.firebasestorage.app",
  messagingSenderId: "599939270063",
  // appId: "1:599939270063:web:XXXXXXXX",
};

// حسابات Google المسموح لها بالدخول للوحة التحكم.
// يجب أن تطابق القائمة الموجودة في firestore.rules (هي الحماية الفعلية).
export const ADMIN_EMAILS = ["gaithalrawi99@gmail.com"];

export const FIREBASE_SDK = "https://www.gstatic.com/firebasejs/10.12.2";
