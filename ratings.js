/* =========================================================
   سیستم امتیازدهی کانفیگ‌ها (Firebase Realtime Database)
   قبل از استفاده:
   1) یک پروژه رایگان در https://console.firebase.google.com بسازید
   2) Realtime Database را با حالت "test mode" فعال کنید
   3) مقادیر firebaseConfig زیر را با مقادیر پروژه خودتان جایگزین کنید
   ========================================================= */

const firebaseConfig = {
  apiKey: "AIzaSyColBr5qGq66DWOkqyttQfLAvPjE5KXr68",
  authDomain: "site-501b3.firebaseapp.com",
  databaseURL: "https://site-501b3-default-rtdb.firebaseio.com",
  projectId: "site-501b3"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// یک شناسه ساده و ثابت برای هر کانفیگ می‌سازد تا امتیازها گم نشوند
function configKey(link){
  let hash = 0;
  for(let i=0;i<link.length;i++){
    hash = ((hash<<5)-hash) + link.charCodeAt(i);
    hash |= 0;
  }
  return "cfg_" + Math.abs(hash);
}

function renderRatingWidget(container, link){
  const key = configKey(link);
  const ref = db.ref("ratings/" + key);

  const wrap = document.createElement("div");
  wrap.className = "rating-widget";
  wrap.innerHTML = `
    <button class="vote-btn up" title="خوب بود">👍 <span class="up-count">0</span></button>
    <button class="vote-btn down" title="مشکل داشت">👎 <span class="down-count">0</span></button>
  `;
  container.appendChild(wrap);

  const upCount = wrap.querySelector(".up-count");
  const downCount = wrap.querySelector(".down-count");

  ref.on("value", snap=>{
    const val = snap.val() || {up:0, down:0};
    upCount.textContent = val.up || 0;
    downCount.textContent = val.down || 0;
  });

  const votedKey = "voted_" + key;

  wrap.querySelector(".up").onclick = ()=>vote(ref, "up", votedKey, wrap);
  wrap.querySelector(".down").onclick = ()=>vote(ref, "down", votedKey, wrap);

  if(localStorage.getItem(votedKey)){
    wrap.classList.add("voted");
  }
}

function vote(ref, type, votedKey, wrap){
  if(localStorage.getItem(votedKey)){
    return; // هر کاربر فقط یک بار رای می‌دهد (بر اساس همین مرورگر)
  }
  ref.transaction(current=>{
    current = current || {up:0, down:0};
    current[type] = (current[type]||0) + 1;
    return current;
  });
  localStorage.setItem(votedKey, type);
  wrap.classList.add("voted");
}
