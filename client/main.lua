local isOpen = false

local function closeMDT()
    isOpen = false
    SetNuiFocus(false, false)
    SendNUIMessage({ action = 'close' })
    if Config.LogoutOnClose then TriggerServerEvent('mdt:server:logout') end
end

RegisterCommand(Config.Command, function()
    if isOpen then return closeMDT() end
    TriggerServerEvent('mdt:server:open')
end, false)

RegisterKeyMapping(Config.Command, 'Ouvrir les jeux', 'keyboard', Config.DefaultKey)

RegisterNetEvent('mdt:client:open', function(data)
    isOpen = true
    SetNuiFocus(true, true)
    SendNUIMessage({ action = 'open', data = data })
end)

RegisterNetEvent('mdt:client:auth', function(res)
    SendNUIMessage({ action = 'auth', res = res })
end)

RegisterNetEvent('mdt:client:refresh', function(data)
    SendNUIMessage({ action = 'refresh', data = data })
end)

RegisterNetEvent('mdt:client:result', function(kind, rows)
    SendNUIMessage({ action = 'result', kind = kind, rows = rows })
end)

RegisterNetEvent('mdt:client:notify', function(msg)
    SendNUIMessage({ action = 'toast', message = msg })
end)

-- Callbacks NUI -> serveur
RegisterNUICallback('close', function(_, cb) closeMDT() cb('ok') end)

RegisterNUICallback('login', function(d, cb)
    TriggerServerEvent('mdt:server:login', d.username, d.password)
    cb('ok')
end)

RegisterNUICallback('signup', function(d, cb)
    TriggerServerEvent('mdt:server:signup', d.username, d.password)
    cb('ok')
end)

RegisterNUICallback('logout', function(_, cb)
    TriggerServerEvent('mdt:server:logout')
    cb('ok')
end)

RegisterNUICallback('search', function(d, cb)
    TriggerServerEvent('mdt:server:search', d.kind, d.query)
    cb('ok')
end)

RegisterNUICallback('records', function(d, cb)
    TriggerServerEvent('mdt:server:records', d.id)
    cb('ok')
end)

RegisterNUICallback('addReport', function(d, cb)
    TriggerServerEvent('mdt:server:addReport', d)
    cb('ok')
end)

RegisterNUICallback('addWarrant', function(d, cb)
    TriggerServerEvent('mdt:server:addWarrant', d)
    cb('ok')
end)

RegisterNUICallback('delWarrant', function(d, cb)
    TriggerServerEvent('mdt:server:delWarrant', d.id)
    cb('ok')
end)

RegisterNUICallback('delAccount', function(d, cb)
    TriggerServerEvent('mdt:server:delAccount', d.id)
    cb('ok')
end)

RegisterNUICallback('addRecord', function(d, cb)
    TriggerServerEvent('mdt:server:addRecord', d)
    cb('ok')
end)

AddEventHandler('onResourceStop', function(res)
    if res == GetCurrentResourceName() and isOpen then
        SetNuiFocus(false, false)
    end
end)
