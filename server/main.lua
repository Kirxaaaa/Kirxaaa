local Framework, Core
local Sessions = {}   -- [source] = { uid, username, identifier }
local Attempts = {}   -- [source] = { count, lockedUntil }

CreateThread(function()
    if Config.Framework == 'esx' or (Config.Framework == 'auto' and GetResourceState('es_extended') == 'started') then
        Framework = 'esx'
        Core = exports['es_extended']:getSharedObject()
    elseif Config.Framework == 'qb' or (Config.Framework == 'auto' and GetResourceState('qb-core') == 'started') then
        Framework = 'qb'
        Core = exports['qb-core']:GetCoreObject()
    else
        print('^1[mdt] Aucun framework détecté (es_extended / qb-core).^0')
        return
    end
    print(('^2[mdt] Framework : %s^0'):format(Framework))

    MySQL.query.await([[CREATE TABLE IF NOT EXISTS mdt_users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(32) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        identifier VARCHAR(60) NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        job VARCHAR(50) NOT NULL,
        grade VARCHAR(60) DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_login TIMESTAMP NULL DEFAULT NULL)]])
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS mdt_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(120) NOT NULL,
        content TEXT NOT NULL,
        author VARCHAR(80) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)]])
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS mdt_warrants (
        id INT AUTO_INCREMENT PRIMARY KEY,
        citizen_name VARCHAR(100) NOT NULL,
        reason TEXT NOT NULL,
        author VARCHAR(80) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)]])
    MySQL.query.await([[CREATE TABLE IF NOT EXISTS mdt_records (
        id INT AUTO_INCREMENT PRIMARY KEY,
        citizen_id VARCHAR(60) NOT NULL,
        citizen_name VARCHAR(100) NOT NULL,
        type VARCHAR(20) NOT NULL,
        title VARCHAR(120) NOT NULL,
        amount INT DEFAULT 0,
        details TEXT,
        author VARCHAR(80) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX (citizen_id))]])
end)

AddEventHandler('playerDropped', function()
    Sessions[source] = nil
    Attempts[source] = nil
end)

---------------------------------------------------------------- Pont framework
local function getOfficer(src)
    if Framework == 'esx' then
        local p = Core.GetPlayerFromId(src)
        if not p then return end
        return { id = p.identifier, job = p.job.name, grade = p.job.grade, name = p.getName(), label = p.job.grade_label }
    elseif Framework == 'qb' then
        local p = Core.Functions.GetPlayer(src)
        if not p then return end
        local ci = p.PlayerData.charinfo
        return { id = p.PlayerData.citizenid, job = p.PlayerData.job.name, grade = p.PlayerData.job.grade.level,
                 name = ci.firstname .. ' ' .. ci.lastname, label = p.PlayerData.job.grade.name }
    end
end

-- Job autorisé (sans exiger de connexion)
local function getAuthorized(src)
    local o = getOfficer(src)
    if not o then return end
    local min = Config.Jobs[o.job]
    if min == nil or o.grade < min then return end
    return o
end

-- Job autorisé ET connecté : c'est la seule porte d'entrée du MDT
local function getSession(src)
    local s = Sessions[src]
    if not s then return end
    local o = getAuthorized(src)
    if not o or o.id ~= s.identifier then
        Sessions[src] = nil
        return
    end
    o.uid, o.username = s.uid, s.username
    o.admin = o.grade >= Config.AdminGrade
    return o
end

---------------------------------------------------------------- Données
local function clean(s, max)
    s = tostring(s or ''):gsub('^%s+', ''):gsub('%s+$', '')
    return s:sub(1, max)
end

local function dashboard()
    return {
        warrants = MySQL.query.await('SELECT * FROM mdt_warrants ORDER BY id DESC LIMIT 50'),
        reports  = MySQL.query.await('SELECT id, title, content, author, created_at FROM mdt_reports ORDER BY id DESC LIMIT 30'),
    }
