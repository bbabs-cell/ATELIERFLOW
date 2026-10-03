# Personnalisation : photo de profil, logo, couverture (`0025`)

Page **Personnalisation** (`/parametres`, menu) :

| Image | Qui | Où elle s'affiche | Réduction avant envoi |
|---|---|---|---|
| Photo de profil | chaque utilisateur, pour lui-même | carte du compte (menu) | 512 px |
| Logo de l'atelier | propriétaire (`tenant.settings`) | en haut du menu, à la place de l'icône | 768 px |
| Photo de couverture | propriétaire (`tenant.settings`) | fond du menu, floutée et voilée (bureau et téléphone) | 1 600 px |

- Stockage R2 : `profiles/{profil}/avatar-…`, `tenants/{atelier}/branding/{logo|cover}-…`.
  La base ne garde que la clé, écrite par `set_branding_image` qui vérifie
  l'emplacement ; l'ancienne image est supprimée au remplacement.
- `/api/branding` : liens signés de 12 h, gardés en cache sur l'appareil
  (une requête tant qu'ils sont valides).
- Tests : `branding_local.sql` (16), `tests/unit/branding/branding.test.ts`.
