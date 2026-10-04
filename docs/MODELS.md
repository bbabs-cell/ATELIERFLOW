# Galerie « Mes modèles »

Page `/modeles` (menu « Mes modèles »). Les créations de l'atelier en photos, à montrer et
à envoyer aux clients. En ligne uniquement (photos dans R2).

- Modèle : nom, catégorie (suggestions : grand boubou, robe, ensemble pagne…), prix
  indicatif, description ; jusqu'à 12 photos (catégorie de fichier `MODEL`).
- Grille avec vignette, filtres par catégorie, recherche.
- « Envoyer au client » : partage natif du téléphone (WhatsApp…) des 4 premières photos ;
  sur ordinateur, téléchargement. Octets servis par `GET /api/files/{id}` (session
  vérifiée, photo de l'atelier uniquement, type contrôlé).
- Lecture : tous les rôles (`orders.read`). Création / modification / suppression :
  `orders.write` (propriétaire, gérant, employé).

## Base : `0027_design_models.sql`

- `public.design_models`, RLS en lecture, aucune écriture directe ;
  `upsert_design_model` et `delete_design_model` (suppression logique du modèle et de
  ses photos), journal d'audit.
- `files.category` accepte `MODEL` ; `register_file` vérifie le dossier `models/` et
  l'existence du modèle dans l'atelier. Quota de stockage du plan inchangé.
- `supabase/validations/design_models_local.sql` : 22 vérifications.
