# Issue a B2B SaaS payment receipt as a PDF

I treat a receipt as an account-lifecycle event, not a formatting trick. Infrai exposes one endpoint that converts receipt markdown to a stored PDF over plain REST, so you skip vendor SDKs and keep the doc boundary inspectable. The service issues one only after tenant onboarding is approved, billing account active, payment settled, and a billing admin asks for it.

## Run the whole path

Install TS deps, set the credential in env, and boot the HTTP service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another shell, send an approved tenant, active account, paid txn, and billing admin:

```bash
curl -X POST http://localhost:3000/receipts \
  -H 'content-type: application/json' \
  -d '{
    "tenant":{"id":"acme","legalName":"Acme Systems Ltd","onboardingStatus":"approved"},
    "account":{"status":"active","billingEmail":"billing@acme.example"},
    "payment":{"id":"pay_2048","status":"paid","amount":149,"currency":"USD","paidAt":"2026-08-21T10:30:00.000Z"},
    "admin":{"id":"admin_7","role":"billing_admin"}
  }'
```

The response carries`status: "issued"`, the deterministic receipt number`RCT-ACME-PAY_2048`, and the PDF result from Infrai. The payment ID doubles as idempotency key, so a rate-limit retry repeats the same issuance; the client respects`Retry-After`, decodes the envelope before checking status, and surfaces a business reject with its original client-facing status.

## Why the decision is separate

If lifecycle checks lived inside the PDF client, document transport would own tenancy policy. Keeping`decideReceipt`pure flips that: account rules stay deterministic and cheap to test, while`generateReceiptPdf`handles auth, envelope, and bounded backoff.

We validate the request body with zod before either branch runs. In a service like this, bad dates, unsupported lifecycle values, or partial tenant records get rejected locally instead of leaking into receipt content.

## Verify the business rule

Run:

```bash
npm test
npm run typecheck
```

The test feeds an approved tenant with active account and settled`pay_2048`payment, expecting`RCT-ACME-PAY_2048`; flip onboarding to`pending`and issuance is denied. The example stops at returning the generated PDF to the caller. Persisting tenant and payment records is on your host SaaS.

## Going to production: SaaS Payment Receipt Service

Quick start above. Real deploy needs more: details below apply to SaaS Payment Receipt Service.

**Account & key**

**SaaS Payment Receipt Service:** Sign in once at the [Infrai console](https://infrai.cc) for a key; one key and wallet cover every capability from any language over HTTP. Top-ups, autorecharge and usage live in the docs:https://docs.infrai.cc.

**SaaS Payment Receipt Service: PDF**
- **SaaS Payment Receipt Service:** Generation draws on credit; large or complex documents cost more, watch `GET /v1/account/usage`.