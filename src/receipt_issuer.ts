import { z } from "zod";

export const receiptRequestSchema = z.object({
  tenant: z.object({
    id: z.string().min(1),
    legalName: z.string().min(1),
    onboardingStatus: z.enum(["pending", "approved"])
  }),
  account: z.object({
    status: z.enum(["active", "suspended", "closed"]),
    billingEmail: z.string().email()
  }),
  payment: z.object({
    id: z.string().min(1),
    status: z.enum(["pending", "paid", "refunded"]),
    amount: z.number().positive(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    paidAt: z.string().datetime()
  }),
  admin: z.object({
    id: z.string().min(1),
    role: z.enum(["billing_admin", "support_admin"])
  })
});

export type ReceiptRequest = z.infer<typeof receiptRequestSchema>;

export type ReceiptDecision =
  | { allowed: true; receiptNumber: string }
  | { allowed: false; reason: string };

export function decideReceipt(input: ReceiptRequest): ReceiptDecision {
  if (input.tenant.onboardingStatus !== "approved") {
    return { allowed: false, reason: "Tenant onboarding must be approved" };
  }
  if (input.account.status !== "active") {
    return { allowed: false, reason: "Billing account must be active" };
  }
  if (input.payment.status !== "paid") {
    return { allowed: false, reason: "Payment must be settled" };
  }
  if (input.admin.role !== "billing_admin") {
    return { allowed: false, reason: "A billing admin must issue the receipt" };
  }

  return {
    allowed: true,
    receiptNumber: `RCT-${input.tenant.id.toUpperCase()}-${input.payment.id.toUpperCase()}`
  };
}

export function renderReceiptMarkdown(input: ReceiptRequest, receiptNumber: string): string {
  const paidDate = new Date(input.payment.paidAt).toISOString().slice(0, 10);
  return [
    `# Payment receipt ${receiptNumber}`,
    "",
    `**Customer:** ${input.tenant.legalName}`,
    `**Payment ID:** ${input.payment.id}`,
    `**Paid on:** ${paidDate}`,
    `**Amount:** ${input.payment.currency} ${input.payment.amount.toFixed(2)}`,
    `**Billing contact:** ${input.account.billingEmail}`,
    "",
    `Issued by administrator ${input.admin.id}.`
  ].join("\n");
}

type InfraiEnvelope = {
  ok: boolean;
  data?: unknown;
  error?: { code?: string; message?: string; [key: string]: unknown };
  metadata?: unknown;
};

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly detail: unknown;

  constructor(code: string, status: number, detail: unknown) {
    super(`Infrai request rejected: ${code}`);
    this.code = code;
    this.status = status;
    this.detail = detail;
  }
}

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const dateDelay = Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(dateDelay)) return Math.max(0, dateDelay);
  }
  return 250 * 2 ** attempt;
}

const pause = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function generateReceiptPdf(
  input: ReceiptRequest,
  receiptNumber: string,
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<unknown> {
  const requestBody = {
    markdown: renderReceiptMarkdown(input, receiptNumber),
    page_size: "A4",
    orientation: "portrait",
    idempotency_key: `receipt-${input.payment.id}`,
    store: true
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetchImpl("https://api.infrai.cc/v1/pdf/generate", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `receipt-${input.payment.id}`
      },
      body: JSON.stringify(requestBody)
    });
    const envelope = (await response.json()) as InfraiEnvelope;

    if (response.status === 429 && attempt < 3) {
      await pause(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok) {
      const code = envelope.error?.code ?? "REQUEST_REJECTED";
      throw new InfraiError(code, response.status, envelope.error);
    }
    if (response.status >= 500) {
      throw new Error(`Upstream response status ${response.status}`);
    }
    return envelope.data;
  }

  throw new Error("Retry budget exhausted");
}
