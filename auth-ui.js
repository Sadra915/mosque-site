/* =========================================================
   رابط کاربری ورود/ثبت‌نام - مسجد محله
   نیازمند: auth.js (باید قبل از این فایل لود شود)
   ========================================================= */

(function () {

  let els = {};
  let mode = "login"; // یا "signup"

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function buildDom() {
    const root = document.createElement("div");
    root.innerHTML = `
      <button id="authTrigger" class="auth-trigger">👤 ورود</button>

      <div id="authModal" class="auth-modal">
        <div class="auth-box">
          <div class="auth-tabs">
            <button id="authTabLogin" class="auth-tab active">ورود</button>
            <button id="authTabSignup" class="auth-tab">ثبت‌نام</button>
            <button id="authClose" class="auth-close">✕</button>
          </div>

          <div id="authLoggedOutArea">
            <div id="authNameField" class="auth-field" style="display:none;">
              <label>نام نمایشی</label>
              <input id="authNameInput" maxlength="30" placeholder="اسمی که بقیه می‌بینن">
            </div>
            <div class="auth-field">
              <label>ایمیل</label>
              <input id="authEmailInput" type="email" placeholder="example@mail.com">
            </div>
            <div class="auth-field">
              <label>رمز عبور</label>
              <input id="authPasswordInput" type="password" placeholder="حداقل ۶ کاراکتر">
            </div>

            <button id="authSubmitBtn" class="auth-submit">ورود</button>
            <div id="authForgotLink" class="auth-link">رمزت رو فراموش کردی؟</div>
            <div class="auth-msg" id="authMsg"></div>
          </div>

          <div id="authLoggedInArea" style="display:none;">
            <p class="auth-status" id="authStatusText"></p>
            <button id="authProfileBtn" class="auth-submit">👤 پروفایل من</button>
            <button id="authResendBtn" class="auth-submit">📩 ارسال دوباره‌ی ایمیل تایید</button>
            <button id="authLogoutBtn" class="auth-submit auth-danger">🚪 خروج از حساب</button>
            <div class="auth-msg" id="authMsg2"></div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    els = {
      trigger: document.getElementById("authTrigger"),
      modal: document.getElementById("authModal"),
      tabLogin: document.getElementById("authTabLogin"),
      tabSignup: document.getElementById("authTabSignup"),
      close: document.getElementById("authClose"),
      loggedOutArea: document.getElementById("authLoggedOutArea"),
      loggedInArea: document.getElementById("authLoggedInArea"),
      profileBtn: document.getElementById("authProfileBtn"),
      nameField: document.getElementById("authNameField"),
      nameInput: document.getElementById("authNameInput"),
      emailInput: document.getElementById("authEmailInput"),
      passwordInput: document.getElementById("authPasswordInput"),
      submitBtn: document.getElementById("authSubmitBtn"),
      forgotLink: document.getElementById("authForgotLink"),
      msg: document.getElementById("authMsg"),
      statusText: document.getElementById("authStatusText"),
      resendBtn: document.getElementById("authResendBtn"),
      logoutBtn: document.getElementById("authLogoutBtn"),
      msg2: document.getElementById("authMsg2")
    };

    wireEvents();
  }

  function wireEvents() {
    els.trigger.onclick = () => els.modal.classList.add("show");
    els.close.onclick = () => els.modal.classList.remove("show");
    els.modal.onclick = (e) => { if (e.target === els.modal) els.modal.classList.remove("show"); };

    els.tabLogin.onclick = () => switchMode("login");
    els.tabSignup.onclick = () => switchMode("signup");

    els.submitBtn.onclick = handleSubmit;
    els.forgotLink.onclick = handleForgot;
    els.resendBtn.onclick = handleResend;
    els.logoutBtn.onclick = handleLogout;
    els.profileBtn.onclick = () => {
      els.modal.classList.remove("show");
      if (window.Profile && window.Auth) {
        const state = { user: null };
        // از AUTH_STATE سراسری استفاده می‌کنیم
        if (window.AUTH_STATE && window.AUTH_STATE.user) {
          window.Profile.open(window.AUTH_STATE.user.uid);
        }
      }
    };
  }

  function switchMode(newMode) {
    mode = newMode;
    els.tabLogin.classList.toggle("active", mode === "login");
    els.tabSignup.classList.toggle("active", mode === "signup");
    els.nameField.style.display = mode === "signup" ? "block" : "none";
    els.submitBtn.textContent = mode === "signup" ? "ثبت‌نام" : "ورود";
    els.msg.textContent = "";
  }

  function setMsg(el, text, isError) {
    el.textContent = text;
    el.className = "auth-msg" + (isError ? " err" : " ok");
  }

  function translateError(code) {
    const map = {
      "auth/email-already-in-use": "این ایمیل قبلاً ثبت‌نام شده.",
      "auth/invalid-email": "ایمیل معتبر نیست.",
      "auth/weak-password": "رمز عبور باید حداقل ۶ کاراکتر باشد.",
      "auth/user-not-found": "کاربری با این ایمیل پیدا نشد.",
      "auth/wrong-password": "رمز عبور اشتباه است.",
      "auth/invalid-credential": "ایمیل یا رمز عبور اشتباه است.",
      "auth/too-many-requests": "تعداد تلاش‌ها زیاد بود، کمی صبر کنید."
    };
    return map[code] || "خطایی رخ داد، دوباره تلاش کنید.";
  }

  function handleSubmit() {
    const email = els.emailInput.value.trim();
    const password = els.passwordInput.value;

    if (!email || !password) {
      setMsg(els.msg, "ایمیل و رمز عبور رو وارد کن.", true);
      return;
    }

    els.submitBtn.disabled = true;
    setMsg(els.msg, "در حال پردازش...", false);

    const task = mode === "signup"
      ? window.Auth.signUp(email, password, els.nameInput.value.trim())
      : window.Auth.logIn(email, password);

    task
      .then(() => {
        setMsg(els.msg, mode === "signup" ? "✅ ثبت‌نام شد! ایمیل تایید ارسال شد." : "✅ وارد شدی.", false);
        els.emailInput.value = "";
        els.passwordInput.value = "";
      })
      .catch((e) => setMsg(els.msg, "❌ " + translateError(e.code), true))
      .finally(() => { els.submitBtn.disabled = false; });
  }

  function handleForgot() {
    const email = els.emailInput.value.trim();
    if (!email) {
      setMsg(els.msg, "اول ایمیلت رو بالا بنویس، بعد بزن رو «فراموشی رمز».", true);
      return;
    }
    window.Auth.resetPassword(email)
      .then(() => setMsg(els.msg, "✅ لینک بازیابی رمز به ایمیلت ارسال شد.", false))
      .catch((e) => setMsg(els.msg, "❌ " + translateError(e.code), true));
  }

  function handleResend() {
    window.Auth.resendVerification()
      .then(() => setMsg(els.msg2, "✅ ایمیل تایید دوباره ارسال شد.", false))
      .catch((e) => setMsg(els.msg2, "❌ " + (e.message || "خطا در ارسال."), true));
  }

  function handleLogout() {
    window.Auth.logOut();
  }

  function renderAuthState(state) {
    if (!els.trigger) return;

    if (state.user) {
      const name = (state.profile && state.profile.displayName) || state.user.email;
      els.trigger.textContent = "👤 " + name;
      els.loggedOutArea.style.display = "none";
      els.loggedInArea.style.display = "block";

      els.statusText.innerHTML = state.verified
        ? "✅ ایمیلت تایید شده — می‌تونی توی چت پیام بفرستی."
        : "⚠️ ایمیلت هنوز تایید نشده. لطفاً صندوق ورودی (و اسپم) رو چک کن.";
      els.resendBtn.style.display = state.verified ? "none" : "block";
    } else {
      els.trigger.textContent = "👤 ورود";
      els.loggedOutArea.style.display = "block";
      els.loggedInArea.style.display = "none";
    }
  }

  function init() {
    buildDom();
    window.Auth.onAuthChange(renderAuthState);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
