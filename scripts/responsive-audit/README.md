# Audit responsive (prompt 24)

Banc d'audit automatisé : 21 écrans et fenêtres × 20 tailles (16 largeurs en portrait de
320 à 1920 px + 4 paysages), tactile émulé jusqu'à 1024 px. Mesure, dans le navigateur :
défilement horizontal de page, éléments hors écran, texte réellement coupé par son
conteneur, texte tronqué devenu illisible, cibles tactiles < 40 px. Plus un parcours
clavier (`kbd.mjs`).

```bash
npm run build && npx next start -p 3104 &          # application locale
npm i --no-save playwright                          # ou PLAYWRIGHT_MODULE=<chemin>/index.mjs
node seed.mjs                                       # données de test (noms longs…)
./matrix.sh && python3 report.py                    # matrice complète + synthèse
node kbd.mjs                                        # clavier : Tab, piège de focus, Échap
```

Variables : `AUDIT_BASE_URL`, `CHROMIUM_PATH`, `PLAYWRIGHT_MODULE`. Les sorties vont
dans `audit-output/` (ignoré par git). La session et l'API Supabase sont simulées
(aucun appel réseau réel).
