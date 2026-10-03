import { NextRequest, NextResponse } from "next/server";
import { MAX_PROOF_BYTES } from "@/domain/subscriptions/planPayments";
import { FileServiceError } from "@/infrastructure/files/fileService";
import { planPaymentServiceFor } from "@/infrastructure/subscriptions/planPaymentsServer";

/**
 * Paiement d'un plan (0024).
 * POST multipart { planCode, months, methodId, senderName, senderPhone?, reference?, file }
 *   → preuve rangée dans R2 (dossier de l'atelier) puis demande enregistrée.
 * Le montant n'est jamais lu depuis le formulaire : la base le calcule.
 */
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const length = Number(request.headers.get("content-length") ?? "0");
    if (length > MAX_PROOF_BYTES + 64 * 1024) throw new FileServiceError("VALIDATION:size", 413);
    const service = await planPaymentServiceFor(request.headers.get("authorization"));
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!form || !(file instanceof Blob)) throw new FileServiceError("VALIDATION:body", 400);
    if (file.size > MAX_PROOF_BYTES) throw new FileServiceError("VALIDATION:size", 413);
    const payment = await service.submit(
      {
        planCode: form.get("planCode"),
        months: form.get("months"),
        methodId: form.get("methodId"),
        senderName: form.get("senderName"),
        senderPhone: form.get("senderPhone"),
        reference: form.get("reference"),
      },
      new Uint8Array(await file.arrayBuffer()),
    );
    return NextResponse.json({ payment }, { status: 201 });
  } catch (error) {
    if (error instanceof FileServiceError) {
      return NextResponse.json({ error: { code: error.code } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "PAYMENT_ERROR" } }, { status: 500 });
  }
}
