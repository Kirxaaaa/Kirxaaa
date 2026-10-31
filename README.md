# MDT web caché derrière des mini-jeux (Netlify)

Le site s'ouvre sur **Snake** et **Flappy**. Pour accéder au MDT : clique sur **Record** dans Snake (uniquement Snake), puis connecte-toi.

## Ce que contient le site
- `public/` : les jeux, l'écran de connexion et le MDT (citoyens, casier, véhicules, rapports, avis de recherche, comptes)
- `netlify/functions/api.mjs` : l'API (comptes, mots de passe hachés, données), stockée dans **Netlify Blobs**. Aucune base externe à configurer.

## Comptes
- **Le premier compte créé devient administrateur.** Crée donc le tien tout de suite après la mise en ligne.
- Les comptes suivants sont **en attente** : un administrateur les valide dans l'onglet **Comptes** (valider, révoquer, supprimer).
- Après 5 mots de passe faux, le compte est bloqué 60 secondes.

## Mise en ligne sur Netlify
1. Envoie ce dossier sur GitHub (dépôt à la racine : `package.json`, `netlify.toml`, `public/`, `netlify/`).
2. Sur Netlify : **Add new site → Import an existing project → GitHub**, choisis le dépôt.
3. Laisse les réglages par défaut (le fichier `netlify.toml` les fournit) et clique sur **Deploy**.
4. Ouvre le site, clique sur **Record** dans Snake, **Créer un compte** : tu es administrateur.

> Il faut un déploiement depuis GitHub (ou la CLI Netlify) : le simple glisser-déposer de dossier n'installe pas les dépendances de l'API.

## Facultatif
- Variable d'environnement `MDT_SECRET` (Site configuration → Environment variables) : clé de signature des sessions. Sans elle, une clé est générée automatiquement.
- Le site est en `noindex` pour ne pas apparaître dans les moteurs de recherche.

## Licence
MIT
