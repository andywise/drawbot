
// LOCAL SERVER
// LocalServer.js

var express = require('express')
var app = express()
var server = require('http').Server(app)
var io = require('socket.io')(server)

var LocalServer = (cfg, controller) => {
    var c = controller
    var config = cfg.data

    var ls = {
        express: express,
        app: app,
        server: server,
        io: io
    }

    app.use(express.static('public'))

    io.on('connection', function (socket) {
        console.log('connection!')
        socket.emit('connected', { hello: 'world' })

        socket.on('pen',function(data){
            c.pen(data.up)
        })
        socket.on('r',function(data){
            c.rotate(Number(data.m), Number(data.dir), Number(data.d), Number(data.steps))
        })
        socket.on('drawpath',function(data){
            c.addPath(data.path)
        })
        socket.on('drawart',function(data){
            c.paths = []
            c.drawingPath = false
            c.addPath(data.path)
        })
        socket.on('setStartPos',function(data){
            c.setStartPos(data)
        })
        socket.on('setD',function(data){
            c.setD(Number(data.d))
        })
        socket.on('moveto',function(data){
            c.moveTo(data.x,data.y)
        })
        socket.on('getDXY', function(data){
            socket.emit('DXY',{
              d: c._D,
              x: c.startPos.x,
              y: c.startPos.y,
              strings: c.startStringLengths
          })
        })
        socket.on('pause', function(data){
            pause()
        })
        socket.on('reboot', function(data){
            exec('sudo reboot')
        })
    })

    ls.start = () => {
        server.listen(config.localPort, function(){
            console.log('listening on port '+config.localPort+'...')
        })
    }

    return ls
}
module.exports = LocalServer