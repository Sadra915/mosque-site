/* =========================================================
   ماژول احراز هویت - مسجد محله
   نیازمند: config.js + firebase-app/auth/database compat
   قدم ۱ از مستند طراحی فاز جدید: راه‌اندازی Firebase Authentication
   ========================================================= */

(function () {

  const CFG = window.CHAT_CONFIG;
  let auth = null;
  let db = null;

  // وضعیت فعلی کاربر لاگین‌کرده، در دسترس بقیه‌ی اسکریپت‌های سایت
  window.AUTH_STATE = {
    user: null,          // آبجکت firebase user یا null
    verified: false,     // آیا ایمیل تایید شده
    profile: null         // دیتای users/{uid} از دیتابیس
  };

  const listeners = []; // توابعی که با تغییر وضعیت لاگین صدا زده می‌شن

  function onAuthChange(fn) {
    listeners.push(fn);
    // اگه از قبل وضعیتی داریم، بلافاصله صداش بزن
    fn(window.AUTH_STATE);
  }

  function notifyListeners() {
    listeners.forEach(fn => fn(window.AUTH_STATE));
  }

  function ensureFirebase() {
    if (!firebase.apps.length) firebase.initializeApp(CFG.firebase);
    if (!auth) auth = firebase.auth();
    if (!db) db = firebase.database();
    return { auth, db };
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  /* ---------- ثبت‌نام ---------- */
  function signUp(email, password, displayName) {
    ensureFirebase();
    return auth.createUserWithEmailAndPassword(email, password)
      .then((cred) => {
        const uid = cred.user.uid;
        const now = Date.now();

        // پروفایل عمومی — بدون ایمیل، بدون هیچ داده‌ی حساس
        const publicProfile = {
          displayName: (displayName || "کاربر جدید").slice(0, 30),
          username: null,       // در فاز بعدی (قدم ۲) تکمیل می‌شه
          badge: null,          // فقط ادمین می‌تونه بعداً تغییرش بده
          joinedAt: now
        };

        // داده‌ی خصوصی — فقط خود کاربر یا ادمین باید بتونه بخونتش (با Rules در قدم ۳)
        const privateProfile = {
          email: email,
          createdAt: now
        };

        return Promise.all([
          db.ref("users/" + uid).set(publicProfile),
          db.ref("userPrivate/" + uid).set(privateProfile),
          cred.user.sendEmailVerification()
        ]).then(() => cred);
      });
  }

  /* ---------- ورود ---------- */
  function logIn(email, password) {
    ensureFirebase();
    return auth.signInWithEmailAndPassword(email, password);
  }

  /* ---------- خروج ---------- */
  function logOut() {
    ensureFirebase();
    return auth.signOut();
  }

  /* ---------- ارسال دوباره‌ی ایمیل تایید ---------- */
  function resendVerification() {
    ensureFirebase();
    if (!auth.currentUser) return Promise.reject(new Error("کاربری لاگین نکرده."));
    return auth.currentUser.sendEmailVerification();
  }

  /* ---------- بازیابی رمز عبور ---------- */
  function resetPassword(email) {
    ensureFirebase();
    return auth.sendPasswordResetEmail(email);
  }

  /* ---------- گوش‌دادن به تغییرات لاگین ---------- */
  function init() {
    if (!CFG) {
      console.error("CHAT_CONFIG پیدا نشد. مطمئن شوید config.js قبل از auth.js لود شده است.");
      return;
    }
    ensureFirebase();

    auth.onAuthStateChanged((user) => {
      window.AUTH_STATE.user = user;
      window.AUTH_STATE.verified = !!(user && user.emailVerified);
      window.AUTH_STATE.profile = null;

      if (user) {
        db.ref("users/" + user.uid).on("value", (snap) => {
          window.AUTH_STATE.profile = snap.val();
          notifyListeners();
        });
      } else {
        notifyListeners();
      }
    });
  }

  window.Auth = {
    signUp, logIn, logOut, resendVerification, resetPassword, onAuthChange, escapeHtml
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
