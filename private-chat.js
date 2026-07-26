/* =========================================================
   پیام خصوصی - مسجد محله
   نیازمند: auth.js + config.js (قبل از این فایل لود شوند)
   قدم ۵ از مستند طراحی فاز جدید
   ========================================================= */

(function () {

  let db = null;
  let els = {};
  let state = {
    panelOpen: false,
    view: "inbox",       // "inbox" یا "thread"
    activeChatId: null,
    activePeerUid: null,
    activePeerName: "",
    inboxChats: {},       // chatId -> {peerUid, peerName, lastText, lastTime}
    messages: {},
    myBlocks: {},
    messagesRef: null,
  };

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function fmtTime(ts) {
    if (!ts) return "";
    return new Date(ts).toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  }

  function ensureDb() {
    if (!db) db = firebase.database();
    return db;
  }

  function myUid() {
    return window.AUTH_STATE && window.AUTH_STATE.user ? window.AUTH_STATE.user.uid : null;
  }

  function isReady() {
    return !!(window.AUTH_STATE && window.AUTH_STATE.user && window.AUTH_STATE.verified);
  }

  function chatIdFor(a, b) {
    return [a, b].sort().join("_");
  }

  /* ---------- DOM ---------- */
  function buildDom() {
    const root = document.createElement("div");
    root.innerHTML = `
      <button id="pmTrigger" class="pm-trigger" style="display:none;">✉️ پیام‌های خصوصی</button>

      <div id="pmPanel" class="pm-panel">
        <div class="pm-head">
          <button id="pmBack" class="chat-icon-btn">→</button>
          <div class="pm-head-title" id="pmHeadTitle">پیام‌های خصوصی</div>
          <div class="pm-head-actions">
            <button id="pmThreadMenuBtn" class="chat-icon-btn" style="display:none;" title="گزینه‌ها">⋮</button>
            <button id="pmClose" class="chat-icon-btn">✕</button>
          </div>
        </div>

        <div class="pm-thread-menu" id="pmThreadMenu">
          <div id="pmBlockBtn">🚫 بلاک این کاربر</div>
          <div id="pmUnblockBtn" style="display:none;">✅ رفع بلاک</div>
          <div id="pmReportBtn">⚠️ گزارش این کاربر</div>
        </div>

        <div id="pmInboxView" class="pm-body chat-scroll"></div>

        <div id="pmThreadView" class="pm-body chat-scroll" style="display:none;"></div>

        <div class="pm-report-box" id="pmReportBox">
          <label>دلیل گزارش</label>
          <select id="pmReportReason">
            <option value="harass">آزار/توهین</option>
            <option value="spam">اسپم/تبلیغ</option>
            <option value="inappropriate">محتوای نامناسب</option>
            <option value="other">سایر</option>
          </select>
          <textarea id="pmReportNote" placeholder="توضیح بیشتر (اختیاری)"></textarea>
          <button id="pmReportSend">ارسال گزارش</button>
          <button id="pmReportCancel" class="auth-danger-like">انصراف</button>
          <div class="msg" id="pmReportMsg"></div>
        </div>

        <div class="chat-footer" id="pmFooter" style="display:none;">
          <div class="chat-compose-row">
            <textarea id="pmTextInput" rows="1" placeholder="پیام خصوصی..."></textarea>
            <button id="pmSendBtn">📨</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);

    els = {
      trigger: document.getElementById("pmTrigger"),
      panel: document.getElementById("pmPanel"),
      back: document.getElementById("pmBack"),
      close: document.getElementById("pmClose"),
      headTitle: document.getElementById("pmHeadTitle"),
      menuBtn: document.getElementById("pmThreadMenuBtn"),
      menu: document.getElementById("pmThreadMenu"),
      blockBtn: document.getElementById("pmBlockBtn"),
      unblockBtn: document.getElementById("pmUnblockBtn"),
      reportBtn: document.getElementById("pmReportBtn"),
      inboxView: document.getElementById("pmInboxView"),
      threadView: document.getElementById("pmThreadView"),
      reportBox: document.getElementById("pmReportBox"),
      reportReason: document.getElementById("pmReportReason"),
      reportNote: document.getElementById("pmReportNote"),
      reportSend: document.getElementById("pmReportSend"),
      reportCancel: document.getElementById("pmReportCancel"),
      reportMsg: document.getElementById("pmReportMsg"),
      footer: document.getElementById("pmFooter"),
      textInput: document.getElementById("pmTextInput"),
      sendBtn: document.getElementById("pmSendBtn"),
    };

    wireEvents();
  }

  function wireEvents() {
    els.trigger.onclick = openInbox;
    els.close.onclick = closePanel;
    els.back.onclick = () => {
      if (state.view === "thread") openInbox();
      else closePanel();
    };

    els.menuBtn.onclick = () => els.menu.classList.toggle("show");
    els.blockBtn.onclick = () => { toggleBlock(true); els.menu.classList.remove("show"); };
    els.unblockBtn.onclick = () => { toggleBlock(false); els.menu.classList.remove("show"); };
    els.reportBtn.onclick = () => { els.reportBox.classList.add("show"); els.menu.classList.remove("show"); };
    els.reportCancel.onclick = () => els.reportBox.classList.remove("show");
    els.reportSend.onclick = sendReport;

    els.sendBtn.onclick = sendMessage;
    els.textInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); }
    });
  }

  function openPanel() {
    state.panelOpen = true;
    els.panel.classList.add("open");
    document.body.classList.add("chat-open");
  }

  function closePanel() {
    state.panelOpen = false;
    els.panel.classList.remove("open");
    document.body.classList.remove("chat-open");
    detachThreadListener();
  }

  /* ---------- بلاک ---------- */
  function listenMyBlocks() {
    const uid = myUid();
    if (!uid) return;
    ensureDb().ref("blocks/" + uid).on("value", (snap) => {
      state.myBlocks = snap.val() || {};
    });
  }

  function toggleBlock(shouldBlock) {
    const uid = myUid();
    if (!uid || !state.activePeerUid) return;
    const ref = ensureDb().ref("blocks/" + uid + "/" + state.activePeerUid);
    if (shouldBlock) ref.set(true);
    else ref.remove();
  }

  /* ---------- گزارش ---------- */
  function sendReport() {
    const uid = myUid();
    if (!uid || !state.activePeerUid) return;
    const payload = {
      reporterUid: uid,
      reportedUid: state.activePeerUid,
      reason: els.reportReason.value,
      note: els.reportNote.value.trim().slice(0, 500),
      chatId: state.activeChatId,
      time: Date.now(),
    };
    ensureDb().ref("chatReports").push(payload)
      .then(() => {
        els.reportMsg.textContent = "✅ گزارش ثبت شد.";
        els.reportMsg.className = "msg ok";
        els.reportNote.value = "";
        setTimeout(() => els.reportBox.classList.remove("show"), 1200);
      })
      .catch((e) => {
        els.reportMsg.textContent = "❌ " + e.message;
        els.reportMsg.className = "msg err";
      });
  }

  /* ---------- شروع/باز کردن گفتگو با یک کاربر ---------- */
  function ensureChatMeta(chatId, peerUid) {
    const uid = myUid();
    const metaRef = ensureDb().ref("privateChats/" + chatId + "/meta");
    return metaRef.once("value").then((snap) => {
      if (snap.exists()) return;
      return metaRef.set({ participants: { [uid]: true, [peerUid]: true }, createdAt: Date.now() });
    });
  }

  function registerInMyInbox(chatId, peerUid, peerName) {
    const uid = myUid();
    ensureDb().ref("userChats/" + uid + "/" + chatId).set({ peerUid, peerName: peerName || "", time: Date.now() });
  }

  window.PrivateChat = window.PrivateChat || {};
  window.PrivateChat.openWith = function (peerUid, peerName) {
    if (!isReady()) {
      alert("برای پیام خصوصی، اول باید وارد حساب بشی و ایمیلت رو تایید کنی.");
      return;
    }
    const uid = myUid();
    if (uid === peerUid) return;

    const chatId = chatIdFor(uid, peerUid);
    ensureChatMeta(chatId, peerUid).then(() => {
      registerInMyInbox(chatId, peerUid, peerName);
      openPanel();
      openThread(chatId, peerUid, peerName);
    }).catch((e) => alert("خطا در شروع گفتگو: " + e.message));
  };

  /* ---------- اینباکس ---------- */
  function openInbox() {
    state.view = "inbox";
    els.inboxView.style.display = "flex";
    els.threadView.style.display = "none";
    els.footer.style.display = "none";
    els.menuBtn.style.display = "none";
    els.headTitle.textContent = "پیام‌های خصوصی";
    detachThreadListener();
    openPanel();

    const uid = myUid();
    if (!uid) return;

    els.inboxView.innerHTML = '<p class="hint" style="text-align:center;">در حال بارگذاری...</p>';

    ensureDb().ref("userChats/" + uid).once("value").then((snap) => {
      const val = snap.val() || {};
      const entries = Object.entries(val).sort((a, b) => (b[1].time || 0) - (a[1].time || 0));

      if (entries.length === 0) {
        els.inboxView.innerHTML = '<p class="hint" style="text-align:center;">هنوز گفتگوی خصوصی‌ای نداری.</p>';
        return;
      }

      els.inboxView.innerHTML = "";
      entries.forEach(([chatId, meta]) => {
        const row = document.createElement("div");
        row.className = "pm-inbox-row";
        row.innerHTML = `
          <span class="pm-inbox-name">${escapeHtml(meta.peerName || "کاربر")}</span>
          <span class="pm-inbox-time">${fmtTime(meta.time)}</span>
        `;
        row.onclick = () => openThread(chatId, meta.peerUid, meta.peerName);
        els.inboxView.appendChild(row);
      });
    });
  }

  /* ---------- گفتگوی باز ---------- */
  function detachThreadListener() {
    if (state.messagesRef) { state.messagesRef.off(); state.messagesRef = null; }
  }

  function openThread(chatId, peerUid, peerName) {
    state.view = "thread";
    state.activeChatId = chatId;
    state.activePeerUid = peerUid;
    state.activePeerName = peerName || "کاربر";
    state.messages = {};

    els.inboxView.style.display = "none";
    els.threadView.style.display = "flex";
    els.footer.style.display = "";
    els.menuBtn.style.display = "flex";
    els.headTitle.textContent = state.activePeerName;
    els.reportBox.classList.remove("show");

    const blocked = !!state.myBlocks[peerUid];
    els.blockBtn.style.display = blocked ? "none" : "block";
    els.unblockBtn.style.display = blocked ? "block" : "none";

    detachThreadListener();
    state.messagesRef = ensureDb().ref("privateChats/" + chatId + "/messages").limitToLast(200);
    state.messagesRef.on("value", (snap) => {
      state.messages = snap.val() || {};
      renderThread();
    });
  }

  function renderThread() {
    const uid = myUid();
    const entries = Object.entries(state.messages).sort((a, b) => (a[1].time || 0) - (b[1].time || 0));
    els.threadView.innerHTML = "";

    if (entries.length === 0) {
      els.threadView.innerHTML = '<p class="hint" style="text-align:center;">هنوز پیامی رد و بدل نشده.</p>';
    }

    entries.forEach(([id, m]) => {
      const row = document.createElement("div");
      row.className = "chat-msg-row" + (m.senderUid === uid ? " mine" : "");
      row.innerHTML = `
        <div class="chat-msg-top"><span class="chat-msg-time">${fmtTime(m.time)}</span></div>
        <div class="chat-msg-text">${escapeHtml(m.text || "")}</div>
      `;
      els.threadView.appendChild(row);
    });

    els.threadView.scrollTop = els.threadView.scrollHeight;
  }

  function sendMessage() {
    const uid = myUid();
    const text = els.textInput.value.trim();
    if (!uid || !text || !state.activeChatId) return;

    if (state.myBlocks[state.activePeerUid]) {
      alert("این کاربر رو بلاک کردی. اول رفع بلاک کن تا بتونی پیام بفرستی.");
      return;
    }

    ensureDb().ref("privateChats/" + state.activeChatId + "/messages").push({
      senderUid: uid,
      text: text.slice(0, 500),
      time: Date.now(),
    }).then(() => {
      els.textInput.value = "";
      registerInMyInbox(state.activeChatId, state.activePeerUid, state.activePeerName);
    });
  }

  /* ---------- شروع ---------- */
  function init() {
    if (!window.CHAT_CONFIG) return;
    buildDom();

    window.Auth.onAuthChange((s) => {
      els.trigger.style.display = (s.user && s.verified) ? "flex" : "none";
      if (s.user) listenMyBlocks();
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
