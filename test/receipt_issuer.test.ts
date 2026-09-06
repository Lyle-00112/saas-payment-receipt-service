import assert from "node:assert/strict";
import test from "node:test";
import { decideReceipt, receiptRequestSchema } from "../src/receipt_issuer.js";

const settledPayment = receiptRequestSchema.parse({
  tenant: { id: "acme", legalName: "Acme Systems Ltd", onboardingStatus: "approved" },
  account: { status: "active", billingEmail: "billing@acme.example" },
  payment: {
    id: "pay_2048",
    status: "paid",
    amount: 149,
    currency: "USD",
    paidAt: "2026-08-21T10:30:00.000Z"
  },
  admin: { id: "admin_7", role: "billing_admin" }
});

test("issues a stable receipt number for an approved tenant and settled payment", () => {
  assert.deepEqual(decideReceipt(settledPayment), {
    allowed: true,
    receiptNumber: "RCT-ACME-PAY_2048"
  });
});

test("does not issue while tenant onboarding is pending", () => {
  const input = {
    ...settledPayment,
    tenant: { ...settledPayment.tenant, onboardingStatus: "pending" as const }
  };
  assert.deepEqual(decideReceipt(input), {
    allowed: false,
    reason: "Tenant onboarding must be approved"
  });
});
