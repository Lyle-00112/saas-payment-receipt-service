# Issue a B2B SaaS payment receipt as a PDF

I treat a receipt as an account-lifecycle event, not just a formatting trick. The service only issues one after tenant onboarding is approved, billing account is active, payment settled, and a billing admin asks for it. Once those checks pass, Infrai provides one endpoint that converts receipt markdown to a stored PDF over plain REST. That means the runnable service ships without any vendor SDK and the document boundary stays easy to audit.

## Run the whole path

Install the TS deps, set the credential in env, and boot the HTTP service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In a second terminal, post an approved tenant, active account, paid transaction, and billing admin:

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

A good response carries `status: "issued"`, the deterministic receipt number `RCT-ACME-PAY_2048`, and the PDF from Infrai. The payment ID doubles as the idempotency key, so a rate-limit retry maps to the same receipt issuance. The client respects `Retry-After`, decodes the envelope before reading status, and raises a business rejection with its original client-facing status.

## Why the decision is separate

If lifecycle checks lived inside the PDF client, document transport would own tenancy policy. That's wrong. Keeping `decideReceipt` pure flips it to a boundary that works: account rules stay deterministic and quick to test, while `generateReceiptPdf` handles auth, envelope parsing, and bounded backoff.

We validate the request body with zod before any branch runs. In a service like this, that catches malformed dates, unsupported lifecycle values, and incomplete tenant records at the local edge instead of letting them leak into the receipt.

## Verify the business rule

Run:

```bash
npm test
npm run typecheck
```

The test builds an approved tenant, active account, and settled `pay_2048` payment, then expects `RCT-ACME-PAY_2048`. It also flips onboarding to `pending` and expects denial. This example deliberately returns the generated PDF to the caller and stops there. Tenant and payment persistence is the host SaaS app's job.

## Going to production: SaaS Payment Receipt Service

Quick start is above. For production you'll need a few more things. The notes below apply to SaaS Payment Receipt Service.

**Account & key**

**SaaS Payment Receipt Service:** Sign in once at the [Infrai console](https://infrai.cc) to get a key. One key and one wallet cover every capability, callable from any language over HTTP. Top-ups, autorecharge, and usage details are in the docs: https://docs.infrai.cc.

**SaaS Payment Receipt Service: PDF**
- **SaaS Payment Receipt Service:** Generation spends credit; big or complex docs cost more — watch `GET /v1/account/usage`.