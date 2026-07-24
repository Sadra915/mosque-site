/* =========================================================
   قابلیت‌های تکمیلی: بنر وضعیت، شمارنده بازدید، گزارش خرابی
   نیاز به همون Firebase که برای ratings.js ساختید دارد.
   این فایل را بعد از ratings.js لود کنید (از همون firebase app استفاده می‌کند).
   ========================================================= */

/* ---------- ۱) بنر وضعیت فیلترینگ/قطعی ---------- */
// data.json یک فیلد "status" دارد: { level: "ok" | "warning" | "critical", text: "..." }
function renderStatusBanner(status){
  const old = document.getElementById("statusBanner");
  if(old) old.remove();

  if(!status || !status.text) return;

  const colors = {
    ok:       { bg: "rgba(0,255,157,.12)", border: "#00ff9d", icon: "🟢" },
    warning:  { bg: "rgba(255,180,0,.12)", border: "#ffb400", icon: "🟡" },
    critical: { bg: "rgba(255,60,60,.14)", border: "#ff3c3c", icon: "🔴" }
  };
  const c = colors[status.level] || colors.ok;

  const banner = document.createElement("div");
  banner.id = "statusBanner";
  banner.style.cssText = `
    max-width:980px;margin:12px auto 0;padding:12px 16px;border-radius:12px;
    background:${c.bg};border:1px solid ${c.border};color:${c.border};
    font-size:14px;text-align:center;font-weight:bold;
  `;
  banner.innerHTML = `${c.icon} ${status.text}`;

  const header = document.querySelector("header");
  header.insertAdjacentElement("afterend", banner);
}

/* ---------- ۲) حالت فشرده/کم‌مصرف ---------- */
function initLiteMode(){
  const KEY = "liteMode";
  const isLite = localStorage.getItem(KEY) === "1";
  if(isLite) document.body.classList.add("lite-mode");

  const btn = document.createElement("button");
  btn.id = "liteToggle";
  btn.style.cssText = `
    position:fixed;bottom:18px;left:18px;z-index:9998;
    background:#0b0d10;border:1px solid rgba(0,255,157,.35);color:var(--neon);
    border-radius:20px;padding:8px 14px;font-size:13px;cursor:pointer;
  `;
  btn.textContent = isLite ? "🔋 حالت فشرده: روشن" : "⚡ حالت فشرده: خاموش";

  btn.onclick = ()=>{
    const nowLite = document.body.classList.toggle("lite-mode");
    localStorage.setItem(KEY, nowLite ? "1" : "0");
    btn.textContent = nowLite ? "🔋 حالت فشرده: روشن" : "⚡ حالت فشرده: خاموش";
  };

  document.body.appendChild(btn);
}
/* در CSS سایت این کلاس را اضافه کنید (پایین همین فایل توضیح داده شده) */

/* ---------- ۳) شمارنده بازدید و کاربران آنلاین ---------- */
function initVisitorStats(containerEl){
  // بازدید کل
  const totalRef = db.ref("stats/totalVisits");
  totalRef.transaction(v => (v || 0) + 1);

  // کاربران آنلاین (presence)
  const onlineRef = db.ref("presence");
  const myRef = onlineRef.push();
  myRef.set(true);
  myRef.onDisconnect().remove();

  const box = document.createElement("div");
  box.className = "status";
  box.innerHTML = `👥 آنلاین: <span id="onlineCount">-</span> &nbsp;|&nbsp; 👁 کل بازدید: <span id="totalCount">-</span>`;
  containerEl.appendChild(box);

  onlineRef.on("value", snap=>{
    const count = snap.numChildren();
    document.getElementById("onlineCount").textContent = count;
  });

  totalRef.on("value", snap=>{
    document.getElementById("totalCount").textContent = snap.val() || 0;
  });
}

/* ---------- ۴) گزارش خرابی کانفیگ ---------- */
function addBrokenReportButton(container, link){
  const key = configKey(link); // از ratings.js
  const reportedKey = "reported_" + key;

  const btn = document.createElement("button");
  btn.textContent = "🚫 این کانفیگ کار نمی‌کنه";
  btn.style.cssText = "background:#2a2a2a;color:#ff8080;font-size:12px;padding:8px 12px;";

  if(localStorage.getItem(reportedKey)){
    btn.disabled = true;
    btn.textContent = "✅ گزارش ثبت شد";
    btn.style.opacity = ".5";
  }

  btn.onclick = ()=>{
    db.ref("reports/" + key).transaction(current=>{
      current = current || { count: 0, link: link };
      current.count = (current.count || 0) + 1;
      current.link = link;
      current.lastReport = Date.now();
      return current;
    });
    localStorage.setItem(reportedKey, "1");
    btn.disabled = true;
    btn.textContent = "✅ گزارش ثبت شد";
    btn.style.opacity = ".5";
  };

  container.appendChild(btn);
}
