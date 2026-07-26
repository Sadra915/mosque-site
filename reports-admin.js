/* =========================================================
   ماژول مشاهده گزارش‌های پیام خصوصی (برای admin-chat-only.html)
   ========================================================= */

(function () {

  let fbDb = null;

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  const REASON_LABELS = {
    harass: "آزار/توهین",
    spam: "اسپم/تبلیغ",
    inappropriate: "محتوای نامناسب",
    other: "سایر",
  };

  function injectPanel() {
    const host = document.getElementById("chatReportsHost");
    if (!host) return;
    host.innerHTML = `
      <div class="panel">
        <h3>⚠️ گزارش‌های پیام خصوصی</h3>
        <div id="chatReportsList" class="hint">در حال بارگذاری...</div>
      </div>
    `;
  }

  function connect(existingDb) {
    fbDb = existingDb;
    injectPanel();
    fbDb.ref("chatReports").limitToLast(100).on("value", (snap) => {
      render(snap.val() || {});
    });
  }

  function render(reports) {
    const box = document.getElementById("chatReportsList");
    if (!box) return;

    const entries = Object.entries(reports).sort((a, b) => (b[1].time || 0) - (a[1].time || 0));

    if (entries.length === 0) {
      box.innerHTML = '<p class="hint">هیچ گزارشی ثبت نشده.</p>';
      return;
    }

    box.innerHTML = "";
    entries.forEach(([id, r]) => {
      const time = r.time ? new Date(r.time).toLocaleString("fa-IR") : "";
      const item = document.createElement("div");
      item.className = "item";
      item.innerHTML = `
        <div class="status">
          <b>دلیل:</b> ${escapeHtml(REASON_LABELS[r.reason] || r.reason || "-")}<br>
          <b>گزارش‌دهنده:</b> ${escapeHtml(r.reporterUid)}<br>
          <b>گزارش‌شده:</b> ${escapeHtml(r.reportedUid)}<br>
          ${r.note ? "<b>توضیح:</b> " + escapeHtml(r.note) + "<br>" : ""}
          <span class="hint">${time}</span>
        </div>
        <button class="danger" onclick="ReportsAdmin.dismiss('${id}')">✅ بررسی شد / پاک کردن</button>
      `;
      box.appendChild(item);
    });
  }

  function dismiss(id) {
    fbDb.ref("chatReports/" + id).remove();
  }

  window.ReportsAdmin = { connect, dismiss };

})();
