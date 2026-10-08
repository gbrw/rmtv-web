// سكربت عادي (ليس module) يعمل قبل التطبيق: يعرض شاشة تحميل، ويظهر سبب أي فشل
// بدل أن تبقى الصفحة فارغة (متصفح قديم، انقطاع الاتصال بـ Firebase، خطأ في الكود).
(function () {
  var boot = document.getElementById("boot");
  var msg = document.getElementById("bootMsg");
  var retry = document.getElementById("bootRetry");
  if (!boot) return;

  function fail(text) {
    if (boot.hidden) return;
    boot.classList.add("failed");
    msg.textContent = text;
    retry.hidden = false;
  }

  retry.onclick = function () { location.reload(); };

  window.__bootDone = function () {
    clearTimeout(timer);
    boot.hidden = true;
  };

  window.addEventListener("error", function (e) {
    fail("حدث خطأ أثناء التحميل:\n" + (e.message || (e.target && e.target.src) || "غير معروف"));
  }, true);
  window.addEventListener("unhandledrejection", function (e) {
    var r = e.reason;
    fail("تعذر التحميل:\n" + ((r && r.message) || String(r)));
  });

  var timer = setTimeout(function () {
    fail(navigator.onLine === false
      ? "لا يوجد اتصال بالإنترنت"
      : "التحميل يستغرق وقتاً طويلاً.\nتأكد من الإنترنت أو جرّب متصفح Chrome أو Safari بدلاً من المتصفح الداخلي للتطبيقات.");
  }, 20000);
})();
