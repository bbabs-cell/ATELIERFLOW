# SKILLS — installation et vérification (Prompt 02)

Date : 2026-09-24

## Déjà présents (autochargés OpenCode)

| Skill | Emplacement | Description | Pertinence atelierflow |
|---|---|---|---|
| impeccable | `~/.claude/skills/impeccable` | UI/UX, design, audit d'interface | Oui — audits UI, responsif, a11y, design |
| gepeto | `~/.claude/skills/gepeto` + `~/.agents/skills/gepeto` (doublon identique) | Build de launchers one-click Pinokio | Non |
| pinokio | `~/.claude/skills/pinokio` + `~/.agents/skills/pinokio` (doublon identique) | Découverte/usage d'apps Pinokio | Non |

Vérifiés : frontmatter `name` + `description` valides, lisibles par OpenCode (scanner `**/SKILL.md`). `gepeto` et `pinokio` existent en double (`.claude` et `.agents`) avec un contenu identique — dédupliqués automatiquement, aucune action.

## Skills installés (projet — `.opencode/skills/`)

Skills écrits à la main, spécifiques aux invariants métier d'atelierflow. Aucun skill tiers téléchargé (règle : sources fiables uniquement).

| Skill | Fichier | Couvre |
|---|---|---|
| atelierflow-database | `.opencode/skills/atelierflow-database/SKILL.md` | supabase, postgres, migrations, money bigint, indexes, RLS d'entrée, tenant_id |
| atelierflow-finance | `.opencode/skills/atelierflow-finance/SKILL.md` | paiements, solde, surplus, annulation, reçus, idempotence, audit, tests financiers |
| atelierflow-auth-multitenant | `.opencode/skills/atelierflow-auth-multitenant/SKILL.md` | auth, sessions, rôles, permissions, RLS, isolation tenant |
| atelierflow-offline-sync | `.opencode/skills/atelierflow-offline-sync/SKILL.md` | offline-first, IndexedDB, sync queue, idempotence, conflits, PWA/SW |
| atelierflow-files | `.opencode/skills/atelierflow-files/SKILL.md` | Cloudflare R2, buckets privés, MIME, tailles, URLs signées, refus cross-tenant |
| atelierflow-design-system | `.opencode/skills/atelierflow-design-system/SKILL.md` | tokens palette atelier, typo, spacing, breakpoints 320→1920, a11y, tactile, états |

## Domaines volontairement non-installés

TypeScript, Next.js, React, Tailwind, Vercel, GitHub, testing, security, performance, error handling, etc.
→ Connaissance modèle + docs officielles. Pas de skills génériques superflus (règle anti-doublons / anti-junk). Les invites (03 MCP, 06 GitHub/Vercel) s'appuient sur des outils/MCP plutôt que des skills.

## Emplacement et activation

- Emplacement : `.opencode/skills/<name>/SKILL.md` — chemin project par défaut, aucun changement de config nécessaire.
- Chargé au démarrage d'OpenCode : **redémarrer OpenCode** pour que les nouveaux skills soient visibles.

## Vérification du format

- `name` en minuscules/hyphens, identique au nom de dossier, ≤ 64 caractères : OK pour les 6.
- `description` présente et orientée « quand déclencher » : OK.
- Emplacement conforme `**/SKILL.md` : OK.

## Impossibles à installer (ou considérés comme inutilement risqués)

- Skills tiers « Supabase/Next.js/... » non officiels : non installés (source non fiable → rejet).
- Skills duplicatant les 6 créés : exclus par construction.

## Recommandation

Avant chaque étape (07→26), charger le skill projet correspondant pour faire appliquer les invariants (finance, multitenant, offline, files, design system). Rajouter un point de contrôle « skills » dans les audits 23/24/25.