/* =========================================================
   ویجت چت آنلاین - مسجد محله
   دکمه شناور + صفحه‌ی تمام‌صفحه (مثل گروه تلگرام)، همگام‌سازی با Firebase Realtime DB
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
    set fontSize(v) { localStorage.setItem("chatFontSize", v); },
    get theme() { return localStorage.getItem("chatTheme") || "neon"; },
    set theme(v) { localStorage.setItem("chatTheme", v); }
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
          <button class="chat-icon-btn" id="chatCloseBtn" title="بازگشت">→</button>
          <div class="chat-head-title">💬 گفت‌وگوی آنلاین <span id="chatHeadOnline" style="font-weight:normal;font-size:11px;opacity:.7;"></span></div>
          <div class="chat-head-actions">
            <button class="chat-icon-btn" id="chatThemeBtn" title="تغییر تم">🎨</button>
            <button class="chat-icon-btn" id="chatSettingsBtn" title="تنظیمات">⚙️</button>
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
      themeBtn: document.getElementById("chatThemeBtn"),
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
    applyTheme();
  }

  function applyTheme() {
    const isMinimal = prefs.theme === "minimal";
    els.panel.classList.toggle("theme-minimal", isMinimal);
    els.themeBtn.textContent = isMinimal ? "🌌" : "☀️";
    els.themeBtn.title = isMinimal ? "تغییر به تم نئون" : "تغییر به تم مینیمال";
  }

  function wireEvents() {
    els.fab.onclick = openPanel;
    els.closeBtn.onclick = closePanel;

    els.themeBtn.onclick = () => {
      prefs.theme = prefs.theme === "minimal" ? "neon" : "minimal";
      applyTheme();
    };

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

    // بستن صفحه‌ی تمام‌صفحه با کلید Escape
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && state.panelOpen) closePanel();
    });
  }

  function autoGrow() {
    els.textInput.style.height = "auto";
    els.textInput.style.height = Math.min(90, els.textInput.scrollHeight) + "px";
  }

  function openPanel() {
    state.panelOpen = true;
    els.panel.classList.add("open");
    document.body.classList.add("chat-open"); // قفل اسکرول پس‌زمینه‌ی سایت
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
    document.body.classList.remove("chat-open"); // بازگرداندن اسکرول سایت
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
    row.querySelectorAll('[data-act="reply"]').forEach(el => el.onclick = () => setReplyTarget(id));
    row.querySelectorAll('[data-act="edit"]').forEach(el => el.onclick = () => startEdit(id, m));
    row.querySelectorAll('[data-act="delete"]').forEach(el => el.onclick = () => deleteOwnMessage(id));

    if (imgHtml) {
      row.querySelector(".chat-msg-img").onclick = (e) => {
        els.lightboxImg.src = e.target.getAttribute("data-full");
        els.lightbox.classList.add("show");
      };
    }

    return row;
  }

  /* ---------- واکنش‌ها ---------- */
  function toggleReaction(msgId, emoji) {
    const ref = ensureFirebase().ref(`chat/messages/${msgId}/reactions/${emoji}/${uid}`);
    ref.once("value").then(snap => {
      if (snap.exists()) ref.remove();
      else ref.set(true);
    });
  }

  /* ---------- پاسخ به پیام ---------- */
  function setReplyTarget(id) {
    state.replyTarget = id;
    if (!id) {
      els.replyPreview.classList.remove("show");
      return;
    }
    const m = state.messages[id];
    if (!m) return;
    els.replyText.textContent = "↩ در پاسخ به " + (m.name || "ناشناس") + ": " + (m.text || "").slice(0, 50);
    els.replyPreview.classList.add("show");
    els.textInput.focus();
  }

  /* ---------- ویرایش پیام ---------- */
  function startEdit(id, m) {
    state.editTarget = id;
    els.textInput.value = m.text || "";
    autoGrow();
    els.textInput.focus();
  }

  /* ---------- حذف پیام خودم ---------- */
  function deleteOwnMessage(id) {
    if (!confirm("این پیام حذف شود؟")) return;
    ensureFirebase().ref("chat/messages/" + id).remove();
  }

  /* ---------- ضد اسپم ---------- */
  function isSpamming() {
    const now = Date.now();
    state.lastSentTimestamps = state.lastSentTimestamps.filter(t => now - t < CFG.spamWindowMs);
    return state.lastSentTimestamps.length >= CFG.spamLimit;
  }

  /* ---------- تایپینگ ---------- */
  function handleTyping() {
    const ref = ensureFirebase().ref("chat/typing/" + uid);
    ref.set({ name: getName(), time: Date.now() });
    ref.onDisconnect().remove();
    clearTimeout(state.typingClearTimer);
    state.typingClearTimer = setTimeout(() => ref.remove(), CFG.typingTimeoutMs);
  }

  function listenTyping() {
    ensureFirebase().ref("chat/typing").on("value", (snap) => {
      const val = snap.val() || {};
      const now = Date.now();
      const names = Object.entries(val)
        .filter(([tuid, t]) => tuid !== uid && now - t.time < CFG.typingTimeoutMs)
        .map(([, t]) => t.name);
      els.typingLine.textContent = names.length ? `✏️ ${names.join("، ")} در حال نوشتن...` : "";
    });
  }

  /* ---------- ارسال عکس ---------- */
  function handleImagePick(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = Math.min(1, CFG.imageMaxWidth / img.width);
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        let quality = 0.85;
        let dataUrl = canvas.toDataURL("image/jpeg", quality);
        while (dataUrl.length > CFG.imageMaxBytes * 1.37 && quality > 0.3) {
          quality -= 0.1;
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }
        sendMessage({ imageData: dataUrl });
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }

  /* ---------- بررسی کلمات ممنوعه ---------- */
  function containsBannedWord(text) {
    const words = state.settings.bannedWords || [];
    const lower = text.toLowerCase();
    return words.some(w => w && lower.includes(w.toLowerCase()));
  }

  /* ---------- ارسال پیام ---------- */
  function sendMessage(extra) {
    const avail = computeAvailability();
    if (!avail.ok) return;

    const text = els.textInput.value.trim();
    if (!extra && !text) return;

    if (text && text.length > CFG.maxMessageLength) {
      els.statusLine.textContent = `پیام حداکثر ${CFG.maxMessageLength} کاراکتر می‌تواند باشد.`;
      els.statusLine.className = "chat-status-line err";
      return;
    }

    if (text && containsBannedWord(text)) {
      els.statusLine.textContent = "پیام شامل کلمات غیرمجاز است.";
      els.statusLine.className = "chat-status-line err";
      return;
    }

    if (!extra && isSpamming()) {
      els.statusLine.textContent = "لطفاً کمی صبر کنید، تعداد پیام‌های شما زیاد است.";
      els.statusLine.className = "chat-status-line err";
      return;
    }

    // ویرایش پیام موجود
    if (state.editTarget) {
      ensureFirebase().ref("chat/messages/" + state.editTarget).update({ text, edited: true });
      state.editTarget = null;
      els.textInput.value = "";
      autoGrow();
      return;
    }

    const payload = Object.assign({
      name: getName(),
      uid,
      time: Date.now()
    }, extra || { text });

    if (state.replyTarget) {
      payload.replyTo = state.replyTarget;
    }

    ensureFirebase().ref("chat/messages").push(payload)
      .then(() => {
        state.lastSentTimestamps.push(Date.now());
        els.textInput.value = "";
        autoGrow();
        setReplyTarget(null);
        els.statusLine.textContent = "";
      })
      .catch(e => {
        els.statusLine.textContent = "❌ " + e.message;
        els.statusLine.className = "chat-status-line err";
      });
  }

  /* ---------- شروع ---------- */
  function init() {
    if (!CFG) {
      console.error("CHAT_CONFIG پیدا نشد. مطمئن شوید config.js قبل از chat.js لود شده است.");
      return;
    }
    buildDom();
    listenSettings();
    listenBans();
    setupPresence();
    listenMessages();
    listenTyping();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
