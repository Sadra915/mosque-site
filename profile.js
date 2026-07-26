/* =========================================================
   پروفایل کاربری - مسجد محله
   یوزرنیم دائمی، بایو، تاریخ عضویت، نشان (تیک آبی / VIP) با انیمیشن
   نیازمند: auth.js (قبل از این فایل لود شود)
   قدم ۶ از مستند طراحی فاز جدید
   ========================================================= */

(function () {

  let db = null;
  let els = {};
  let viewingUid = null;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function ensureDb() {
    if (!db) db = firebase.database();
    return db;
  }

  function myUid() {
    return window.AUTH_STATE && window.AUTH_STATE.user ? window.AUTH_STATE.user.uid : null;
  }

  function isVerifiedAccount() {
    return !!(window.AUTH_STATE && window.AUTH_STATE.user && window.AUTH_STATE.verified);
  }

  /* ---------- نشان‌ها (قابل استفاده در همه‌جای سایت) ---------- */
  function badgeHtml(badge, size) {
    size = size || "normal";
    if (badge === "verified") {
      return `<span class="pf-badge pf-badge-verified pf-badge-${size}" title="تیک آبی">
        <svg viewBox="0 0 24 24" class="pf-badge-icon"><path d="M12 2l2.4 2.1 3.1-.6 1 3 2.9 1.4-.6 3.1L23 14l-2.2 2.4.6 3.1-2.9 1.4-1 3-3.1-.6L12 26l-2.4-2.1-3.1.6-1-3-2.9-1.4.6-3.1L1 14l2.2-2.4-.6-3.1 2.9-1.4 1-3 3.1.6z" transform="translate(0,-2)"/><path d="M8.5 12.5l2.5 2.5 5-5.5" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </span>`;
    }
    if (badge === "vip") {
      return `<span class="pf-badge pf-badge-vip pf-badge-${size}" title="VIP">⭐ VIP</span>`;
    }
    return "";
  }

  function badgeLongLabel(badge) {
    if (badge === "verified") return "✅ این حساب توسط مدیریت تایید شده (تیک آبی)";
    if (badge === "vip") return "⭐ این کاربر عضو ویژه (VIP) مسجد محله است";
    return "";
  }

  /* ---------- DOM ---------- */
  function buildDom() {
    const root = document.createElement("div");
    root.innerHTML = `
      <div id="pfPanel" class="pf-panel">
        <div class="pf-head">
          <button id="pfClose" class="chat-icon-btn">→</button>
          <div class="pf-head-title">پروفایل</div>
        </div>
        <div class="pf-body chat-scroll" id="pfBody"></div>
      </div>
    `;
    document.body.appendChild(root);

    els = {
      panel: document.getElementById("pfPanel"),
      close: document.getElementById("pfClose"),
      body: document.getElementById("pfBody"),
    };

    els.close.onclick = closePanel;
  }

  function openPanel() {
    els.panel.classList.add("open");
    document.body.classList.add("chat-open");
  }

  function closePanel() {
    els.panel.classList.remove("open");
    document.body.classList.remove("chat-open");
  }

  /* ---------- باز کردن پروفایل یک کاربر ---------- */
  function open(uid) {
    if (!uid) return;
    viewingUid = uid;
    openPanel();
    els.body.innerHTML = '<p class="hint" style="text-align:center;">در حال بارگذاری...</p>';

    ensureDb().ref("users/" + uid).once("value").then((snap) => {
      const profile = snap.val() || {};
      render(uid, profile);
    });
  }

  function joinedDateLabel(ts) {
    if (!ts) return "-";
    return new Date(ts).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });
  }

  function render(uid, profile) {
    const isMine = uid === myUid();
    const initial = (profile.displayName || "?").charAt(0);
    const badge = profile.badge || null;

    els.body.innerHTML = `
      <div class="pf-avatar-wrap">
        <div class="pf-avatar ${badge === "vip" ? "pf-avatar-vip" : ""}">${escapeHtml(initial)}</div>
        ${badge ? badgeHtml(badge, "large") : ""}
      </div>

      <div class="pf-name">${escapeHtml(profile.displayName || "کاربر")}</div>
      ${profile.username ? `<div class="pf-username">@${escapeHtml(profile.username)}</div>` : ""}
      ${badge ? `<div class="pf-badge-note">${badgeLongLabel(badge)}</div>` : ""}

      <div class="pf-field">
        <label>درباره</label>
        <div class="pf-bio" id="pfBioView">${escapeHtml(profile.bio || (isMine ? "چیزی درباره‌ی خودت ننوشتی." : "چیزی نوشته نشده."))}</div>
      </div>

      <div class="pf-field">
        <label>تاریخ عضویت</label>
        <div>${joinedDateLabel(profile.joinedAt)}</div>
      </div>

      ${isMine ? renderOwnControls(profile) : ""}
    `;

    if (isMine) wireOwnControls(profile);
  }

  /* ---------- کنترل‌های ویژه‌ی پروفایل خودم ---------- */
  function renderOwnControls(profile) {
    return `
      <div class="pf-divider"></div>

      ${!profile.username ? `
        <div class="pf-field">
          <label>انتخاب یوزرنیم (فقط یک بار، غیرقابل تغییر بعداً)</label>
          <input id="pfUsernameInput" placeholder="مثلاً sadra_915" maxlength="20">
          <button id="pfUsernameSave" class="pf-btn">ثبت یوزرنیم</button>
          <div class="msg" id="pfUsernameMsg"></div>
        </div>
      ` : `
        <div class="pf-field">
          <div class="hint">یوزرنیمت (<b>@${escapeHtml(profile.username)}</b>) ثبت شده و دیگه قابل تغییر نیست.</div>
        </div>
      `}

      <div class="pf-field">
        <label>ویرایش نام نمایشی</label>
        <input id="pfNameInput" value="${escapeHtml(profile.displayName || "")}" maxlength="30">
      </div>

      <div class="pf-field">
        <label>ویرایش «درباره»</label>
        <textarea id="pfBioInput" maxlength="200" placeholder="چند خط درباره‌ی خودت...">${escapeHtml(profile.bio || "")}</textarea>
      </div>

      <button id="pfSaveBtn" class="pf-btn">💾 ذخیره تغییرات</button>
      <div class="msg" id="pfSaveMsg"></div>
    `;
  }

  function wireOwnControls(profile) {
    const usernameBtn = document.getElementById("pfUsernameSave");
    if (usernameBtn) {
      usernameBtn.onclick = () => claimUsername(document.getElementById("pfUsernameInput").value.trim());
    }

    const saveBtn = document.getElementById("pfSaveBtn");
    if (saveBtn) {
      saveBtn.onclick = saveProfileEdits;
    }
  }

  function normalizeUsername(raw) {
    return raw.toLowerCase().replace(/[^a-z0-9_]/g, "");
  }

  function claimUsername(raw) {
    const msg = document.getElementById("pfUsernameMsg");
    const uid = myUid();
    if (!uid) return;

    const username = normalizeUsername(raw);
    if (username.length < 3 || username.length > 20) {
      msg.textContent = "❌ یوزرنیم باید بین ۳ تا ۲۰ کاراکتر (فقط حروف انگلیسی، عدد، _) باشه.";
      msg.className = "msg err";
      return;
    }

    msg.textContent = "در حال بررسی...";
    msg.className = "msg";

    ensureDb().ref("usernames/" + username).once("value").then((snap) => {
      if (snap.exists()) {
        msg.textContent = "❌ این یوزرنیم قبلاً گرفته شده.";
        msg.className = "msg err";
        return;
      }

      const updates = {};
      updates["usernames/" + username] = uid;
      updates["users/" + uid + "/username"] = username;

      return ensureDb().ref().update(updates).then(() => {
        msg.textContent = "✅ یوزرنیم ثبت شد!";
        msg.className = "msg ok";
        setTimeout(() => open(uid), 800);
      });
    }).catch((e) => {
      msg.textContent = "❌ " + e.message;
      msg.className = "msg err";
    });
  }

  function saveProfileEdits() {
    const msg = document.getElementById("pfSaveMsg");
    const uid = myUid();
    if (!uid) return;

    const displayName = document.getElementById("pfNameInput").value.trim().slice(0, 30) || "کاربر";
    const bio = document.getElementById("pfBioInput").value.trim().slice(0, 200);

    ensureDb().ref("users/" + uid).update({ displayName, bio })
      .then(() => {
        msg.textContent = "✅ ذخیره شد.";
        msg.className = "msg ok";
      })
      .catch((e) => {
        msg.textContent = "❌ " + e.message;
        msg.className = "msg err";
      });
  }

  window.Profile = { open, badgeHtml };

  function init() {
    buildDom();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
