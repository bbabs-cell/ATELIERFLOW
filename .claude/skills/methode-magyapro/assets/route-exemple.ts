/**
 * GABARIT — `src/app/api/atelier/commandes/[id]/livraison/route.ts`.
 * Une route ne contient rien d'autre que ces cinq étapes ; la logique est
 * dans le service (voir `service-exemple.ts`).
 */
import { z } from 'zod';

import { ok, parseOrThrow, readJson, route } from '@/lib/api';
import { requireWorkshop } from '@/lib/atelier/tenant';
import { deliverOrder } from '@/lib/atelier/orders-service';
import { RATE_LIMITS, hit } from '@/lib/rate-limit';

const schema = z.object({
  note: z.string().trim().max(300, 'La note ne doit pas dépasser 300 caractères.').optional(),
});

/** Marque une commande prête comme livrée au client. */
export const POST = route(async (request, { params }: { params: Promise<{ id: string }> }) => {
  const context = await requireWorkshop('orders:deliver'); // 1. session + tenant + permission
  await hit(`atelier-write:${context.workshop.id}`, RATE_LIMITS.write); // 2. débit
  const input = parseOrThrow(schema, await readJson(request)); // 3. Zod
  const { id } = await params;
  const result = await deliverOrder({ // 4. service
    workshopId: context.workshop.id, // le tenant vient de la session, jamais du corps
    userId: context.user.id,
    userEmail: context.user.email,
    orderId: id,
    note: input.note,
  });
  return ok({ order: result }); // 5. réponse uniforme { ok: true, data }
});
