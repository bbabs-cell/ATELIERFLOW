# Alertes et sonnerie

Réglage par appareil : « Personnalisation → Alertes et sonnerie » (ou bandeau « Activer »
sur le tableau de bord et la page Rendez-vous).

## Ce qui sonne

| Alerte | Quand | Sonnerie |
|---|---|---|
| Rendez-vous imminent | 10 min à 2 h avant (réglable), jusqu'à 5 min après le début | insistante (3 fois) + longue vibration |
| Rappels WhatsApp à envoyer | rendez-vous d'aujourd'hui/demain sans rappel, une fois par jour après l'heure choisie | simple |
| Livraisons du jour / retards | une fois par jour | simple |
| Stock bas | une fois par jour | simple |

Chaque alerte : sonnerie (Web Audio, sans fichier), vibration (Android), notification du
système (via le service worker ; toucher → page concernée) et bandeau dans l'application.
Une alerte ne sonne qu'une fois (clés mémorisées sur l'appareil, 3 jours) ; un rendez-vous
déplacé sonne à nouveau. Limité aux droits du rôle.

## Application fermée (phase 2 : push)

Quand les alertes sont activées et que le téléphone a autorisé les notifications,
l'appareil s'abonne au service push de son navigateur (Google, Apple, Mozilla) avec la
clé publique de l'atelier. Chaque minute, `pg_cron` appelle la fonction Supabase
`push-alerts`, qui calcule les alertes dues pour chaque appareil
(`claim_due_push_alerts` : mêmes règles, mêmes droits, réglages de l'appareil) et les
envoie une seule fois (table `push_deliveries`). Les clés d'alerte sont les mêmes que
sur l'appareil : la notification push et l'alerte locale se remplacent, pas de doublon.

- Clés VAPID et secret du planificateur : créés au premier passage, gardés dans le Vault.
- Abonnement expiré (404/410) ou plus de 50 échecs : supprimé.
- « Envoyer une notification de test » (Personnalisation) : test sur ses propres appareils.
- iPhone : application installée sur l'écran d'accueil (iOS 16.4+) obligatoire.

Mise en place : migration `0028_push_notifications.sql`, puis
`supabase/setup/push_cron.sql` (production uniquement), puis déploiement de
`supabase/functions/push-alerts` (`verify_jwt` désactivé : la fonction vérifie elle-même
le secret du planificateur ou la session de l'utilisateur).

## Code

`src/domain/notifications/alerts.ts` (calcul, testé), `src/infrastructure/notifications/`
(sonnerie, notifications, réglages), `src/features/notifications/` (surveillance toutes
les 30 s, bandeau, réglages, invitation), `public/sw.js` (`push`, `notificationclick`), `src/infrastructure/notifications/push.ts`
(abonnement), `supabase/functions/push-alerts` (envoi).
