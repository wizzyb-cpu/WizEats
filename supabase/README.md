# Supabase backend setup (WizEats)

## 1. Create a Supabase project
- Create a project in Supabase Dashboard and securely save its database password.
- In SQL Editor, run the contents of `schema.sql` once.

## 2. Install Supabase CLI and link
- Install CLI following the official Supabase CLI docs.
- From the repository root, run `supabase login`, then `supabase link --project-ref YOUR_PROJECT_REF`.
- Deploy functions:
  - `supabase functions deploy create-payment`
  - `supabase functions deploy flutterwave-webhook`

## 3. Configure secrets (test-mode keys first)
Set server-side secrets only, not in frontend env or Git:
```sh
supabase secrets set FLW_SECRET_KEY=YOUR_FLUTTERWAVE_TEST_SECRET FLW_WEBHOOK_SECRET_HASH=YOUR_RANDOM_WEBHOOK_SECRET SITE_URL=https://YOUR_SITE_URL
`

Supabase automatically injects SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY into Edge Functions.

## 4. Configure Flutterwave webhook
In Flutterwave dashboard, set webhook URL to:
`https://YOUR_PROJECT_REF.supabase.co/functions/v1/flutterwave-webhook`
Set the webhook secret hash to the same value as `FLW_WEBHOOK_SECRET_HASH`. Enable the successful-charge event.

## 5. Security notes
- Keep the Flutterwave secret and Supabase service-role key out of frontend files and Git.
- Test with Flutterwave test mode before live keys.
- Webhook handler re-verifies the transaction via Flutterwave API before marking order paid.
- Checkout server computes prices from database menu rows; it ignores any client-supplied prices.
- Pickup options are validated against the fixed FUOYE locations server-side.
- Admin role changes should be made only by a trusted project owner via SQL; never self-promote through the app.

## Current edge-function stage
The payment functions are prepared but not deployed. The Supabase project has to be created/linked, secrets configured, and functions deployed before checkout can be enabled in the UI.
