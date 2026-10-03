# Pays, monnaie et convertisseur (`0026`)

## Monnaie de l'atelier
- Le **pays** est demandé à l'inscription puis à la création de l'atelier
  (pré-rempli). Il fixe la **monnaie** de l'atelier (`tenants.currency`,
  F CFA par défaut : les ateliers existants ne changent pas).
- Tous les montants de l'atelier (commandes, paiements, stock, reçus,
  « Arrêté à la somme de … ») s'affichent dans cette monnaie.
  Les montants restent des **entiers** (pas de centimes).
- Monnaie modifiable dans **Personnalisation → Pays et monnaie** tant
  qu'aucune commande ni paiement n'existe (`CURRENCY_LOCKED` ensuite :
  changer d'unité fausserait les montants déjà saisis). Le pays reste
  modifiable vers un pays de même monnaie.
- Catalogue : `src/domain/geo/countries.ts` (37 pays, 21 monnaies).

## Convertisseur des prix des plans
- Les plans restent facturés en **F CFA** (montant calculé par le serveur).
- L'équivalent **indicatif** s'affiche dans la monnaie locale : page
  Abonnement (monnaie de l'atelier), formulaire de paiement (pays choisi),
  vitrine (menu « Voir aussi les prix en », deviné d'après le navigateur).
- `/api/rates` : taux du jour depuis XOF (open.er-api.com, cache 6 h) ;
  parités fixes garanties sans service externe : € (655,957), F CFA CEMAC,
  franc comorien.

## Équipe
- Le propriétaire peut **retirer** une personne (en plus de la
  désactiver) : seul l'accès est supprimé, le travail passé reste ; trace
  dans l'audit. Impossible de se retirer soi-même ou de retirer un
  propriétaire.

## Reçus et alertes
- Le **logo** de l'atelier apparaît sur le reçu (écran et PDF), servi par
  `/api/branding/logo` (même origine).
- **Alerte e-mail** à `PLATFORM_ALERT_EMAIL` quand un atelier envoie une
  preuve de paiement (Resend, `RESEND_API_KEY`). Sans clé : pas d'alerte.

Tests : `team_locale_local.sql` (16), `tests/unit/geo/currency.test.ts`,
`tests/unit/subscriptions/paymentAlert.test.ts`, reçu PDF avec logo.
