/* =========================================================
   تنظیمات مشترک چت (Config Module)
   این فایل باید قبل از chat.js و admin-chat.js لود شود.
   ========================================================= */

window.CHAT_CONFIG = {

  firebase: {
    apiKey: "AIzaSyColBr5qGq66DWOkqyttQfLAvPjE5KXr68",
    authDomain: "site-501b3.firebaseapp.com",
    databaseURL: "https://site-501b3-default-rtdb.firebaseio.com",
    projectId: "site-501b3"
  },

  // محدودیت طول پیام
  maxMessageLength: 500,

  // ضد اسپم: حداکثر تعداد پیام در بازه زمانی
  spamLimit: 5,
  spamWindowMs: 30000,

  // صفحه‌بندی
  messagesPerPage: 50,

  // حداکثر حجم عکس بعد از فشرده‌سازی (بایت)
  imageMaxBytes: 300 * 1024,
  imageMaxWidth: 900,

  // ایموجی‌های واکنش
  reactionEmojis: ["👍", "❤️", "😂", "😢", "🔥", "👏"],

  // زمان غیرفعال شدن نشانگر «در حال نوشتن»
  typingTimeoutMs: 4000,

  // پیام‌های پیش‌فرض بنر بسته به وضعیت چت
  messages: {
    disabled: "💬 گفت‌وگوی آنلاین موقتاً غیرفعال است.",
    outsideSchedule: "⏰ چت در حال حاضر فعال نیست.",
    readonly: "👁 چت در حالت فقط‌خواندنی است — امکان ارسال پیام نیست.",
    adminOnly: "🛡 در این بازه فقط مدیریت می‌تواند پیام ارسال کند.",
    banned: "🚫 امکان ارسال پیام برای شما مسدود شده است."
  }
};
