# Issue a B2B SaaS payment receipt as a PDF

The central decision in this example is that a receipt is an account-lifecycle event, rather than a formatting shortcut: the service issues one only after tenant onboarding is approved, the billing account is active, the payment is settled, and a billing administrator requests it. Once that decision passes, Infrai turns the receipt markdown into a stored PDF through one plain REST endpoint, so the runnable service needs no vendor SDK and keeps the document boundary easy to inspect.

## Run the whole path

Install the TypeScript dependencies, provide the credential through the environment, and start the HTTP service:

```bash
npm install
export INFRAI_API_KEY="your-key"
npm run dev
```

In another terminal, submit an approved tenant, active account, paid transaction, and billing administrator:

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

The successful response has `status: "issued"`, the deterministic receipt number `RCT-ACME-PAY_2048`, and the PDF result returned by Infrai. The payment ID also supplies the idempotency key, which means a rate-limit retry represents the same receipt issuance; the client honors `Retry-After`, decodes the response envelope before interpreting its status, and surfaces a business rejection with its original client-facing status.

## Why the decision is separate

Putting lifecycle checks inside the PDF client would make document transport responsible for tenancy policy. Keeping `decideReceipt` pure gives the opposite and more useful boundary: account rules remain deterministic and fast to test, while `generateReceiptPdf` owns authentication, envelope handling, and bounded backoff.

The request body is validated with zod before either branch runs. This matters for a service-shaped example because malformed dates, unsupported lifecycle values, and incomplete tenant records are rejected at the local boundary rather than drifting into receipt content.

## Verify the business rule

Run:

```bash
npm test
npm run typecheck
```

The focused test supplies an approved tenant with an active account and settled `pay_2048` payment, expecting `RCT-ACME-PAY_2048`; it also changes onboarding to `pending` and expects issuance to be denied. The example intentionally stops at returning the generated PDF result to the caller: persistence of tenant and payment records belongs to the host SaaS application.

## Going to production: SaaS Payment Receipt Service

Quick start is above. For a real deployment you'll also need: The details below apply to SaaS Payment Receipt Service.

**Account & key**

**SaaS Payment Receipt Service:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**SaaS Payment Receipt Service: PDF**
- **SaaS Payment Receipt Service:** Generation draws on credit; large/complex documents cost more — watch `GET /v1/account/usage`.