end

local function sessionPayload(o)
    local data = dashboard()
    data.officer = {
        name = o.name, grade = o.label, username = o.username,
        admin = o.admin, canDelete = o.grade >= Config.DeleteWarrantGrade,
    }
    return data
end

local function pushRefresh()
    local data = dashboard()
    for _, id in ipairs(GetPlayers()) do
        id = tonumber(id)
        if getSession(id) then
            TriggerClientEvent('mdt:client:refresh', id, data)
        end
    end
end

local function listAccounts(query)
    return MySQL.query.await(
        'SELECT id, username, name, job, grade, created_at, last_login FROM mdt_users WHERE name LIKE ? OR username LIKE ? ORDER BY last_login DESC, id DESC LIMIT 200',
        { query, query }) or {}
end

---------------------------------------------------------------- Connexion
local function locked(src)
    local a = Attempts[src]
    if a and a.lockedUntil and a.lockedUntil > os.time() then
        return a.lockedUntil - os.time()
    end
end

local function fail(src)
    local a = Attempts[src] or { count = 0 }
    a.count = a.count + 1
    if a.count >= Config.MaxAttempts then
        a.count, a.lockedUntil = 0, os.time() + Config.LockSeconds
    end
    Attempts[src] = a
end

local function authError(src, msg)
    TriggerClientEvent('mdt:client:auth', src, { ok = false, error = msg })
end

local function authOk(src, o)
    Attempts[src] = nil
    TriggerClientEvent('mdt:client:auth', src, { ok = true, data = sessionPayload(o) })
end

RegisterNetEvent('mdt:server:open', function()
    local src = source
    local o = getSession(src)
    if o then
        return TriggerClientEvent('mdt:client:open', src, { session = true, payload = sessionPayload(o) })
    end
    if not Config.GamesOpenToEveryone and not getAuthorized(src) then return end
    TriggerClientEvent('mdt:client:open', src, { session = false })
end)

RegisterNetEvent('mdt:server:signup', function(username, password)
    local src = source
    local wait = locked(src)
    if wait then return authError(src, ('Trop d\'essais. Réessayez dans %d s.'):format(wait)) end

    local o = getAuthorized(src)
    if not o then return authError(src, 'Accès réservé aux forces de l\'ordre.') end

    username = clean(username, 24):lower()
    password = tostring(password or '')
    if #username < 3 or not username:match('^[%w_%.%-]+$') then
        return authError(src, 'Nom d\'utilisateur : 3 à 24 caractères (lettres, chiffres, _ . -).')
    end
    if #password < 6 or #password > 72 then
        return authError(src, 'Le mot de passe doit contenir entre 6 et 72 caractères.')
    end

    if MySQL.scalar.await('SELECT 1 FROM mdt_users WHERE username = ?', { username }) then
        return authError(src, 'Ce nom d\'utilisateur est déjà pris.')
    end
    if MySQL.scalar.await('SELECT 1 FROM mdt_users WHERE identifier = ?', { o.id }) then
        return authError(src, 'Ce personnage possède déjà un compte.')
    end

    local uid = MySQL.insert.await(
        'INSERT INTO mdt_users (username, password_hash, identifier, name, job, grade, last_login) VALUES (?,?,?,?,?,?,NOW())',
        { username, GetPasswordHash(password), o.id, o.name, o.job, o.label })
    if not uid then return authError(src, 'Création impossible. Réessayez.') end

    Sessions[src] = { uid = uid, username = username, identifier = o.id }
    o.uid, o.username, o.admin = uid, username, o.grade >= Config.AdminGrade
    authOk(src, o)
end)

