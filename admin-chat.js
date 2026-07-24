/* =========================================================
   ماژول مدیریت چت (برای admin.html)
   نیازمند: config.js + firebase-app/database compat + یک fbDb متصل
   ========================================================= */

(function () {

  let fbDb = null;
  let chatSettings = {};
  let chatMessagesCache = {};

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function injectPanel() {
    const host = document.getElementById("chatAdminHost");
    if (!host) return;
    host.innerHTML = `
      <div class="panel">
        <h3>💬 مدیریت چت آنلاین</h3>

        <div style="display:flex;gap:20px;flex-wrap:wrap;margin-bottom:10px;">
          <label style="display:flex;align-items:center;gap:6px;">
            <input type="checkbox" id="chatEnabledChk"> چت روشن باشد
          </label>
          <span id="chatOnlineCount" class="hint"></span>
        </div>

        <label>حالت چت</label>
        <select id="chatModeSelect">
          <option value="normal">عادی — همه می‌توانند بنویسند</option>
          <option value="readonly">فقط‌خواندنی — کسی نمی‌تواند بنویسد</option>
          <option value="adminOnly">فقط مدیر — کاربران فقط می‌خوانند</option>
        </select>

        <label style="margin-top:10px;display:flex;align-items:center;gap:6px;">
          <input type="checkbox" id="chatScheduleChk"> محدود کردن چت به یک بازه زمانی روزانه
        </label>
        <div class="row">
          <div><label>ساعت شروع</label><input type="time" id="chatScheduleStart" value="18:00"></div>
          <div><label>ساعت پایان</label><input type="time" id="chatScheduleEnd" value="22:00"></div>
        </div>

        <label style="margin-top:10px;">بنر اطلاعیه بالای چت</label>
        <input id="chatBannerInput" placeholder="مثلاً: امشب ساعت ۹ بروزرسانی انجام می‌شود">

        <label style="margin-top:10px;">لیست کلمات ممنوعه (با کاما جدا کنید)</label>
        <textarea id="chatBannedWordsInput" placeholder="کلمه۱, کلمه۲"></textarea>

        <button onclick="ChatAdmin.saveSettings()">💾 ذخیره تنظیمات چت</button>
        <div class="msg" id="chatSettingsMsg"></div>
      </div>

      <div class="panel">
        <h3>📢 ارسال پیام مدیریت</h3>
        <textarea id="chatBroadcastInput" placeholder="متن پیام رسمی..."></textarea>
        <label style="display:flex;align-items:center;gap:6px;margin-top:6px;">
          <input type="checkbox" id="chatBroadcastPin"> سنجاق شود (Pin)
        </label>
        <button onclick="ChatAdmin.sendBroadcast()">📨 ارسال پیام همگانی</button>
        <div class="msg" id="chatBroadcastMsg"></div>
      </div>

      <div class="panel">
        <h3>📌 پیام سنجاق‌شده فعلی</h3>
        <div id="chatPinnedCurrent" class="hint">چیزی سنجاق نشده.</div>
      </div>

      <div class="panel">
        <h3>🗨 پیام‌های اخیر چت</h3>
        <button class="danger" onclick="ChatAdmin.deleteAllMessages()">🗑 حذف همه پیام‌ها</button>
        <div id="chatMessagesList" style="margin-top:10px;"></div>
      </div>

      <div class="panel">
        <h3>🚫 کاربران مسدود (Ban)</h3>
        <div id="chatBansList" class="hint">کسی مسدود نیست.</div>
      </div>
    `;
  }

  function connect(existingDb) {
    fbDb = existingDb;
    injectPanel();
    listenSettings();
    listenPresence();
    listenMessages();
    listenBans();
  }

  function listenSettings() {
    fbDb.ref("chat/settings").on("value", snap => {
      chatSettings = snap.val() || {};
      document.getElementById("chatEnabledChk").checked = chatSettings.enabled !== false;
      document.getElementById("chatModeSelect").value = chatSettings.mode || "normal";
      document.getElementById("chatScheduleChk").checked = !!chatSettings.scheduleEnabled;
      document.getElementById("chatScheduleStart").value = chatSettings.scheduleStart || "18:00";
      document.getElementById("chatScheduleEnd").value = chatSettings.scheduleEnd || "22:00";
      document.getElementById("chatBannerInput").value = chatSettings.banner || "";
      document.getElementById("chatBannedWordsInput").value = (chatSettings.bannedWords || []).join(", ");
      renderPinnedCurrent();
    });
  }

  function listenPresence() {
    fbDb.ref("chat/presence").on("value", snap => {
      document.getElementById("chatOnlineCount").textContent = "🟢 " + snap.numChildren() + " کاربر آنلاین در چت";
    });
  }

  function listenMessages() {
    fbDb.ref("chat/messages").limitToLast(150).on("value", snap => {
      chatMessagesCache = snap.val() || {};
      renderMessagesList();
      renderPinnedCurrent();
    });
  }

  function listenBans() {
    fbDb.ref("chat/bans").on("value", snap => {
      renderBansList(snap.val() || {});
    });
  }

  function renderMessagesList() {
    const box = document.getElementById("chatMessagesList");
    if (!box) return;
    const entries = Object.entries(chatMessagesCache).sort((a, b) => (b[1].time || 0) - (a[1].time || 0));

    if (entries.length === 0) {
      box.innerHTML = '<p class="hint">هنوز پیامی در چت نیست.</p>';
      return;
    }

    box.innerHTML = "";
    entries.forEach(([id, m]) => {
      const item = document.createElement("div");
      item.className = "item";
      const time = m.time ? new Date(m.time).toLocaleString("fa-IR") : "";
      item.innerHTML = `
        <div class="chat-mod-item">
          <div class="chat-mod-text">
            <span class="chat-mod-name">${escapeHtml(m.name || "ناشناس")}</span>
            <span class="hint">${time}</span>
            <div>${escapeHtml(m.text || (m.imageData ? "[عکس]" : ""))}</div>
          </div>
        </div>
        <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
          <button onclick="ChatAdmin.pinMessage('${id}')">📌 پین</button>
          <button class="danger" onclick="ChatAdmin.deleteMessage('${id}')">🗑 حذف پیام</button>
          <button class="danger" onclick="ChatAdmin.deleteUserMessages('${m.uid}')">🗑 حذف همه پیام‌های این کاربر</button>
          <select id="banDur_${id}" style="width:auto;">
            <option value="10">۱۰ دقیقه</option>
            <option value="60">۱ ساعت</option>
            <option value="1440">۲۴ ساعت</option>
            <option value="perm">دائمی</option>
          </select>
          <button class="danger" onclick="ChatAdmin.banUser('${m.uid}', document.getElementById('banDur_${id}').value)">🚫 بن کردن این کاربر</button>
        </div>
      `;
      box.appendChild(item);
    });
  }

  function renderPinnedCurrent() {
    const el = document.getElementById("chatPinnedCurrent");
    if (!el) return;
    const pid = chatSettings.pinnedMessageId;
    const m = pid && chatMessagesCache[pid];
    if (!m) { el.innerHTML = "چیزی سنجاق نشده."; return; }
    el.innerHTML = `📌 <b>${escapeHtml(m.name)}</b>: ${escapeHtml(m.text || "")}
      <button onclick="ChatAdmin.unpin()">✕ برداشتن سنجاق</button>`;
  }

  function renderBansList(bans) {
    const el = document.getElementById("chatBansList");
    if (!el) return;
    const entries = Object.entries(bans);
    if (entries.length === 0) { el.innerHTML = "کسی مسدود نیست."; return; }
    el.innerHTML = "";
    entries.forEach(([buid, b]) => {
      const row = document.createElement("div");
      row.className = "item";
      const until = b.type === "permanent" ? "دائمی" : new Date(b.until).toLocaleString("fa-IR");
      row.innerHTML = `
        <div class="status">شناسه کاربر: ${escapeHtml(buid)}<br>نوع: ${b.type === "permanent" ? "دائمی" : "موقت تا " + until}</div>
        <button onclick="ChatAdmin.unban('${buid}')">✅ رفع مسدودی</button>
      `;
      el.appendChild(row);
    });
  }

  /* ---------- اکشن‌ها ---------- */
  function saveSettings() {
    const msg = document.getElementById("chatSettingsMsg");
    const bannedWords = document.getElementById("chatBannedWordsInput").value
      .split(",").map(w => w.trim()).filter(Boolean);

    const data = {
      enabled: document.getElementById("chatEnabledChk").checked,
      mode: document.getElementById("chatModeSelect").value,
      scheduleEnabled: document.getElementById("chatScheduleChk").checked,
      scheduleStart: document.getElementById("chatScheduleStart").value || "18:00",
      scheduleEnd: document.getElementById("chatScheduleEnd").value || "22:00",
      banner: document.getElementById("chatBannerInput").value.trim(),
      bannedWords,
      pinnedMessageId: chatSettings.pinnedMessageId || ""
    };

    fbDb.ref("chat/settings").update(data)
      .then(() => { msg.textContent = "✅ ذخیره شد"; msg.className = "msg ok"; })
      .catch(e => { msg.textContent = "❌ " + e.message; msg.className = "msg err"; });
  }

  function sendBroadcast() {
    const msg = document.getElementById("chatBroadcastMsg");
    const text = document.getElementById("chatBroadcastInput").value.trim();
    if (!text) return;
    const pin = document.getElementById("chatBroadcastPin").checked;

    const payload = { name: "مدیریت", uid: "admin", text, time: Date.now(), isAdmin: true };
    fbDb.ref("chat/messages").push(payload)
      .then(ref => {
        if (pin) return fbDb.ref("chat/settings/pinnedMessageId").set(ref.key);
      })
      .then(() => {
        document.getElementById("chatBroadcastInput").value = "";
        msg.textContent = "✅ ارسال شد";
        msg.className = "msg ok";
      })
      .catch(e => { msg.textContent = "❌ " + e.message; msg.className = "msg err"; });
  }

  function pinMessage(id) {
    fbDb.ref("chat/settings/pinnedMessageId").set(id);
  }

  function unpin() {
    fbDb.ref("chat/settings/pinnedMessageId").set("");
  }

  function deleteMessage(id) {
    if (!confirm("این پیام حذف شود؟")) return;
    fbDb.ref("chat/messages/" + id).remove();
  }

  function deleteAllMessages() {
    if (!confirm("همه پیام‌های چت برای همیشه حذف شوند؟")) return;
    fbDb.ref("chat/messages").remove();
  }

  function deleteUserMessages(targetUid) {
    if (!targetUid) return;
    if (!confirm("همه پیام‌های این کاربر حذف شوند؟")) return;
    Object.entries(chatMessagesCache)
      .filter(([id, m]) => m.uid === targetUid)
      .forEach(([id]) => fbDb.ref("chat/messages/" + id).remove());
  }

  function banUser(targetUid, durationVal) {
    if (!targetUid) return;
    if (!confirm("این کاربر مسدود شود؟")) return;
    let data;
    if (durationVal === "perm") {
      data = { type: "permanent", time: Date.now() };
    } else {
      const minutes = parseInt(durationVal, 10);
      data = { type: "temp", until: Date.now() + minutes * 60000, time: Date.now() };
    }
    fbDb.ref("chat/bans/" + targetUid).set(data);
  }

  function unban(targetUid) {
    fbDb.ref("chat/bans/" + targetUid).remove();
  }

  window.ChatAdmin = {
    connect, saveSettings, sendBroadcast, pinMessage, unpin,
    deleteMessage, deleteAllMessages, deleteUserMessages, banUser, unban
  };

})();
