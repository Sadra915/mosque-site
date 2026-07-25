/* =========================================================
   ماژول مدیریت کاربران (برای admin-chat-only.html)
   نیازمند: یک fbDb متصل که از بیرون صدا زده می‌شود
   ========================================================= */

(function () {

  let fbDb = null;
  let usersCache = {};
  let bansCache = {};

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function injectPanel() {
    const host = document.getElementById("usersAdminHost");
    if (!host) return;
    host.innerHTML = `
      <div class="panel">
        <h3>👥 کاربران ثبت‌نام‌شده</h3>
        <div id="usersList" class="hint">در حال بارگذاری...</div>
      </div>
    `;
  }

  function connect(existingDb) {
    fbDb = existingDb;
    injectPanel();
    fbDb.ref("users").on("value", (snap) => {
      usersCache = snap.val() || {};
      render();
    });
    fbDb.ref("chat/bans").on("value", (snap) => {
      bansCache = snap.val() || {};
      render();
    });
  }

  function badgeLabel(badge) {
    if (badge === "verified") return "🔵 تیک آبی";
    if (badge === "vip") return "⭐ VIP";
    return "بدون نشان";
  }

  function render() {
    const box = document.getElementById("usersList");
    if (!box) return;

    const entries = Object.entries(usersCache).sort((a, b) => (b[1].joinedAt || 0) - (a[1].joinedAt || 0));

    if (entries.length === 0) {
      box.innerHTML = '<p class="hint">هنوز کاربری ثبت‌نام نکرده.</p>';
      return;
    }

    box.innerHTML = "";
    entries.forEach(([uid, u]) => {
      const joined = u.joinedAt ? new Date(u.joinedAt).toLocaleDateString("fa-IR") : "-";
      const ban = bansCache[uid];
      const banStatus = ban
        ? (ban.type === "permanent" ? "🚫 مسدود (دائم)" : "🚫 مسدود (موقت)")
        : "✅ آزاد";

      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="chat-mod-item">
          <div class="chat-mod-text">
            <span class="chat-mod-name">${escapeHtml(u.displayName || "بی‌نام")}</span>
            <span class="hint"> — عضویت: ${joined} — ${banStatus}</span>
            <div class="hint">شناسه: ${escapeHtml(uid)}</div>
            <div class="hint">نشان فعلی: ${badgeLabel(u.badge)}</div>
          </div>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <select id="badgeSel_${uid}" style="width:auto;">
            <option value="" ${!u.badge ? "selected" : ""}>بدون نشان</option>
            <option value="verified" ${u.badge === "verified" ? "selected" : ""}>🔵 تیک آبی</option>
            <option value="vip" ${u.badge === "vip" ? "selected" : ""}>⭐ VIP</option>
          </select>
          <button onclick="UsersAdmin.setBadge('${uid}', document.getElementById('badgeSel_${uid}').value)">💾 اعمال نشان</button>
          ${ban
            ? `<button class="danger" onclick="UsersAdmin.unban('${uid}')">✅ رفع مسدودی</button>`
            : `<button class="danger" onclick="UsersAdmin.ban('${uid}')">🚫 مسدود کردن</button>`}
        </div>
      `;
      box.appendChild(item);
    });
  }

  function setBadge(uid, badge) {
    fbDb.ref("users/" + uid + "/badge").set(badge || null);
  }

  function ban(uid) {
    if (!confirm("این کاربر مسدود شود؟ (دائمی)")) return;
    fbDb.ref("chat/bans/" + uid).set({ type: "permanent", time: Date.now() });
  }

  function unban(uid) {
    fbDb.ref("chat/bans/" + uid).remove();
  }

  window.UsersAdmin = { connect, setBadge, ban, unban };

})();
