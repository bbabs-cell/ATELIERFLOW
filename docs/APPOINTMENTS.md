# APPOINTMENTS.md — Rendez-vous & WhatsApp (Prompt 17)

Date : 2026-10-02 — Rendez-vous de l'atelier, rappels et messages WhatsApp (click-to-chat).
Vérifié : typecheck, lint, build prod, 277 tests ; migration `0019` sur PostgreSQL local
(base vierge 0000→0019 : 8/8 scénarios rendez-vous, 27/27 sync, 23/23 RLS, 20/20
invitations) ; parcours navigateur (création avec commande liée, rappel, WhatsApp,
modification d'horaire, mobile 390 px).

## 1. Rendez-vous

- Types : prise de mesures, essayage, retouches, livraison, retrait, paiement, autre.
- Statuts : `SCHEDULED → CONFIRMED/COMPLETED/CANCELLED/NO_SHOW`, `CONFIRMED →
  COMPLETED/CANCELLED/NO_SHOW`, `NO_SHOW → COMPLETED/CANCELLED` ; `COMPLETED` et
  `CANCELLED` terminaux. Aucune suppression.
- **Client lié** obligatoire ; **commande liée** optionnelle, forcément une commande de ce
  client (contrôlé dans l'application et par le serveur).
- **Modification** (`updateAppointment`) : client, commande, type, début/fin, note — tant
  que le rendez-vous n'est ni terminé ni annulé. Le statut ne change que par les actions.
- Horaires saisis à l'heure de l'appareil, enregistrés en ISO UTC.

## 2. Rappels

- `appointments.reminder_sent_at` (migration `0019`) : porté par le rendez-vous, donc
  partagé par toute l'équipe et synchronisé comme le reste du rendez-vous.
- **Rappel dû** (`reminderDue`) : rendez-vous planifié ou confirmé, à venir, aujourd'hui ou
  demain, sans rappel envoyé. Panneau « Rappels à envoyer » en haut de `/rdv`.
- Ouvrir WhatsApp avec un message de type « Rappel » marque le rappel envoyé.
- Changer l'horaire remet le rappel à zéro (l'ancien portait le mauvais horaire) et propose
  de prévenir le client.
- Avant 0019, un rappel était créé comme notification `WHATSAPP` ; le serveur refuse toute
  insertion de notification (`NOTIFICATIONS_OWN_UPDATE_ONLY`) : ces rappels restaient en
  conflit dans la file. Ils ne sont plus créés.

## 3. WhatsApp (sans API Business)

- **Message généré** (`src/domain/appointments/messages.ts`) : rappel, confirmation,
  changement d'horaire, annulation ; prénom du client, objet du rendez-vous avec accords
  (« vos retouches sont prévues », « la livraison … a été déplacée »), jour relatif
  (« aujourd'hui », « demain (samedi 3 octobre) »), heure, commande, adresse et nom de
  l'atelier (coordonnées des reçus, `tenants.settings.receipt`).
- **Modifiable** : `MessageComposer` — type de message, numéro, texte libre (1 500
  caractères), « Revenir au message proposé », « Copier ».
- **Numéro** (`src/domain/messaging/whatsapp.ts`) : international (+221…, 00221…) ou local
  complété avec l'indicatif du téléphone de l'atelier (0 initial retiré, sauf Côte d'Ivoire
  et Congo) ; sinon WhatsApp laisse choisir le contact.
- **Ouvrir WhatsApp** : lien `wa.me` ; l'utilisateur relit et envoie lui-même.
- Proposé aussi après une création (confirmation), un changement d'horaire et une
  annulation.

## 4. Intégration officielle future

`src/application/messaging/whatsappGateway.ts` : interface `WhatsAppGateway`
(`dispatch(message) → { mode: "CLICK_TO_CHAT", url } | { mode: "BUSINESS_API",
providerMessageId }`). Le MVP utilise `createClickToChatGateway`. Une passerelle
`BUSINESS_API` appellera une route serveur (le jeton Meta ne quitte jamais le serveur) avec
des modèles de messages validés par Meta ; les écrans n'auront pas à changer. Le contexte
(`entity`, `id`, `kind`) est déjà transmis pour l'historique d'envoi.

## 5. Serveur — `0019_appointments_reminders.sql`

- Colonne `reminder_sent_at`.
- `sync_apply_appointments` : à l'UPDATE, `order_id`, `ends_at`, `note`, `reminder_sent_at`
  présents dans la charge utile font foi (null = retirer) ; client et commande vérifiés
  dans l'atelier (INSERT et UPDATE), commande du même client ; transitions de statut
  contrôlées ; rendez-vous terminé/annulé verrouillé (`APPOINTMENT_CLOSED`).
- Validation : `supabase/validations/appointments_local.sql` (local uniquement).

## 6. Architecture

```
src/domain/appointments/appointments.ts   types, validation, transitions, isAppointmentEditable
src/domain/appointments/messages.ts       messages WhatsApp, jour relatif, reminderDue
src/domain/messaging/whatsapp.ts          numéros wa.me, indicatifs, lien
src/application/appointments/appointmentService.ts  create / update / transition / markReminderSent
src/application/messaging/whatsappGateway.ts        abstraction d'envoi (click-to-chat, future API)
src/features/appointments/AppointmentsView.tsx      rappels, calendrier, agenda, actions
src/features/appointments/AppointmentForm.tsx       création / modification, commande liée
src/features/appointments/MessageComposer.tsx       message modifiable + ouverture WhatsApp
```

## 7. Tests

`tests/unit/appointments/appointments.test.ts` — validation, transitions, helpers.
`tests/unit/appointments/messages.test.ts` — jour relatif et fuseau, messages et accords,
`reminderDue`, indicatifs, numéros locaux/internationaux, lien wa.me.
`tests/integration/appointments/appointmentService.test.ts` — création, plus de
notification, rappel envoyé, modification (commande d'un autre client refusée, rappel
conservé à horaire égal, remis à zéro si déplacé, clés nulles poussées), rendez-vous clos
verrouillé, flush idempotent.

## 8. Reste

- Envoi automatique par l'API WhatsApp Business (hors MVP).
- Rappels programmés côté serveur (cron) — inutile tant que l'envoi reste manuel.
