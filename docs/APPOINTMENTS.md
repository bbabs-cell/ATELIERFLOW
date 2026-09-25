# APPOINTMENTS.md — Rendez-vous & WhatsApp (Prompt 17)

Date : 2026-09-25 — Planification des rendez-vous de l'atelier et préparation des
messages WhatsApp. Vérifié : typecheck, lint, build prod, 121 tests verts (dont 17 pour
les rendez-vous).

## 1. Portée

- **Rendez-vous** par client : types `MEASUREMENTS, FITTING, ALTERATION, DELIVERY,
  PICKUP, PAYMENT, OTHER`, statuts `SCHEDULED, CONFIRMED, COMPLETED, CANCELLED, NO_SHOW`,
  créneau `starts_at`/`ends_at` (fin strictement après le début), note, lien optionnel
  vers une commande (`order_id`).
- **Rappels WhatsApp** : à la planification d'un rendez-vous pour un client **ayant un
  numéro WhatsApp**, une notification `WHATSAPP` de type `APPOINTMENT_REMINDER` est
  créée (titre, corps personnalisé, payload `{appointment_id, customer_id, starts_at,
  type, whatsapp}`). Aucun rappel sans numéro.
- **Absentéisme** : un RDV marqué `NO_SHOW` peut être re-planifié (`COMPLETED`) ou
  annulé (`CANCELLED`) — jamais supprimé.
- **Livraison réelle des messages : différée à la phase 04.** Le canal WhatsApp est une
  file de sortie (outbox) locale, poussée en sync comme toute entité ; son envoi
  effectif (Meta Graph API) se fera par le serveur provisionné. Le tenant propose
  WhatsApp via ses entitlements (`0005_subscriptions`.whatsapp).

## 2. Règles

- Validation : client obligatoire et existant, type connu, début valide, `ends_at`
  strictement après `starts_at` (même contrainte que `0003` `check (ends_at is null or
  ends_at > starts_at)`).
- Transitions bornées : `SCHEDULED → CONFIRMED/COMPLETED/CANCELLED/NO_SHOW`,
  `CONFIRMED → COMPLETED/CANCELLED/NO_SHOW`, `NO_SHOW → COMPLETED/CANCELLED` ;
  `COMPLETED` et `CANCELLED` terminaux (aucun retour).
- Rappel WhatsApp : un seul par rendez-vous (stricto sensu émis à chaque planification ;
  un doublon de planification étant interdit par conception, c'est une notification par
  RDV). Auto-généré uniquement si `customer.whatsapp` renseigné.
- `notification.markRead` est idempotente (relit l'horodatage existant, n'envoie pas
  d'UPDATE redondant).
- Aucune suppression : les rendez-vous vivent par statuts ; `deleted_at` reste libre pour
  futur market arc.

## 3. Architecture

```
src/domain/appointments/appointments.ts     types/statuts, validation, machine d'états, helpers
src/domain/appointments/notifications.ts    canaux IN_APP/WHATSAPP, validation de notification
src/repository/ports/appointments.ts        contrats appointments + notifications
src/repository/local/appointments.ts        IndexedDB (entités appointments + notifications)
src/application/appointments/appointmentService.ts  create/list/transition + rappel auto
src/application/appointments/notificationService.ts list/create/markRead
src/features/appointments/constants.ts      métadonnées UI (badges, actions)
src/features/appointments/facade.ts         partage l'engine de sync (clients)
src/features/appointments/AppointmentsView.tsx + AppointmentForm.tsx
src/app/rdv/page.tsx                        prérendue (statique)
```

## 4. UI (`/rdv`)

Calendrier mensuel (dots par rendez-vous) + agenda du jour sélectionné : heure de
début/fin, client, badges type + statut, mention « Rappel WhatsApp en attente » quand le
client a un numéro, actions de statut contextuelles et note. Dialogue « Nouveau
rendez-vous » : client, type, début/fin (datetime-local), note ; après création, le jour
du rendez-vous est affiché.

## 5. Tests

`tests/unit/appointments/appointments.test.ts` — validation des créneaux et nettoyage,
matrice de transitions, helpers jour/heure locaux, gardes de notification.
`tests/integration/appointments/appointmentService.test.ts` — création, rappel WhatsApp
généré (ou non selon le numéro), client introuvable, transitions + blocages, flush
idempotent (une INSERT par entité), `markRead` idempotent.

## 6. À faire (phases avancées / provisionnement)

- Envoi réel via Meta Graph API + statut `sent_at`, accusés, re-planification (Server).
- Rappel programmé aux heures de fermeture (cron serveur) pour RDV du lendemain.
- Lien reçu PDF → envoi WhatsApp au client (se recoupera avec Prompts 16/18).
- RLS `0008` : politiques `appointments_*` et `has_permission('appointments.*')`.