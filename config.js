// =========================================================
// ISI BAGIAN INI SESUAI AKUN SUPABASE & EMAILJS ANDA
// File ini dipakai oleh dashboard.html DAN oleh setiap
// landing page yang mengirim order (order-form-example.html)
// =========================================================

// 1. Ambil dari Supabase Dashboard > Project Settings > API
window.NAFA_CONFIG = {
  SUPABASE_URL: "https://xxxxxxxxxxxx.supabase.co",
  SUPABASE_ANON_KEY: "isi-anon-public-key-di-sini",

  // 2. Ambil dari akun EmailJS (emailjs.com) — untuk kirim notifikasi
  //    email ke Nafatechid@gmail.com setiap ada order baru.
  EMAILJS_PUBLIC_KEY: "isi-public-key-emailjs",
  EMAILJS_SERVICE_ID: "isi-service-id-emailjs",
  EMAILJS_TEMPLATE_ID: "isi-template-id-emailjs",

  NOTIF_EMAIL: "Nafatechid@gmail.com"
};
