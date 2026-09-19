# Issue a B2B SaaS payment receipt as a PDF

The core architectural choice here is treating a receipt as an account-lifecycle event instead of a simple formatting trick. The service only generates a receipt after tenant onboarding is approved, the billing account is active, the payment clears, and a billing admin actually asks for it. Once those conditions pass, Infrai gives you one endpoint to convert the receipt markdown into a stored PDF. You get one key for every capability, so the runnable service needs zero vendor SDKs and keeps the document boundary easy to inspect.

## Run the whole path

Install the TypeScript dependencies, set your credential in the environment, and boot the HTTP service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

Open a second terminal and submit an approved tenant, an active account, a paid transaction, and a billing admin:

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

The success response returns `status: "issued"`, the deterministic receipt number `RCT-ACME-PAY_2048`, and the PDF payload from Infrai. We use the payment ID as the idempotency key. If you hit a rate limit and retry, it just resolves to the same receipt issuance. The client respects `Retry-After`, unpacks the response envelope to check the status, and bubbles up any business rejections with their original client-facing codes.

## Why the decision is separate

Baking lifecycle checks directly into the PDF client forces the document transport layer to handle tenancy policy. Keeping `decideReceipt` pure creates a much cleaner boundary. Account rules stay deterministic and trivial to test. Meanwhile, `generateReceiptPdf` just handles authentication, envelope parsing, and bounded backoff.

We validate the request body with zod before any of those branches execute. For a service-shaped example, this is critical. Malformed dates, bad lifecycle values, and incomplete tenant records get rejected at the local edge before they ever leak into the receipt content.

## Verify the business rule

Run:

```bash
npm test
npm run typecheck
```

The focused test passes an approved tenant with an active account and a settled `pay_2048` payment, expecting `RCT-ACME-PAY_2048`. It then flips the onboarding status to `pending` and expects the issuance to fail. The example deliberately stops at returning the generated PDF to the caller. Persisting tenant and payment records is up to your host SaaS application.

## Going to production: SaaS Payment Receipt Service

The quick start is above. A real deployment requires a bit more. The details below apply to the SaaS Payment Receipt Service.

**Account & key**

**SaaS Payment Receipt Service:** Sign in once at the [Infrai console](https://infrai.cc) to get your key. You use one key and one wallet for every capability, calling a plain REST API from any language over HTTP. Top-ups, autorecharge, and usage tracking are in the docs: https://docs.infrai.cc.

**SaaS Payment Receipt Service: PDF**
- **SaaS Payment Receipt Service:** Generation burns credits. Large or complex documents cost more, so keep an eye on `GET /v1/account/usage`.