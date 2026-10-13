/**
 * Erreurs applicatives typées.
 *
 * Elles portent un code HTTP et un message *destiné à l'utilisateur*. Rien
 * d'autre ne doit franchir la frontière réseau : les traces d'exécution et les
 * erreurs de base restent côté serveur (voir `src/lib/api.ts`).
 */

export class AppError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
    /** Erreurs par champ, pour l'affichage dans un formulaire. */
    readonly fieldErrors?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** 400 — la requête est mal formée ou viole une règle métier. */
export class ValidationError extends AppError {
  constructor(
    message = 'Les informations envoyées sont invalides.',
    fieldErrors?: Record<string, string>,
  ) {
    super(message, 400, 'VALIDATION_ERROR', fieldErrors);
  }
}

/** 401 — aucune identité valide. */
export class UnauthorizedError extends AppError {
  constructor(message = 'Vous devez être connecté pour continuer.') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * 403 — identité valide, droits insuffisants.
 *
 * Utilisé aussi lorsqu'une ressource appartient à un autre tenant : voir la
 * note sur l'énumération dans `NotFoundError`.
 */
export class ForbiddenError extends AppError {
  constructor(message = "Vous n'avez pas les droits nécessaires.") {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * 404 — ressource inexistante *ou* appartenant à un autre restaurant.
 *
 * Les deux cas renvoient volontairement la même réponse : distinguer
 * « n'existe pas » de « existe mais ne vous appartient pas » permettrait
 * d'énumérer les données des autres tenants.
 */
export class NotFoundError extends AppError {
  constructor(message = 'Ressource introuvable.') {
    super(message, 404, 'NOT_FOUND');
  }
}

/** 409 — conflit avec l'état actuel (doublon, transition interdite). */
export class ConflictError extends AppError {
  constructor(message = 'Cette opération entre en conflit avec des données existantes.') {
    super(message, 409, 'CONFLICT');
  }
}

/** 402 — la fonctionnalité demandée n'est pas incluse dans le plan actif. */
export class PlanLimitError extends AppError {
  constructor(message: string) {
    super(message, 402, 'PLAN_LIMIT');
  }
}

/** 429 — trop de requêtes. */
export class RateLimitError extends AppError {
  constructor(
    message = 'Trop de tentatives. Réessayez dans quelques instants.',
    readonly retryAfterSeconds = 60,
  ) {
    super(message, 429, 'RATE_LIMITED');
  }
}
