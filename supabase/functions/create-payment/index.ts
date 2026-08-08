import { serve } from "https://deno.land/std/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type"
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { order_id } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const sb = createClient(supabaseUrl, supabaseServiceKey);

    const { data: order, error } = await sb.from("orders").select("*").eq("id", order_id).single();
    if (error || !order) {
      return new Response(JSON.stringify({ error: "Order tidak ditemukan" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
    if (!order.price || order.price <= 0) {
      return new Response(JSON.stringify({ error: "Harga order belum diisi" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const midtransOrderId = order.midtrans_order_id || (order.id + "-" + Date.now());

    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
    const auth = btoa(serverKey + ":");

    const midtransRes = await fetch("https://app.sandbox.midtrans.com/snap/v1/transactions", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        transaction_details: {
          order_id: midtransOrderId,
          gross_amount: order.price
        },
        customer_details: {
          first_name: order.customer_name,
          phone: order.contact
        }
      })
    });

    const data = await midtransRes.json();

    if (data.token) {
      await sb.from("orders").update({
        payment_status: "pending",
        midtrans_order_id: midtransOrderId
      }).eq("id", order_id);
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
