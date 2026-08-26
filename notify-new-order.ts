import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// SUPABASE_URL dan SUPABASE_SERVICE_ROLE_KEY otomatis tersedia di Edge
// Function -- tidak perlu di-set manual, Supabase sudah menyediakannya.
const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

// Nilai-nilai ini yang PERLU kamu set manual lewat "supabase secrets set"
// (lihat instruksi deploy) -- diambil dari dashboard Kirimi.id kamu.
const ADMIN_WHATSAPP_NUMBER = Deno.env.get("ADMIN_WHATSAPP_NUMBER")!; // cth. 6285290078889
const KIRIMI_USER_CODE = Deno.env.get("KIRIMI_USER_CODE")!;
const KIRIMI_SECRET = Deno.env.get("KIRIMI_SECRET")!;
const KIRIMI_DEVICE_ID = Deno.env.get("KIRIMI_DEVICE_ID")!;

serve(async (req) => {
  try {
    const payload = await req.json();
    const order = payload.record; // isi baris order yang baru saja masuk

    if (!order) {
      return new Response("Tidak ada data order.", { status: 400 });
    }

    // Ambil nama layanan (di tabel orders cuma tersimpan service_type_id,
    // bukan namanya langsung -- jadi perlu query kecil ke service_types).
    let serviceName = "-";
    if (order.service_type_id) {
      const { data } = await supabase
        .from("service_types")
        .select("name")
        .eq("id", order.service_type_id)
        .single();
      if (data) serviceName = data.name;
    }

    const text =
      `🔔 Order Baru Masuk!\n\n` +
      `Customer: ${order.customer_name}\n` +
      `Kontak: ${order.contact || "-"}\n` +
      `Layanan: ${serviceName}\n` +
      `Catatan: ${order.notes || "-"}\n\n` +
      `Cek dashboard NAFA Tech CRM untuk detail lengkap.`;

    const res = await fetch("https://api.kirimi.id/v1/send-text", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_code: KIRIMI_USER_CODE,
        secret: KIRIMI_SECRET,
        device_id: KIRIMI_DEVICE_ID,
        receiver: ADMIN_WHATSAPP_NUMBER,
        message: text,
      }),
    });
    const result = await res.json();
    console.log("Kirimi.id response:", result);

    return new Response("ok", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response("error: " + (e as Error).message, { status: 500 });
  }
});
