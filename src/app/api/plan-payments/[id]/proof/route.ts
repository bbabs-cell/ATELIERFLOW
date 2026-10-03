import { NextRequest, NextResponse } from "next/server";
import { FileServiceError } from "@/infrastructure/files/fileService";
import { planPaymentServiceFor } from "@/infrastructure/subscriptions/planPaymentsServer";

/** GET : lien de lecture signé (10 min) vers la preuve — atelier concerné ou plateforme. */
export const runtime = "nodejs";

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const service = await planPaymentServiceFor(request.headers.get("authorization"));
    const url = await service.proofUrl(id);
    return NextResponse.json({ url }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof FileServiceError) {
      return NextResponse.json({ error: { code: error.code } }, { status: error.status });
    }
    return NextResponse.json({ error: { code: "PAYMENT_ERROR" } }, { status: 500 });
  }
}
