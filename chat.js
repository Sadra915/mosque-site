/* =========================================================
   ویجت چت آنلاین - مسجد محله
   دکمه شناور + پنجره کشویی، همگام‌سازی با Firebase Realtime DB
   نیازمند: config.js (قبل از این فایل لود شود)
   ========================================================= */

(function () {

  const CFG = window.CHAT_CONFIG;
  let db = null;

  /* ---------- هویت محلی کاربر (بدون سرور) ---------- */
  function uuid() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return "u-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function getUid() {
    let uid = localStorage.getItem("chatUid");
    if (!uid) {
      uid = uuid();
      localStorage.setItem("chatUid", uid);
    }
    return uid;
  }

  function getName() {
    return localStorage.getItem("chatNickname") || "ناشناس";
  }

  function setName(n) {
    localStorage.setItem("chatNickname", n.slice(0, 20));
  }

  const uid = getUid();

  /* ---------- تنظیمات کاربر (محلی) ---------- */
  const prefs = {
    get soundOn() { return localStorage.getItem("chatSound") !== "off"; },
    set soundOn(v) { localStorage.setItem("chatSound", v ? "on" : "off"); },
    get notifOn() { return localStorage.getItem("chatNotif") !== "off"; },
    set notifOn(v) { localStorage.setItem("chatNotif", v ? "on" : "off"); },
    get fontSize() { return localStorage.getItem("chatFontSize") || "14"; },
    set fontSize(v) { localStorage.setItem("chatFontSize", v); }
  };

  /* ---------- وضعیت زمان اجرا ---------- */
  const state = {
    settings: { enabled: true, mode: "normal", scheduleEnabled: false, scheduleStart: "18:00", scheduleEnd: "22:00", banner: "", bannedWords: [], pinnedMessageId: "" },
    bans: {},
    messages: {},          // id -> message
    onlineCount: 0,
    panelOpen: false,
    settingsOpen: false,
    pageSize: CFG.messagesPerPage,
    replyTarget: null,
    editTarget: null,
    lastSeenTime: Number(localStorage.getItem("chatLastSeen") || 0),
    unread: 0,
    lastSentTimestamps: [],
    typingClearTimer: null
  };

  /* ---------- ابزار ---------- */
  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function fmtTime(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  }

  function beep(freq, time) {
    try {
      const audioCtx = window.__chatAudioCtx || (window.__chatAudioCtx = new (window.AudioContext || window.webkitAudioContext)());
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.connect(g); g.connect(audioCtx.destination);
      o.frequency.value = freq;
      g.gain.value = .05;
      o.start();
      o.stop(audioCtx.currentTime + (time || .08));
    } catch (e) {}
  }

  function playNotifySound() {
    if (!prefs.soundOn) return;
    beep(900, .06);
    setTimeout(() => beep(1300, .09), 80);
  }

  function ensureFirebase() {
    if (!db) {
      if (!firebase.apps.length) firebase.initializeApp(CFG.firebase);
      db = firebase.database();
    }
    return db;
  }

  /* ---------- ساخت DOM ---------- */
  let els = {};

  function buildDom() {
    const root = document.createElement("div");
    root.innerHTML = `
      <div id="chatFab">
        <span class="fab-online-dot"></span>
        <span>💬 گفت‌وگوی آنلاین</span>
        <span id="chatOnlineText">🟢 -</span>
        <span class="fab-badge" id="chatUnreadBadge">0</span>
      </div>

      <div id="chatPanel">
        <div class="chat-head">
          <div class="chat-head-title">💬 گفت‌وگوی آنلاین <span id="chatHeadOnline" style="font-weight:normal;font-size:11px;opacity:.7;"></span></div>
          <div class="chat-head-actions">
            <button class="chat-icon-btn" id="chatSettingsBtn" title="تنظیمات">⚙️</button>
            <button class="chat-icon-btn" id="chatCloseBtn" title="بستن">✕</button>
          </div>
        </div>

        <div class="chat-banner" id="chatBanner"></div>
        <div class="chat-pinned" id="chatPinned">
          <div class="chat-pinned-text" id="chatPinnedText"></div>
        </div>

        <div class="chat-search-row">
          <input id="chatSearchInput" placeholder="🔍 جستجو در پیام‌ها...">
        </div>

        <div class="chat-body chat-scroll" id="chatBody"></div>
        <div class="chat-typing" id="chatTypingLine"></div>

        <div class="chat-reply-preview" id="chatReplyPreview">
          <span id="chatReplyText"></span>
          <span id="chatReplyCancel" style="cursor:pointer;">✕</span>
        </div>

        <div class="chat-settings-panel" id="chatSettingsPanel">
          <div class="chat-name-row">
            <label style="font-size:12px;opacity:.8;">نام نمایشی شما</label>
            <input id="chatNameInput" maxlength="20" placeholder="نام شما">
          </div>
          <div class="chat-settings-row">
            <span>🔊 صدای پیام جدید</span>
            <div class="chat-toggle" id="toggleSound"><div class="knob"></div></div>
          </div>
          <div class="chat-settings-row">
            <span>🔔 اعلان مرورگر</span>
            <div class="chat-toggle" id="toggleNotif"><div class="knob"></div></div>
          </div>
          <div class="chat-settings-row">
            <span>🔤 اندازه فونت</span>
            <select id="fontSizeSelect">
              <option value="12">کوچک</option>
              <option value="14">متوسط</option>
              <option value="17">بزرگ</option>
            </select>
          </div>
          <button class="chat-icon-btn" style="width:auto;padding:0 12px;" id="chatSettingsBackBtn">بازگشت به چت</button>
        </div>

        <div class="chat-status-line" id="chatStatusLine"></div>

        <div class="chat-footer" id="chatFooter">
          <div class="chat-compose-row">
            <label class="chat-icon-btn" title="ارسال عکس" style="display:flex;">
              🖼
              <input type="file" id="chatImageInput" accept="image/*" style="display:none;">
            </label>
            <textarea id="chatTextInput" rows="1" placeholder="پیام خود را بنویسید..."></textarea>
            <button id="chatSendBtn">📨</button>
          </div>
        </div>

        <div class="chat-notice" id="chatNotice" style="display:none;"></div>
      </div>

      <div id="chatLightbox"><img id="chatLightboxImg"></div>
    `;
    document.body.appendChild(root);

    els = {
      fab: document.getElementById("chatFab"),
      onlineText: document.getElementById("chatOnlineText"),
      unreadBadge: document.getElementById("chatUnreadBadge"),
      panel: document.getElementById("chatPanel"),
      headOnline: document.getElementById("chatHeadOnline"),
      settingsBtn: document.getElementById("chatSettingsBtn"),
      closeBtn: document.getElementById("chatCloseBtn"),
      banner: document.getElementById("chatBanner"),
      pinned: document.getElementById("chatPinned"),
      pinnedText: document.getElementById("chatPinnedText"),
      searchInput: document.getElementById("chatSearchInput"),
      body: document.getElementById("chatBody"),
      typingLine: document.getElementById("chatTypingLine"),
      replyPreview: document.getElementById("chatReplyPreview"),
      replyText: document.getElementById("chatReplyText"),
      replyCancel: document.getElementById("chatReplyCancel"),
      settingsPanel: document.getElementById("chatSettingsPanel"),
      nameInput: document.getElementById("chatNameInput"),
      toggleSound: document.getElementById("toggleSound"),
      toggleNotif: document.getElementById("toggleNotif"),
      fontSizeSelect: document.getElementById("fontSizeSelect"),
      settingsBackBtn: document.getElementById("chatSettingsBackBtn"),
      statusLine: document.getElementById("chatStatusLine"),
      footer: document.getElementById("chatFooter"),
      imageInput: document.getElementById("chatImageInput"),
      textInput: document.getElementById("chatTextInput"),
      sendBtn: document.getElementById("chatSendBtn"),
      notice: document.getElementById("chatNotice"),
      lightbox: document.getElementById("chatLightbox"),
      lightboxImg: document.getElementById("chatLightboxImg")
    };

    wireEvents();
    applyPrefsToUi();
  }

  function applyPrefsToUi() {
    els.nameInput.value = getName();
    els.toggleSound.classList.toggle("on", prefs.soundOn);
    els.toggleNotif.classList.toggle("on", prefs.notifOn);
    els.fontSizeSelect.value = prefs.fontSize;
    document.documentElement.style.setProperty("--chat-font-size", prefs.fontSize + "px");
  }

  function wireEvents() {
    els.fab.onclick = openPanel;
    els.closeBtn.onclick = closePanel;

    els.settingsBtn.onclick = () => {
      state.settingsOpen = true;
      els.settingsPanel.classList.add("show");
    };
    els.settingsBackBtn.onclick = () => {
      state.settingsOpen = false;
      els.settingsPanel.classList.remove("show");
    };

    els.nameInput.onchange = () => setName(els.nameInput.value.trim() || "ناشناس");
    els.toggleSound.onclick = () => { prefs.soundOn = !prefs.soundOn; applyPrefsToUi(); };
    els.toggleNotif.onclick = () => {
      prefs.notifOn = !prefs.notifOn;
      if (prefs.notifOn && "Notification" in window && Notification.permission === "default") {
        Notification.requestPermission();
      }
      applyPrefsToUi();
    };
    els.fontSizeSelect.onchange = () => {
      prefs.fontSize = els.fontSizeSelect.value;
      applyPrefsToUi();
    };

    els.sendBtn.onclick = sendMessage;
    els.textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
    els.textInput.addEventListener("input", () => {
      autoGrow();
      handleTyping();
    });

    els.replyCancel.onclick = () => setReplyTarget(null);

    els.imageInput.onchange = handleImagePick;

    els.searchInput.addEventListener("input", () => renderMessages());

    els.lightbox.onclick = () => els.lightbox.classList.remove("show");

    els.body.addEventListener("scroll", () => {
      if (els.body.scrollTop < 30) maybeLoadMore();
    });
  }

  function autoGrow() {
    els.textInput.style.height = "auto";
    els.textInput.style.height = Math.min(90, els.textInput.scrollHeight) + "px";
  }

  function openPanel() {
    state.panelOpen = true;
    els.panel.classList.add("open");
    state.unread = 0;
    updateUnreadBadge();
    state.lastSeenTime = Date.now();
    localStorage.setItem("chatLastSeen", String(state.lastSeenTime));
    setTimeout(() => { els.body.scrollTop = els.body.scrollHeight; }, 50);
    if (prefs.notifOn && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }

  function closePanel() {
    state.panelOpen = false;
    els.panel.classList.remove("open");
  }

  function updateUnreadBadge() {
    els.unreadBadge.textContent = state.unread > 99 ? "99+" : String(state.unread);
    els.unreadBadge.classList.toggle("show", state.unread > 0);
  }

  /* ---------- زمان‌بندی و حالت چت ---------- */
  function isWithinSchedule(s) {
    if (!s.scheduleEnabled) return true;
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const [sh, sm] = (s.scheduleStart || "00:00").split(":").map(Number);
    const [eh, em] = (s.scheduleEnd || "23:59").split(":").map(Number);
    const startMin = sh * 60 + sm, endMin = eh * 60 + em;
    if (startMin <= endMin) return nowMin >= startMin && nowMin < endMin;
    return nowMin >= startMin || nowMin < endMin; // بازه شبانه (رد شونده از نیمه‌شب)
  }

  function getBanInfo() {
    const b = state.bans[uid];
    if (!b) return null;
    if (b.type === "permanent") return b;
    if (b.type === "temp" && b.until && Date.now() < b.until) return b;
    return null;
  }

  function computeAvailability() {
    const s = state.settings;
    if (!s.enabled) return { ok: false, notice: CFG.messages.disabled };
    if (!isWithinSchedule(s)) return { ok: false, notice: CFG.messages.outsideSchedule };
    const ban = getBanInfo();
    if (ban) {
      const extra = ban.type === "permanent" ? "" : ` (تا ${new Date(ban.until).toLocaleString("fa-IR")})`;
      return { ok: false, canRead: true, notice: CFG.messages.banned + extra };
    }
    if (s.mode === "readonly") return { ok: false, canRead: true, notice: CFG.messages.readonly };
    if (s.mode === "adminOnly") return { ok: false, canRead: true, notice: CFG.messages.adminOnly };
    return { ok: true };
  }

  function refreshAvailabilityUi() {
    const avail = computeAvailability();
    if (avail.ok) {
      els.footer.style.display = "";
      els.notice.style.display = "none";
    } else if (avail.canRead) {
      els.footer.style.display = "none";
      els.notice.style.display = "block";
      els.notice.textContent = avail.notice;
      els.notice.style.position = "static";
    } else {
      els.footer.style.display = "none";
      els.body.style.display = "none";
      els.notice.style.display = "flex";
      els.notice.style.flex = "1";
      els.notice.textContent = avail.notice;
    }
    if (avail.ok || avail.canRead) els.body.style.display = "flex";

    els.banner.textContent = s_banner();
    els.banner.classList.toggle("show", !!s_banner());
  }

  function s_banner() { return (state.settings.banner || "").trim(); }

  /* ---------- فایربیس: تنظیمات، بن‌ها، حضور، پیام‌ها ---------- */
  function listenSettings() {
    ensureFirebase().ref("chat/settings").on("value", (snap) => {
      const v = snap.val() || {};
      state.settings = Object.assign({
        enabled: true, mode: "normal", scheduleEnabled: false,
        scheduleStart: "18:00", scheduleEnd: "22:00", banner: "", bannedWords: [], pinnedMessageId: ""
      }, v);
      refreshAvailabilityUi();
      renderPinned();
    });
  }

  function listenBans() {
    ensureFirebase().ref("chat/bans").on("value", (snap) => {
      state.bans = snap.val() || {};
      refreshAvailabilityUi();
    });
  }

  function setupPresence() {
    const ref = ensureFirebase().ref("chat/presence/" + uid);
    ref.set({ name: getName(), time: Date.now() });
    ref.onDisconnect().remove();
    setInterval(() => ref.update({ time: Date.now(), name: getName() }), 25000);

    ensureFirebase().ref("chat/presence").on("value", (snap) => {
      state.onlineCount = snap.numChildren();
      els.onlineText.textContent = "🟢 " + state.onlineCount;
      els.headOnline.textContent = "🟢 " + state.onlineCount + " آنلاین";
    });
  }

  function listenMessages() {
    ensureFirebase().ref("chat/messages").limitToLast(state.pageSize).on("value", (snap) => {
      const val = snap.val() || {};
      const prevIds = new Set(Object.keys(state.messages));
      state.messages = val;

      // پیام‌های جدید از دیگران → صدا/اعلان/شمارنده نخوانده
      Object.entries(val).forEach(([id, m]) => {
        if (!prevIds.has(id) && m.uid !== uid && m.time > state.lastSeenTime) {
          if (!state.panelOpen) {
            state.unread++;
            playNotifySound();
            maybeBrowserNotify(m);
          } else if (document.hidden) {
            playNotifySound();
            maybeBrowserNotify(m);
          }
        }
      });
      updateUnreadBadge();
      renderMessages();
      renderPinned();
    });
  }

  function maybeBrowserNotify(m) {
    if (!prefs.notifOn) return;
    if (!("Notification" in window) || Notification.permission !== "granted") return;
    try {
      const n = new Notification("💬 " + (m.name || "ناشناس"), { body: (m.text || "عکس ارسال کرد").slice(0, 120) });
      n.onclick = () => { window.focus(); openPanel(); };
    } catch (e) {}
  }

  function maybeLoadMore() {
    if (state.pageSize > Object.keys(state.messages).length) return; // همه پیام‌ها قبلاً لود شده
    const prevHeight = els.body.scrollHeight;
    state.pageSize += CFG.messagesPerPage;
    ensureFirebase().ref("chat/messages").off("value");
    listenMessages();
    setTimeout(() => { els.body.scrollTop = els.body.scrollHeight - prevHeight; }, 200);
  }

  /* ---------- رندر پیام‌ها ---------- */
  function renderPinned() {
    const pid = state.settings.pinnedMessageId;
    const m = pid && state.messages[pid];
    if (!m) { els.pinned.classList.remove("show"); return; }
    els.pinnedText.innerHTML = "📌 <b>" + escapeHtml(m.name) + ":</b> " + escapeHtml((m.text || "").slice(0, 80));
    els.pinned.classList.add("show");
  }

  function renderMessages() {
    const query = els.searchInput.value.trim().toLowerCase();
    const wasAtBottom = els.body.scrollHeight - els.body.scrollTop - els.body.clientHeight < 60;

    const entries = Object.entries(state.messages)
      .sort((a, b) => (a[1].time || 0) - (b[1].time || 0))
      .filter(([id, m]) => !query || (m.text || "").toLowerCase().includes(query) || (m.name || "").toLowerCase().includes(query));

    els.body.innerHTML = "";

    if (Object.keys(state.messages).length >= state.pageSize) {
      const btn = document.createElement("button");
      btn.className = "chat-load-more";
      btn.textContent = "⬆️ بارگذاری پیام‌های قدیمی‌تر";
      btn.onclick = maybeLoadMore;
      els.body.appendChild(btn);
    }

    if (entries.length === 0) {
      const p = document.createElement("p");
      p.className = "hint";
      p.style.textAlign = "center";
      p.style.opacity = ".6";
      p.textContent = query ? "چیزی پیدا نشد." : "هنوز پیامی ارسال نشده. اولین نفر باشید!";
      els.body.appendChild(p);
    }

    entries.forEach(([id, m]) => els.body.appendChild(renderOneMessage(id, m)));

    if (wasAtBottom) els.body.scrollTop = els.body.scrollHeight;
  }

  function renderOneMessage(id, m) {
    const row = document.createElement("div");
    row.className = "chat-msg-row" + (m.uid === uid ? " mine" : "") + (m.isAdmin ? " admin-msg" : "");

    let replyHtml = "";
    if (m.replyTo && state.messages[m.replyTo]) {
      const rm = state.messages[m.replyTo];
      replyHtml = `<div class="chat-msg-reply">↩ ${escapeHtml(rm.name)}: ${escapeHtml((rm.text || "").slice(0, 60))}</div>`;
    }

    const imgHtml = m.imageData ? `<img class="chat-msg-img" src="${m.imageData}" data-full="${m.imageData}">` : "";

    const reactions = m.reactions || {};
    const reactionsHtml = CFG.reactionEmojis.map(emo => {
      const users = reactions[emo] || {};
      const count = Object.keys(users).length;
      if (!count) return "";
      const active = users[uid] ? " active" : "";
      return `<span class="chat-reaction-pill${active}" data-emoji="${emo}">${emo} ${count}</span>`;
    }).join("");

    row.innerHTML = `
      <div class="chat-msg-top">
        <span class="chat-msg-name">${escapeHtml(m.name || "ناشناس")}</span>
        ${m.isAdmin ? '<span class="chat-msg-admin-badge">مدیریت</span>' : ""}
        <span class="chat-msg-time">${fmtTime(m.time)}</span>
      </div>
      ${replyHtml}
      <div class="chat-msg-text${m.edited ? " edited" : ""}">${escapeHtml(m.text || "")}</div>
      ${imgHtml}
      <div class="chat-reactions">${reactionsHtml}</div>
      <div class="chat-msg-actions">
        <span data-act="react">😊 واکنش</span>
        <span data-act="reply">↩ پاسخ</span>
        ${m.uid === uid ? '<span data-act="edit">✏️ ویرایش</span><span data-act="delete">🗑 حذف</span>' : ""}
      </div>
      <div class="chat-reaction-picker">
        ${CFG.reactionEmojis.map(e => `<span data-pick="${e}">${e}</span>`).join("")}
      </div>
    `;

    // اکشن‌ها
    row.querySelectorAll('[data-act="react"]').forEach(el => el.onclick = () => {
      row.querySelector(".chat-reaction-picker").classList.toggle("show");
    });
    row.querySelectorAll("[data-pick]").forEach(el => el.onclick = () => {
      toggleReaction(id, el.getAttribute("data-pick"));
      row.querySelector(".chat-reaction-picker").classList.remove("show");
    });
    row.querySelectorAll(".chat-reaction-pill").forEach(el => el.onclick = () => {
      toggleReaction(id, el.getAttribute("data-emoji"));
    });
    const replyBtn = row.querySelector('[data-act="reply"]');
    if (replyBtn) replyBtn.onclick = () => setReplyTarget(id);
    const editBtn = row.querySelector('[data-act="edit"]');
    if (editBtn) editBtn.onclick = () => startEdit(id, m);
    const delBtn = row.querySelector('[data-act="delete"]');
    if (delBtn) delBtn.onclick = () => deleteOwnMessage(id);
    const img = row.querySelector(".chat-msg-img");
    if (img) img.onclick = () => {
      els.lightboxImg.src = img.getAttribute("data-full");
      els.lightbox.classList.add("show");
    };

    return row;
  }

  function toggleReaction(id, emoji) {
    const ref = ensureFirebase().ref(`chat/messages/${id}/reactions/${emoji}/${uid}`);
    ref.once("value").then(snap => {
      if (snap.exists()) ref.remove(); else ref.set(true);
    });
  }

  function setReplyTarget(id) {
    state.replyTarget = id;
    state.editTarget = null;
    if (!id) {
      els.replyPreview.classList.remove("show");
      return;
    }
    const m = state.messages[id];
    els.replyText.textContent = "↩ پاسخ به " + (m ? m.name + ": " + (m.text || "").slice(0, 40) : "");
    els.replyPreview.classList.add("show");
    els.textInput.focus();
  }

  function startEdit(id, m) {
    state.editTarget = id;
    state.replyTarget = null;
    els.replyPreview.classList.add("show");
    els.replyText.textContent = "✏️ در حال ویرایش پیام";
    els.textInput.value = m.text || "";
    autoGrow();
    els.textInput.focus();
  }

  function deleteOwnMessage(id) {
    const m = state.messages[id];
    if (!m || m.uid !== uid) return;
    if (!confirm("پیام حذف شود؟")) return;
    ensureFirebase().ref("chat/messages/" + id).remove();
  }

  /* ---------- تایپینگ ---------- */
  function handleTyping() {
    const ref = ensureFirebase().ref("chat/typing/" + uid);
    ref.set({ name: getName(), time: Date.now() });
    clearTimeout(state.typingClearTimer);
    state.typingClearTimer = setTimeout(() => ref.remove(), CFG.typingTimeoutMs);
  }

  function listenTyping() {
    ensureFirebase().ref("chat/typing").on("value", (snap) => {
      const val = snap.val() || {};
      const now = Date.now();
      const names = Object.entries(val)
        .filter(([id, t]) => id !== uid && (now - t.time) < CFG.typingTimeoutMs + 1000)
        .map(([id, t]) => t.name);
      if (names.length === 0) { els.typingLine.textContent = ""; return; }
      const label = names.length === 1
        ? `${names[0]} در حال نوشتن است...`
        : `${names.length} نفر در حال نوشتن هستند...`;
      els.typingLine.textContent = label;
    });
  }

  /* ---------- ارسال پیام ---------- */
  function checkSpam() {
    const now = Date.now();
    state.lastSentTimestamps = state.lastSentTimestamps.filter(t => now - t < CFG.spamWindowMs);
    if (state.lastSentTimestamps.length >= CFG.spamLimit) return false;
    state.lastSentTimestamps.push(now);
    return true;
  }

  function containsBannedWord(text) {
    const words = state.settings.bannedWords || [];
    const lower = text.toLowerCase();
    return words.some(w => w && lower.includes(String(w).toLowerCase()));
  }

  function setStatus(text, isErr) {
    els.statusLine.textContent = text || "";
    els.statusLine.classList.toggle("err", !!isErr);
    if (text) setTimeout(() => { if (els.statusLine.textContent === text) els.statusLine.textContent = ""; }, 4000);
  }

  function sendMessage() {
    const avail = computeAvailability();
    if (!avail.ok) { setStatus(avail.notice, true); return; }

    const text = els.textInput.value.trim();
    if (!text) return;
    if (text.length > CFG.maxMessageLength) { setStatus("پیام خیلی طولانی است.", true); return; }
    if (containsBannedWord(text)) { setStatus("این پیام شامل کلمات غیرمجاز است.", true); return; }

    if (state.editTarget) {
      const id = state.editTarget;
      const m = state.messages[id];
      if (m && m.uid === uid) {
        ensureFirebase().ref("chat/messages/" + id).update({ text, edited: true });
      }
      state.editTarget = null;
      els.textInput.value = "";
      els.replyPreview.classList.remove("show");
      autoGrow();
      return;
    }

    if (!checkSpam()) { setStatus("سرعت ارسال بالاست، کمی صبر کنید.", true); return; }

    const name = getName();
    const payload = {
      name, uid, text, time: Date.now()
    };
    if (state.replyTarget) payload.replyTo = state.replyTarget;

    ensureFirebase().ref("chat/messages").push(payload)
      .then(() => {
        els.textInput.value = "";
        autoGrow();
        setReplyTarget(null);
        ensureFirebase().ref("chat/typing/" + uid).remove();
      })
      .catch(() => setStatus("ارسال ناموفق بود.", true));
  }

  /* ---------- ارسال عکس (فشرده‌سازی سمت کاربر) ---------- */
  function handleImagePick(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const avail = computeAvailability();
    if (!avail.ok) { setStatus(avail.notice, true); return; }

    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => {
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let w = img.width, h = img.height;
        if (w > CFG.imageMaxWidth) { h = h * (CFG.imageMaxWidth / w); w = CFG.imageMaxWidth; }
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);

        let quality = 0.7;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > CFG.imageMaxBytes * 1.37 && quality > 0.2) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        if (dataUrl.length > CFG.imageMaxBytes * 1.37) {
          setStatus("عکس بعد از فشرده‌سازی هنوز بزرگ است — عکس کوچک‌تری انتخاب کنید.", true);
          return;
        }
        if (!checkSpam()) { setStatus("سرعت ارسال بالاست، کمی صبر کنید.", true); return; }

        ensureFirebase().ref("chat/messages").push({
          name: getName(), uid, text: "", imageData: dataUrl, time: Date.now()
        }).catch(() => setStatus("ارسال عکس ناموفق بود.", true));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /* ---------- شروع ---------- */
  function init() {
    buildDom();
    ensureFirebase();
    listenSettings();
    listenBans();
    setupPresence();
    listenMessages();
    listenTyping();
    refreshAvailabilityUi();
  }

  window.addEventListener("load", init);

})();
