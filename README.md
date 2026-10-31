# MDT FiveM (ESX / QBCore) caché derrière des mini-jeux

Le MDT s'ouvre sur **Snake** et **Flappy**. Pour accéder au vrai MDT, il faut cliquer sur **Record** dans Snake (uniquement Snake), puis se connecter avec un compte.

## Fonctionnalités
- Mini-jeux Snake et Flappy (classement local)
- Comptes MDT (nom d'utilisateur + mot de passe haché), stockés en base MySQL
- Un compte par personnage, réservé aux jobs autorisés
- Blocage temporaire après plusieurs mots de passe erronés
- Tableau de bord, citoyens et casier, véhicules, rapports, avis de recherche
- Onglet **Comptes** : liste de tous les comptes créés, suppression par les administrateurs

## Prérequis
- [oxmysql](https://github.com/overextended/oxmysql)
- `es_extended` ou `qb-core`

## Installation
1. Dépose le dossier dans `resources/` (nommé `mdt`).
2. Ajoute `ensure mdt` dans `server.cfg`, après oxmysql et ton framework.
3. Les tables (`mdt_users`, `mdt_reports`, `mdt_warrants`, `mdt_records`) se créent automatiquement.
4. Configure `config.lua` : jobs autorisés, grades (levée d'avis, administrateur), touche (F6 par défaut).

> Si tu utilisais la version précédente, la table `mdt_accounts` n'est plus utilisée et peut être supprimée.

## Utilisation
1. `/mdt` ou F6 : ouvre les jeux. Échap : ferme.
2. Dans Snake, clique sur **Record**.
3. Première fois : **Créer un compte**. Ensuite : **Se connecter**.

## Licence
MIT
