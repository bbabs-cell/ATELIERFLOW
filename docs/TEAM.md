# ÉQUIPE & PERMISSIONS (Prompt 19)

Rôles, membres d'équipe et permissions du workspace. Le modèle reflète le
seed RBAC `supabase/migrations/0007_rbac.sql` et les triggers
`tenant_memberships_rules()` : la source de vérité, côté serveur, reste
Postgres/RLS (phase 04). Cette couche applique **déjà** les mêmes gardes côté
client afin qu'aucune saisie invalide ne soit produite hors-ligne.

## Rôles tenant

| Rôle | Lecture | Écriture | Gestion |
|---|---|---|---|
| `OWNER` | tout | tout | tout (dont `team.manage`, `tenant.settings`, `audit.read`) |
| `MANAGER` | tout | presque tout | `team.read` seul, pas de `team.manage` |
| `EMPLOYEE` | clients/ordres/rdv/stock/reçus | clients, ordres, rdv | — |
| `APPRENTICE` | lecture seule | — | — |

La matrice complète `PERMISSIONS_BY_ROLE` est dans
`src/domain/team/roles.ts` ; chaque permission a un libellé français
(`PERMISSION_LABELS`) et une catégorie pour l'affichage.

## Cycle de vie d'un membre

`INVITED → ACTIVE ⇄ DEACTIVATED` (jamais de suppression, miroir du trigger).

1. **Invitation** (`inviteMember`) — requis `team.manage`. Nom normalisé
   (`normalizeFullName`), téléphone normalisé (`normalizePhone`, E.164).
   Rôle vérifié. Le membre est créé au statut `INVITED`, `invited_by`
   renseigné.
2. **Acceptation** (`acceptInvite`) — sur son propre profil uniquement ;
   `validateOwnStatusTransition` n'autorise que `INVITED → ACTIVE`. `joined_at`
   est horodaté.
3. **Changement de rôle** (`setRole`) — requis `team.manage`. Refusé sur
   soi-même et si le membre est le **dernier `OWNER` actif** (tout autre
   membre peut être changé librement).
4. **Désactivation / réactivation** (`deactivate`, `reactivate`) — requis
   `team.manage`. Auto-désactivation refusée, dernier `OWNER` actif
   protégé. Réactivation d'un `INVITED` impossible (l'invité doit accepter).

Les gardes `validateRoleChange` / `validateDeactivation` sont testées de façon
unitaire et via le service.

## Accès courant

`currentAccess()` retourne le profil connecté avec sa liste de permissions
(calculées à partir de `PERMISSIONS_BY_ROLE`, jamais stockées côté client) :
les composants UI activent/désactivent les actions selon
`permissions` + `canManageTeam`.

## Isolation & synchronisation

- Chaque membre porte `tenant_id` ; le store local est scopé au tenant
  (`createIndexedDbCache(tenantId)`).
- Toute création/mutation est poussée dans la file de synchronisation
  (outbox, `entity: "team_members"`, opération `INSERT`) puis flushée par le
  `SyncEngine`. Réconciliation et RLS réelles en phase 04.
- Le numéro de téléphone est le canal WhatsApp potentiel des rappels
  (phase 04) — on le normalise dès l'invitation.

## Interface

`src/app/equipe/page.tsx` (prérendu) → `src/features/team/TeamView.tsx` :

- liste des membres (avatar initiales, nom, rôle, statut, badge « Vous »),
  recherche ;
- invite en dialogue (nom, WhatsApp optionnel, rôle) ;
- actions par membre selon les permissions du connecté (Accepter
  l'invitation, changer le rôle, désactiver / réactiver) ;
- grille **Permissions par rôle** (✓ / — par catégorie).

## Fichiers

| Fichier | Rôle |
|---|---|
| `src/domain/team/roles.ts` | codes, labels, matrice, `can()` |
| `src/domain/team/teamMember.ts` | type + validation + gardes |
| `src/repository/ports/team.ts` | contrat du référentiel |
| `src/repository/local/team.ts` | implémentation IndexedDB |
| `src/application/team/teamService.ts` | cas d'usage (service) |
| `src/features/team/*` | facade + UI |
| `src/app/equipe/page.tsx` | route `/equipe` |

## Tests

- `tests/unit/team/team.test.ts` — matrice 0007, validation invitation, gardes.
- `tests/integration/team/teamService.test.ts` — inviter/accepter/rôle/
  désactivation/réactivation, refus sans `team.manage`, flush outbox idempotent.

Total suite : **151 tests**, typecheck/lint/build verts.