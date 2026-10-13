/**
 * GABARIT issu de MagyaPro (`src/lib/api.ts`), rendu autonome : il ne
 * dépend que de `next`, `zod`, `@prisma/client` et `./errors`. Adapter les
 * chemins d'import au projet.
 */
import { NextResponse } from 'next/server';
import { ZodError, type z, type ZodTypeAny } from 'zod';
import { Prisma } from '@prisma/client';

import { AppError, ForbiddenError, RateLimitError, ValidationError } from '@/lib/errors';

/**
 * Enveloppe unique des réponses d'API.
 *
 * Le client n'a ainsi qu'une seule forme à interpréter, et la construction des
 * réponses d'erreur passe par un point unique — c'est là qu'on garantit
 * qu'aucune trace d'exécution ni message de base de données ne fuit.
 */
export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: {
    code: string;
    message: string;
    fieldErrors?: Record<string, string>;
  };
};
export type ApiResponse<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, status = 200): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true as const, data }, { status });
}

export function fail(
  message: string,
  status: number,
  code = 'ERROR',
  fieldErrors?: Record<string, string>,
): NextResponse<ApiFailure> {
  return NextResponse.json(
    { ok: false as const, error: { code, message, fieldErrors } },
    { status },
  );
}

/** Aplatit les erreurs Zod en `{ champ: message }` exploitable par un formulaire. */
export function zodFieldErrors(error: ZodError): Record<string, string> {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    const path = issue.path.join('.') || '_';
    if (!fieldErrors[path]) fieldErrors[path] = issue.message;
  }
  return fieldErrors;
}

/**
 * Valide un corps de requête, ou lève une `ValidationError` exploitable.
 *
 * Le type de retour est celui de *sortie* du schéma : un champ déclaré avec
 * `.default()` est optionnel à l'entrée mais garanti présent en sortie, et
 * l'appelant doit voir cette garantie.
 */
export function parseOrThrow<S extends ZodTypeAny>(
  schema: S,
  input: unknown,
): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new ValidationError(
      'Certains champs sont invalides.',
      zodFieldErrors(result.error),
    );
  }
  return result.data;
}

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError('Corps de requête JSON invalide.');
  }
}

/**
 * Convertit n'importe quelle exception en réponse HTTP.
 *
 * Les erreurs applicatives portent un message écrit pour l'utilisateur. Tout
 * le reste devient un 500 générique : le détail part dans les logs serveur,
 * jamais dans la réponse, car il contiendrait requêtes SQL, chemins de
 * fichiers et structure interne.
 */
export async function toErrorResponse(error: unknown): Promise<NextResponse<ApiFailure>> {
  if (error instanceof AppError) {
    const response = fail(error.message, error.status, error.code, error.fieldErrors);
    if (error instanceof RateLimitError) {
      response.headers.set('Retry-After', String(error.retryAfterSeconds));
    }
    return response;
  }

  if (error instanceof ZodError) {
    return fail(
      'Certains champs sont invalides.',
      400,
      'VALIDATION_ERROR',
      zodFieldErrors(error),
    );
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002 : violation de contrainte d'unicité. Le seul cas où l'on peut
    // formuler un message utile sans révéler le schéma.
    if (error.code === 'P2002') {
      return fail(
        'Cette valeur est déjà utilisée.',
        409,
        'CONFLICT',
      );
    }
    if (error.code === 'P2025') {
      return fail('Ressource introuvable.', 404, 'NOT_FOUND');
    }
    // P2003 : contrainte de clé étrangère — la ressource est encore
    // référencée ailleurs (ex. un produit déjà vendu au moins une fois).
    if (error.code === 'P2003') {
      return fail(
        'Impossible : cet élément est encore utilisé ailleurs.',
        409,
        'CONFLICT',
      );
    }
  }

  console.error('[api] Erreur non gérée :', error);
  // Brancher ici le suivi d'erreurs du projet (Sentry…), en l'attendant.
  return fail(
    "Une erreur inattendue s'est produite. Réessayez dans un instant.",
    500,
    'INTERNAL_ERROR',
  );
}

const WRITE_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/**
 * Vrai pour une écriture envoyée par une page d'un AUTRE site.
 *
 * La protection contre la falsification de requête (CSRF) reposait sur le
 * seul cookie `SameSite=Lax`. Or les sous-domaines des vitrines sont « même
 * site » que le domaine racine pour le navigateur : une page hébergée sur un
 * sous-domaine pourrait déclencher une écriture avec la session de
 * l'utilisateur. Aucun commerçant ne peut y publier de HTML aujourd'hui ;
 * ce contrôle ferme la porte pour de bon.
 *
 * L'application n'appelle jamais son API depuis une autre origine : une
 * écriture légitime vient de la même adresse que la page (vitrine sur
 * domaine personnalisé comprise, servie par le même déploiement). Sans
 * en-tête `Origin` — webhooks de paiement, tâches planifiées, appels entre
 * serveurs —, rien n'est refusé : seul un navigateur l'envoie, et c'est lui
 * qu'il faut tenir.
 */
export function isForeignOriginWrite(request: Request): boolean {
  if (!WRITE_METHODS.has(request.method.toUpperCase())) return false;
  const origin = request.headers.get('origin');
  if (!origin) return false;
  let originHost: string;
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    // `Origin: null` (cadre isolé, redirection) : jamais une page à nous.
    return true;
  }
  const host = (request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '')
    .split(',')[0]!
    .trim()
    .toLowerCase();
  return !host || originHost !== host;
}

/**
 * Enrobe un handler de route : le corps métier n'a plus qu'à lever des
 * erreurs typées, la conversion HTTP est faite ici une fois pour toutes.
 */
export function route<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<NextResponse>,
) {
  return async (request: Request, ...args: Args): Promise<NextResponse> => {
    try {
      if (isForeignOriginWrite(request)) {
        throw new ForbiddenError('Requête refusée : elle ne provient pas de ce site.');
      }
      return await handler(request, ...args);
    } catch (error) {
      return await toErrorResponse(error);
    }
  };
}
