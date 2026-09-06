import { createServer, type ServerResponse } from "node:http";
import {
  generateReceiptPdf,
  InfraiError,
  receiptRequestSchema,
  decideReceipt
} from "./receipt_issuer.js";

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json" });
  response.end(JSON.stringify(value));
}

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/receipts") {
    sendJson(response, 404, { error: "Route not found" });
    return;
  }

  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const parsed = receiptRequestSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString("utf8")));
    if (!parsed.success) {
      sendJson(response, 400, { error: "Invalid receipt request", issues: parsed.error.issues });
      return;
    }

    const decision = decideReceipt(parsed.data);
    if ("reason" in decision) {
      sendJson(response, 409, { status: "not_issued", reason: decision.reason });
      return;
    }

    const apiKey = process.env.INFRAI_API_KEY;
    if (!apiKey) {
      sendJson(response, 503, { error: "INFRAI_API_KEY is required" });
      return;
    }

    const pdf = await generateReceiptPdf(parsed.data, decision.receiptNumber, apiKey);
    sendJson(response, 201, {
      status: "issued",
      receiptNumber: decision.receiptNumber,
      pdf
    });
  } catch (error) {
    if (error instanceof InfraiError) {
      const status = error.status >= 400 && error.status < 500 ? error.status : 502;
      sendJson(response, status, { error: error.code, detail: error.detail });
      return;
    }
    sendJson(response, 500, { error: "Receipt could not be issued" });
  }
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Receipt service listening on http://localhost:${port}`));
