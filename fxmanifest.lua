fx_version 'cerulean'
game 'gta5'
lua54 'yes'

name 'mdt'
description 'MDT police (ESX / QBCore) cache derriere des mini-jeux'
version '2.0.0'

shared_script 'config.lua'
client_script 'client/main.lua'
server_scripts {
    '@oxmysql/lib/MySQL.lua',
    'server/main.lua'
}

ui_page 'html/index.html'
files {
    'html/index.html',
    'html/games.html',
    'html/style.css',
    'html/script.js'
}
