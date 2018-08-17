// socket.io Bot Client (as opposed to an "Input Client")
// BotClient.js

const { exec } = require('child_process') // https://nodejs.org/api/child_process.html
var ioc = require( 'socket.io-client' )

var BotClient = (cfg, controller) => {
    var c = controller
    var config = cfg.data
    var client = ioc.connect(config.remoteURL)

    client.once('connect',function(){
        console.log('bot connected to '+config.remoteURL+'!')
        client.emit('registerBot',config.botID)
    
        client.on('drawpath',function(data){
            c.addPath(data.path)
        })
        client.on('drawart',function(data){
            c.paths = []
            c.drawingPath = false
            c.addPath(data.path)
        })
        client.on('r',function(data){
            console.log('r',data)
            c.rotate(Number(data.m), Number(data.dir), Number(data.d), Number(data.steps))
        })
        client.on('pen',function(data){
            c.pen(data.up)
        })
        client.on('setStartPos',function(data){
            c.setStartPos(data)
            client.emit('DXY',{
              d: c._D,
              x: c.startPos.x,
              y: c.startPos.y,
              strings: c.startStringLengths,
              botID: c._BOT_ID
          })
        })
        client.on('setD',function(data){
            c.setD(Number(data.d))
            client.emit('DXY',{
              d: c._D,
              x: c.startPos.x,
              y: c.startPos.y,
              strings: c.startStringLengths,
              botID: c._BOT_ID
          })
        })
        client.on('moveto',function(data){
            c.moveTo(data.x,data.y)
        })
        client.on('getDXY', function(data){
            client.emit('DXY',{
              d: c._D,
              x: c.startPos.x,
              y: c.startPos.y,
              strings: c.startStringLengths,
              botID: c._BOT_ID
          })
        })
        client.on('pause', function(data){
            if(data.botID == c._BOT_ID) pause()
        })
        client.on('reboot', function(data){
            console.log('reboot',data)
            if(data.botID == c._BOT_ID) exec('sudo reboot')
        })
    })

    return client
}



module.exports = BotClient