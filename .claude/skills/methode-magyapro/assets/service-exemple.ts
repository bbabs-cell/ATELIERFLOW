/**
 * GABARIT — la forme d'un service d'écriture, tirée des transferts de stock
 * de MagyaPro (`transfers-service.ts`). Exemple transposé pour Atelier Flow :
 * marquer une commande d'atelier comme livrée.
 *
 * Ce qu'il faut retrouver dans tout service :
 * 1. tenant + auteur en paramètres, jamais lus ailleurs ;
 * 2. relecture de la ressource **filtrée par le tenant** → 404 sinon ;
 * 3. règles métier → erreurs typées, message français affichable tel quel ;
 * 4. une transaction pour tout ce qui réussit ou échoue ensemble ;
 * 5. mise à jour **conditionnelle** contre la double action ;
 * 6. audit + notification **après** la transaction (ils ne bloquent rien).
 */
import { prisma } from '@/lib/db';
import { ConflictError, NotFoundError, ValidationError } from '@/lib/errors';
import { AUDIT_ACTIONS, recordAudit } from '@/lib/audit';
import { createNotification } from '@/lib/notifications';

export async function deliverOrder(params: {
  workshopId: string;
  userId: string;
  userEmail: string;
  orderId: string;
  note?: string;
}) {
  // 2. Jamais `where: { id }` seul : une commande d'un autre atelier est
  //    « introuvable », pas « interdite » (un 403 confirmerait qu'elle existe).
  const order = await prisma.order.findFirst({
    where: { id: params.orderId, workshopId: params.workshopId },
    select: { id: true, status: true, reference: true, customerId: true, balanceDue: true },
  });
  if (!order) throw new NotFoundError('Commande introuvable.');

  // 3. Règles métier, avec un message qui dit quoi faire.
  if (order.status === 'DELIVERED') throw new ConflictError('Cette commande a déjà été livrée.');
  if (order.status !== 'READY') {
    throw new ValidationError('La commande doit être marquée « prête » avant la livraison.');
  }

  await prisma.$transaction(
    async (tx) => {
      // 5. Deux clics, deux onglets, deux employés : un seul gagne.
      const { count } = await tx.order.updateMany({
        where: { id: order.id, status: 'READY' },
        data: { status: 'DELIVERED', deliveredAt: new Date(), deliveryNote: params.note ?? null },
      });
      if (count === 0) throw new ConflictError('Cette commande a déjà été livrée.');

      // Toute écriture liée (stock de matière, caisse, dette client) passe par
      // sa fonction d'entrée unique, avec `tx`, pour rester dans la transaction.
      // await recordStockMovement({ …, referenceType: 'order', referenceId: order.id }, tx);
    },
    { timeout: 30_000, maxWait: 10_000 },
  );

  // 6. Hors transaction : un journal ou un push en panne n'annule pas la livraison.
  await recordAudit({
    action: AUDIT_ACTIONS.ORDER_DELIVERED, // + un libellé français dans audit-labels.ts
    actorUserId: params.userId,
    actorEmail: params.userEmail,
    workshopId: params.workshopId,
    targetType: 'order',
    targetId: order.id,
  });
  await createNotification({
    workshopId: params.workshopId,
    type: 'ORDER_DELIVERED',
    title: `Commande ${order.reference} livrée`,
    body: order.balanceDue > 0 ? 'Un solde reste à encaisser.' : 'Soldée.',
    href: `/atelier/dashboard/commandes/${order.id}`,
  });

  return { id: order.id };
}
