import { serve } from "https://deno.land/std/http/server.ts";

serve(async (req) => {
  try {
    const { order_id, gross_amount, customer_name, contact } = await req.json();
    const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
    const auth = btoa(serverKey + ":");

    const res = await fetch("https://app.sandbox.midtrans.com/snap/v1/transactions", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        transaction_details: { order_id, gross_amount },
        customer_details: { first_name: customer_name, phone: contact }
      })
    });

    const data = await res.json();
    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
});