RegisterNetEvent('mdt:server:login', function(username, password)
    local src = source
    local wait = locked(src)
    if wait then return authError(src, ('Trop d\'essais. Réessayez dans %d s.'):format(wait)) end

    local o = getAuthorized(src)
    if not o then return authError(src, 'Accès réservé aux forces de l\'ordre.') end

    username = clean(username, 24):lower()
    password = tostring(password or '')
    local acc = MySQL.single.await('SELECT id, username, password_hash, identifier FROM mdt_users WHERE username = ?', { username })

    if not acc or not VerifyPasswordHash(password, acc.password_hash) then
        fail(src)
        return authError(src, 'Identifiants incorrects.')
    end
    if acc.identifier ~= o.id then
        fail(src)
        return authError(src, 'Ce compte appartient à un autre personnage.')
    end

    MySQL.update.await('UPDATE mdt_users SET name = ?, job = ?, grade = ?, last_login = NOW() WHERE id = ?',
        { o.name, o.job, o.label, acc.id })
    Sessions[src] = { uid = acc.id, username = acc.username, identifier = o.id }
    o.uid, o.username, o.admin = acc.id, acc.username, o.grade >= Config.AdminGrade
    authOk(src, o)
end)

RegisterNetEvent('mdt:server:logout', function()
    Sessions[source] = nil
end)

---------------------------------------------------------------- MDT (connexion obligatoire)
RegisterNetEvent('mdt:server:search', function(kind, query)
    local src = source
    if not getSession(src) then return end
    query = '%' .. clean(query, 50) .. '%'
    local rows = {}

    if kind == 'citizen' then
        if Framework == 'esx' then
            rows = MySQL.query.await([[SELECT identifier AS id, CONCAT(firstname,' ',lastname) AS name,
                dateofbirth AS dob, sex FROM users
                WHERE CONCAT(firstname,' ',lastname) LIKE ? LIMIT 20]], { query })
        else
            rows = MySQL.query.await([[SELECT citizenid AS id,
                CONCAT(JSON_UNQUOTE(JSON_EXTRACT(charinfo,'$.firstname')),' ',JSON_UNQUOTE(JSON_EXTRACT(charinfo,'$.lastname'))) AS name,
                JSON_UNQUOTE(JSON_EXTRACT(charinfo,'$.birthdate')) AS dob,
                JSON_UNQUOTE(JSON_EXTRACT(charinfo,'$.gender')) AS sex
                FROM players
                HAVING name LIKE ? LIMIT 20]], { query })
        end
    elseif kind == 'vehicle' then
        if Framework == 'esx' then
            rows = MySQL.query.await([[SELECT ov.plate, ov.owner AS owner_id,
                CONCAT(u.firstname,' ',u.lastname) AS owner_name
                FROM owned_vehicles ov LEFT JOIN users u ON u.identifier = ov.owner
                WHERE ov.plate LIKE ? LIMIT 20]], { query })
        else
            rows = MySQL.query.await([[SELECT pv.plate, pv.vehicle AS model, pv.citizenid AS owner_id,
                CONCAT(JSON_UNQUOTE(JSON_EXTRACT(p.charinfo,'$.firstname')),' ',JSON_UNQUOTE(JSON_EXTRACT(p.charinfo,'$.lastname'))) AS owner_name
                FROM player_vehicles pv LEFT JOIN players p ON p.citizenid = pv.citizenid
                WHERE pv.plate LIKE ? LIMIT 20]], { query })
        end
    elseif kind == 'agent' then
        rows = listAccounts(query)
    elseif kind == 'report' then
        rows = MySQL.query.await('SELECT * FROM mdt_reports WHERE title LIKE ? OR content LIKE ? ORDER BY id DESC LIMIT 30', { query, query })
    end

    TriggerClientEvent('mdt:client:result', src, kind, rows or {})
end)

RegisterNetEvent('mdt:server:records', function(id)
    local src = source
    if not getSession(src) then return end
    local rows = MySQL.query.await('SELECT * FROM mdt_records WHERE citizen_id = ? ORDER BY id DESC LIMIT 50', { clean(id, 60) })
    TriggerClientEvent('mdt:client:result', src, 'records', rows or {})
end)

