# WizEats — The Best in FUOYE
Campus-only food ordering platform for FUOYE.

## Pickup points (fixed)
- NFSA
- Relaxation Centre
- Phase 2 Gate

## Starting menu
- Fried Rice & Chicken — ₦4,000
- Fried Rice & Egg — ₦3,000
- Stir-Fried Spaghetti with Fish — ₦3,000
- Stir-Fried Spaghetti with Egg — ₦2,500
- Potato Porridge — ₦2,000
- French Fries with Sauce — ₦1,500
- Meat Pie (2 pieces) — ₦1,500
- Chocolate Donuts (5 pieces) — ₦2,000

## Run locally
Install Node.js LTS, then run `npm install`, `npm run dev`.

## Status
Initial React frontend foundation: menu, categories, add-to-cart, cart quantity and subtotal, pickup selection. Checkout is not live yet; it awaits backend and payment verification integration.

## Planned stack
React/Vite · Supabase · Paystack or Flutterwave · Vercel

Never expose payment secrets in browser code. Validate allowed pickup locations on server-side. Admin pages require server-enforced role permissions.