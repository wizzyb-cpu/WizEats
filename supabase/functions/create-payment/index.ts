// Create a server-side Flutterwave hosted checkout for an order.
// Deploy as a Supabase Edge Function. Secret keys live in Supabase function secrets only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const pickupSpots = ["NFSA", "Relaxation Centre", "Phase 2 Gate"];
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return reply({ error: "POST only" }, 405);

  try {
    const { items, pickup_location, customer_name, customer_email } = await req.json();
    if (!Array.isArray(items) || items.length === 0) return reply({ error: "Cart is empty." }, 400);
    if (!pickupSpots.includes(pickup_location)) return reply({ error: "Invalid pickup location." }, 400);
    if (typeof customer_name !== "string" || !customer_name.trim() || typeof customer_email !== "string" || !customer_email.includes("@")) {
      return reply({ error: "Name and valid email are required." }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const flutterwaveSecret = Deno.env.get("FLW_SECRET_KEY");
    const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:5173";
    if (!flutterwaveSecret) return reply({ error: "Payment provider is not configured." }, 500);

    const adminDb = createClient(supabaseUrl, serviceRole);
    const normalized = items.map((i: any) => ({ id: String(i.id), quantity: Number(i.quantity) }));
    if (normalized.some(i => !Number.isInteger(i.quantity) || i.quantity < 1 || i.quantity > 30)) {
      return reply({ error: "Invalid item quantity." }, 400);
    }
    const uniqueIds = [...new Set(normalized.map(i => i.id))];
    const { data: menu, error: menuError } = await adminDb.from("menu_items").select("id,name,price_ngn,is_available").in("id", uniqueIds);
    if (menuError || !menu || menu.length !== uniqueIds.length || menu.some(m => !m.is_available)) return reply({ error: "One or more menu items are unavailable." }, 400);

    const map = new Map(menu.map(m => [m.id, m]));
    const orderLines = normalized.map(i => {
      const m = map.get(i.id);
      if (!m) throw new Error("Menu item not found");
      return { menu_item_id: m.id, item_name_snapshot: m.name, unit_price_ngn: m.price_ngn, quantity: i.quantity, line_total_ngn: m.price_ngn * i.quantity };
    });
    const total = orderLines.reduce((sum, line) => sum + line.line_total_ngn, 0);
    const orderId = crypto.randomUUID();
    const txRef = `WIZEATS-${Date.now()}-${crypto.randomUUID().slice(0,8)}`;
    const orderNumber = `WZ-${Date.now().toString().slice(-8)}`;

    const { error: orderError } = await adminDb.from("orders").insert({
      id: orderId, order_number: orderNumber, customer_name: customer_name.trim(), customer_email: customer_email.trim().toLowerCase(),
      pickup_location, subtotal_ngn: total, tx_ref: txRef, payment_provider: "flutterwave"
    });
    if (orderError) throw orderError;
    const { error: lineError } = await adminDb.from("order_items").insert(orderLines.map(line => ({ ...line, order_id: orderId })));
    if (lineError) {
      await adminDb.from("orders").delete().eq("id", orderId);
      throw lineError;
    }

    const flw = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: { Authorization: `Bearer ${flutterwaveSecret}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        tx_ref: txRef, amount: total, currency: "NGN",
        redirect_url: `${siteUrl}/payment-result`,
        customer: { email: customer_email.trim().toLowerCase(), name: customer_name.trim() },
        customizations: { title: "WizEats", description: `FUOYE pickup: ${pickup_location}`, logo: `${siteUrl}/wizeats-logo.png` },
        meta: { order_id: orderId, order_number: orderNumber, pickup_location: pickup_location }
      })
    });
    const result = await flw.json();
    if (!flw.ok || result.status !== "success" || !result.data?.link) {
      await adminDb.from("orders").update({ payment_status: "failed", order_status: "cancelled" }).eq("id", orderId);
      return reply({ error: "Payment checkout could not be created. Please retry.", details: result.message || "Flutterwave error" }, 502);
    }
    return reply({ checkout_url: result.data.link, order_id: orderId, order_number: orderNumber, amount_ngn: total });
  } catch (e) {
    console.error("create-payment error", e);
    return reply({ error: "Unable to create checkout at this time." }, 500);
  }
});
