Config = {}

-- 'auto' détecte es_extended ou qb-core. Sinon : 'esx' | 'qb'
Config.Framework = 'auto'

Config.Command = 'mdt'
Config.DefaultKey = 'F6' -- modifiable par le joueur dans les paramètres GTA

-- true  : tout le monde peut ouvrir les mini-jeux (le MDT reste verrouillé derrière la connexion)
-- false : seuls les jobs autorisés ci-dessous peuvent ouvrir les mini-jeux
Config.GamesOpenToEveryone = true

-- Jobs autorisés à créer un compte / se connecter au MDT, avec le grade minimum
Config.Jobs = {
    police  = 0,
    sheriff = 0,
    gendarmerie = 0,
}

-- Grade minimum pour lever un avis de recherche
Config.DeleteWarrantGrade = 2

-- Grade minimum pour supprimer des comptes MDT
Config.AdminGrade = 3

-- true : il faut se reconnecter à chaque fermeture du MDT
-- false : la connexion dure jusqu'à la déconnexion du joueur ou au bouton "Se déconnecter"
Config.LogoutOnClose = false

-- Sécurité de la connexion
Config.MaxAttempts = 5      -- essais ratés avant blocage
Config.LockSeconds = 60     -- durée du blocage
