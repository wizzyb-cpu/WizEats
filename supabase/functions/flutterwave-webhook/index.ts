// Flutterwave webhook: check shared webhook secret hash AND re-verify transaction with Flutterwave API.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };
Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("POST only", { status: 405, headers: corsHeaders });
  const expectedHash = Deno.env.get("FLW_WEBHOOK_SECRET_HASH");
  const receivedHash = req.headers.get("verif-hash");
  if (!expectedHash || !receivedHash || receivedHash !== expectedHash) return new Response("Unauthorized", { status: 401, headers: corsHeaders });

  try {
    const payload = await req.json();
    const data = payload?.data;
    if (payload?.event !== "charge.completed" || !data?.id || !data?.tx_ref) return new Response("Ignored event", { status: 200, headers: corsHeaders });

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const secret = Deno.env.get("FLW_SECRET_KEY");
    if (!secret) return new Response("Server not configured", { status: 500, headers: corsHeaders });

    // Re-query Flutterwave, never trust webhook data alone.
    const verifyResponse = await fetch(`https://api.flutterwave.com/v3/transactions/${data.id}/verify`, {
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" }
    });
    const verified = await verifyResponse.json();
    const tx = verified?.data;
    if (!verifyResponse.ok || verified?.status !== "success" || !tx) return new Response("Verification failed", { status: 400, headers: corsHeaders });

    const { data: order, error } = await supabase.from("orders").select("id,tx_ref,subtotal_ngn,currency,payment_status").eq("tx_ref", tx.tx_ref).maybeSingle();
    if (error || !order) return new Response("Order not found", { status: 404, headers: corsHeaders });
    // idempotent: only move pending orders to paid once; amount/currency/reference must match.
    if (tx.status === "successful" && tx.tx_ref === order.tx_ref && tx.currency === order.currency && Number(tx.amount) >= Number(order.subtotal_ngn)) {
      if (order.payment_status === "pending") {
        const { error: updateError } = await supabase.from("orders").update({
          payment_status: "successful", order_status: "paid", flw_transaction_id: String(tx.id), paid_at: new Date().toISOString()
        }).eq("id", order.id).eq("payment_status", "pending");
        if (updateError) throw updateError;
      }
    } else if (tx.status !== "successful" && order.payment_status === "pending") {
      await supabase.from("orders").update({ payment_status: "failed" }).eq("id", order.id).eq("payment_status", "pending");
    }
    return new Response("Webhook accepted", { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("Webhook processing error", error);
    return new Response("Webhook processing failed", { status: 500, headers: corsHeaders });
  }
});
