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

## Limites (phase 1)

Calcul sur l'appareil : l'application doit être ouverte ou en arrière-plan récent.
Sur iPhone, les notifications demandent l'application installée sur l'écran d'accueil
(iOS 16.4+). Une notification « push » envoyée par le serveur (application fermée,
téléphone verrouillé) demande une phase 2 : abonnements push en base, clés VAPID et
envoi planifié.

## Code

`src/domain/notifications/alerts.ts` (calcul, testé), `src/infrastructure/notifications/`
(sonnerie, notifications, réglages), `src/features/notifications/` (surveillance toutes
les 30 s, bandeau, réglages, invitation), `public/sw.js` (`notificationclick`).