RegisterNetEvent('mdt:server:addReport', function(d)
    local src = source
    local o = getSession(src)
    if not o or type(d) ~= 'table' then return end
    local title, content = clean(d.title, 120), clean(d.content, 4000)
    if title == '' or content == '' then
        return TriggerClientEvent('mdt:client:notify', src, 'Titre et contenu obligatoires.')
    end
    MySQL.insert.await('INSERT INTO mdt_reports (title, content, author) VALUES (?,?,?)', { title, content, o.name })
    TriggerClientEvent('mdt:client:notify', src, 'Rapport enregistré.')
    pushRefresh()
end)

RegisterNetEvent('mdt:server:addWarrant', function(d)
    local src = source
    local o = getSession(src)
    if not o or type(d) ~= 'table' then return end
    local name, reason = clean(d.name, 100), clean(d.reason, 1000)
    if name == '' or reason == '' then
        return TriggerClientEvent('mdt:client:notify', src, 'Nom et motif obligatoires.')
    end
    MySQL.insert.await('INSERT INTO mdt_warrants (citizen_name, reason, author) VALUES (?,?,?)', { name, reason, o.name })
    TriggerClientEvent('mdt:client:notify', src, 'Avis de recherche émis.')
    pushRefresh()
end)

RegisterNetEvent('mdt:server:delWarrant', function(id)
    local src = source
    local o = getSession(src)
    if not o or o.grade < Config.DeleteWarrantGrade then
        return TriggerClientEvent('mdt:client:notify', src, 'Grade insuffisant.')
    end
    MySQL.update.await('DELETE FROM mdt_warrants WHERE id = ?', { tonumber(id) })
    TriggerClientEvent('mdt:client:notify', src, 'Avis de recherche levé.')
    pushRefresh()
end)

RegisterNetEvent('mdt:server:delAccount', function(id)
    local src = source
    local o = getSession(src)
    if not o or not o.admin then
        return TriggerClientEvent('mdt:client:notify', src, 'Réservé aux administrateurs.')
    end
    id = tonumber(id)
    if not id then return end
    if id == o.uid then
        return TriggerClientEvent('mdt:client:notify', src, 'Vous ne pouvez pas supprimer votre propre compte.')
    end
    MySQL.update.await('DELETE FROM mdt_users WHERE id = ?', { id })
    for s, sess in pairs(Sessions) do
        if sess.uid == id then
            Sessions[s] = nil
            TriggerClientEvent('mdt:client:notify', s, 'Votre compte MDT a été supprimé.')
        end
    end
    TriggerClientEvent('mdt:client:notify', src, 'Compte supprimé.')
    TriggerClientEvent('mdt:client:result', src, 'agent', listAccounts('%'))
end)

RegisterNetEvent('mdt:server:addRecord', function(d)
    local src = source
    local o = getSession(src)
    if not o or type(d) ~= 'table' then return end
    local types = { amende = true, arrestation = true, note = true }
    local kind = types[d.type] and d.type or 'note'
    local title = clean(d.title, 120)
    if title == '' or clean(d.id, 60) == '' then return end
    local amount = math.max(0, math.min(tonumber(d.amount) or 0, 1000000))
    MySQL.insert.await([[INSERT INTO mdt_records (citizen_id, citizen_name, type, title, amount, details, author)
        VALUES (?,?,?,?,?,?,?)]], { clean(d.id, 60), clean(d.name, 100), kind, title, amount, clean(d.details, 2000), o.name })
    TriggerClientEvent('mdt:client:notify', src, 'Entrée ajoutée au casier.')
    local rows = MySQL.query.await('SELECT * FROM mdt_records WHERE citizen_id = ? ORDER BY id DESC LIMIT 50', { clean(d.id, 60) })
    TriggerClientEvent('mdt:client:result', src, 'records', rows or {})
end)
