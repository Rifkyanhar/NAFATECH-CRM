// =========================================================
// ISI BAGIAN INI SESUAI AKUN SUPABASE & EMAILJS ANDA
// File ini dipakai oleh dashboard.html DAN oleh setiap
// landing page yang mengirim order (order-form-example.html)
// =========================================================

// 1. Ambil dari Supabase Dashboard > Project Settings > API
window.NAFA_CONFIG = {
  SUPABASE_URL: "https://aopxsmorciuantitnxxh.supabase.co",
  SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFvcHhzbW9yY2l1YW50aXRueHhoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODUyNjgyMjAsImV4cCI6MjEwMDg0NDIyMH0.fRMiqysgMry2U-sVQksViGWD-C3ywDWr4209bfkv3bw",

  // 2. Ambil dari akun EmailJS (emailjs.com) — untuk kirim notifikasi
  //    email ke Nafatechid@gmail.com setiap ada order baru.
  EMAILJS_PUBLIC_KEY: "e2TnSlO9POqirXHX3",
  EMAILJS_SERVICE_ID: "service_wussidj",
  EMAILJS_TEMPLATE_ID: "template_cfocasr",
  NOTIF_EMAIL: "Nafatechid@gmail.com"
};
