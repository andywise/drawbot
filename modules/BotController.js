var Gpio = require('pigpio').Gpio
var cBezier = require('adaptive-bezier-curve')
var qBezier = require('adaptive-quadratic-curve')
var svgParse = require('svg-path-parser')
var arcToBezier = require('./arcToBezier')// copied from svg-arc-to-bezier npm library, because it uses es6 import instead of require

var BotController = (cfg) => {

    var bc = {}
    var config = cfg.data


    /////////////////////////////////
    // MAIN SETUP VARIABLES
    bc._BOT_ID      = config.botID            // || 'drawbot'
    bc._DIRSWAP     = config.swapDirections   // || [true, true]
    bc.baseDelay    = config.baseDelay        // || 2
    bc._D           = config.d                // || 1000// default distance between string starts
    bc.startPos     = config.startPos         // || { x: 100, y: 100 }
    bc.stepsPerMM   = config.stepsPerMM       // || [5000/500, 5000/500] // steps / mm
    bc.penPause     = config.penPauseDelay    // || 200 // pause for pen up/down movement (in ms)


    /////////////////////////////////
    // GPIO SETUP
    var gmOut = {mode: Gpio.OUTPUT}
    var dirPins = [
        new Gpio(config.pins.leftDir, gmOut),
        new Gpio(config.pins.rightDir, gmOut)
    ]
    var stepPins = [
        new Gpio(config.pins.leftStep, gmOut),
        new Gpio(config.pins.rightStep, gmOut)
    ]
    // set up servo GPIO pin
    var servo = new Gpio(config.pins.penServo, gmOut)

    // ^ Step resolution Pins
    const leftMotorMs1= new Gpio(config.stepResolutionPins.leftMotor.ms1, gmOut)
    const leftMotorMs2= new Gpio(config.stepResolutionPins.leftMotor.ms2, gmOut)
    const leftMotorMs3= new Gpio(config.stepResolutionPins.leftMotor.ms3, gmOut)
    const rightMotorMs1= new Gpio(config.stepResolutionPins.rightMotor.ms1, gmOut)
    const rightMotorMs2= new Gpio(config.stepResolutionPins.rightMotor.ms2, gmOut)
    const rightMotorMs3= new Gpio(config.stepResolutionPins.rightMotor.ms3, gmOut)

    // ^ Step resolution settings
    // * Were configuring our driver for an Eighth Step resolution. Also note that these pinouts
    // * correspond to the A4988 StepStick stepper motor driver:
    // ? https://www.pololu.com/product/1182
    // 
    // * We're not adjusting the values on the fly so they can be set here and not touched, but if your resolution
    // * needs to vary at runtime you can adjust the values of these pins. More information 
    // * on pin configurations can be found here:
    // ? https://howtomechatronics.com/tutorials/arduino/how-to-control-stepper-motor-with-a4988-driver-and-arduino/
    leftMotorMs1.digitalWrite(1)
    leftMotorMs2.digitalWrite(1)
    leftMotorMs3.digitalWrite(0)
    rightMotorMs1.digitalWrite(1)
    rightMotorMs2.digitalWrite(1)
    rightMotorMs3.digitalWrite(0)

    /////////////////////////////////
    // CONTROLLER VARIABLES

    // TODO: isolate private/public stuff

    bc.pos = {x:0, y:0}
    bc.penPos = 0
    bc.paused = false

    // string length stuff
    bc.startStringLengths = [0, 0]
    bc.stringLengths = [0, 0]
    bc.startSteps = [0, 0]
    bc.currentSteps = [0, 0]
    bc.stepCounts = [0, 0]
    bc.steppeds = [0, 0]
    bc.paths = []
    bc.drawingPath = false


    /////////////////////////////////
    // HARDWARE METHODS

    bc.updateStringLengths = () => {
        bc.startStringLengths = [
            Math.sqrt( (bc.startPos.x * bc.startPos.x) + (bc.startPos.y * bc.startPos.y) ),
            Math.sqrt( ( (bc._D - bc.startPos.x) * (bc._D - bc.startPos.x) ) + (bc.startPos.y * bc.startPos.y) )
        ]
        bc.stringLengths = [bc.startStringLengths[0],bc.startStringLengths[1]]
        bc.startSteps = [Math.round(bc.stringLengths[0] * bc.stepsPerMM[0]), Math.round(bc.stringLengths[1] * bc.stepsPerMM[1])]
        bc.currentSteps = [bc.startSteps[0], bc.startSteps[1]]

        console.log('bc.startPos',JSON.stringify(bc.startPos))
        console.log('startStringLengths', JSON.stringify(bc.startStringLengths))
        return bc.startStringLengths
    }

    bc.setStartPos = (data) => {
        cfg.data.startPos.x = bc.startPos.x = Number(data.x)// set values and store in config
        cfg.data.startPos.y = bc.startPos.y = Number(data.y)// set values and store in config
        cfg.save()// save to local config.json file
        bc.updateStringLengths()
    }
    bc.setD = (data) => {
        cfg.data.d = bc._D = Number(data)// set value and store in config
        cfg.save()// save to local config.json file
        bc.updateStringLengths()
    }

    bc.pen = (dir) => {
        bc.penPos = dir
        // 0=down, 1=up
        // 544 to 2400
        var servoMin = 544
        var servoMax = 2400
        var servoD = servoMax-servoMin
        var servoUpPos = servoMin+Math.floor(servoD*0.35)
        var servoDnPos = servoMin
        if(dir){
            // lift pen up
            // console.log('up')
            servo.servoWrite(servoUpPos)
        }else{
            // put pen down
            // console.log('down')
            servo.servoWrite(servoDnPos)
            // servo.digitalWrite(0)
        }
    }
    bc.penThen = (dir, callback) => {
        if(dir!=bc.penPos){
            bc.pen(dir)
            if (callback!=undefined){
                setTimeout(callback, bc.penPause)
            }
        }else{
            callback()
        }
    }

    bc.makeStep = (m, d) => {
        // console.log('step',d)
        if(bc._DIRSWAP[m]) d = !d// swap direction if that setting is on
        dirPins[m].digitalWrite(d)
        stepPins[m].digitalWrite(1)
        setTimeout(function(){
            stepPins[m].digitalWrite(0)
        },1) 
    }

    // TODO: This could move to a python script for faster execution (faster than bc.baseDelay=2 miliseconds)
    bc.rotateBoth = (s1, s2, d1, d2, callback) => {
        // console.log('bc.rotateBoth',s1,s2,d1,d2)
        var steps = Math.round(Math.max(s1,s2))
        var a1 = 0
        var a2 = 0
        var stepped = 0

        var doStep = function(){
            if(!bc.paused){
                setTimeout(function(){
                    // console.log(stepped,steps)
                    if(stepped<steps){
                        stepped++
                        // console.log('a1,a2',a1,a2)

                        a1 += s1
                        if(a1>=steps){
                            a1 -= steps
                            bc.makeStep(0,d1)
                        }

                        a2 += s2
                        if(a2>=steps){
                            a2 -= steps
                            bc.makeStep(1,d2)
                        }

                        doStep()

                    }else{
                        // console.log('bc.rotateBoth done!')
                        if (callback!=undefined) callback()
                    }
                }, bc.baseDelay)
            }else{
                // paused!
                console.log('paused!')
                bc.paused = false
            }
        }
        doStep()
    }

    bc.rotate = (motorIndex, dirIndex, delay, steps, callback) => {
        // console.log('bc.rotate',motorIndex, dirIndex, delay, steps)
        bc.stepCounts[motorIndex] = Math.round(steps)
        bc.steppeds[motorIndex] = 0
        // var dir = (dirIndex==1) ? 0 : 1// reverses direction

        // doStep, then wait for delay d
        var doStep = function(d, m){
            bc.makeStep(m, dirIndex)// changed to dirIndex from dir
            bc.steppeds[m]++
            if(bc.steppeds[m] < bc.stepCounts[m]){
                setTimeout(function(){
                    // console.log(m, bc.steppeds[m], "/", bc.stepCounts[m], d*bc.steppeds[m], "/", bc.stepCounts[m]*d)
                    doStep(d, m)
                }, d)
            }else{
                // done
                if(callback!=undefined) callback()
            }
        }
        doStep(delay,motorIndex)
    }


    /////////////////////////////////
    // DRAWING METHODS

    bc.moveTo = (x, y, callback, penDir = 1) => {
        // console.log('---------- bc.moveTo',x,y,' ----------')

        // convert x,y to l1,l2 (ideal, precise string lengths)
        var X = x + bc.startPos.x
        var Y = y + bc.startPos.y
        var X2 = X * X
        var Y2 = Y * Y
        var DsubX = bc._D - X
        var DsubX2 = DsubX * DsubX
        L1 = Math.sqrt( X2 + Y2 )
        L2 = Math.sqrt( DsubX2 + Y2 )

        // console.log('L:',L1,L2)

        // convert string lengths to motor steps (float to int)
        var s1 = Math.round(L1 * bc.stepsPerMM[0])
        var s2 = Math.round(L2 * bc.stepsPerMM[1])
        // console.log('s:',s1,s2)
        // console.log('bc.currentSteps:',bc.currentSteps[0],bc.currentSteps[1])

        // get difference between target steps and current steps (+/- int)
        var sd1 = s1 - bc.currentSteps[0]
        var sd2 = s2 - bc.currentSteps[1]
        // console.log('sd:',sd1,sd2)

        // get directions from steps difference
        var sdir1 = (sd1>0) ? 0 : 1
        var sdir2 = (sd2>0) ? 1 : 0
        // console.log('sdir:',sdir1,sdir2)

        // get steps with absolute value of steps difference
        var ssteps1 = Math.abs(sd1)
        var ssteps2 = Math.abs(sd2)
        // console.log('ssteps:',ssteps1,ssteps2)


        function doRotation(){
            // do the rotation!
            bc.rotateBoth(ssteps1,ssteps2,sdir1,sdir2,callback)

            // store new current steps
            bc.currentSteps[0] = s1
            bc.currentSteps[1] = s2

            // store new bc.pos
            bc.pos.x = x
            bc.pos.y = y
        }

        if(penDir != 0){
            // MOVETO (default)
            // pen up, then
            bc.penThen(1, doRotation)
        }else{
            // LINETO
            doRotation()
        }

    }

    bc.lineTo = (x,y,callback) => {
        // pen down, then

        bc.penThen(0,function(){
            bc.moveTo(Number(x), Number(y), callback, 0)// 0 makes bc.moveTo happen with pen down instead of up
        })
    }


    bc.addPath = (pathString) => {
        console.log('bc.addPath')
        bc.paths.push(pathString)
        console.log('pathcount: ',bc.paths.length)
        if(bc.paths.length==1 && bc.drawingPath==false){
            bc.drawNextPath()
        }
    }

    bc.pause = () => {
        bc.paused = true
    }

    bc.drawNextPath = () => {
        if(bc.paths.length>0){
            bc.drawPath(bc.paths.shift())// return/remove first path from array
        }else{
            console.log("Done drawing all the paths. :)")
        }
    }

    bc.drawPath = (pathString) => {
        bc.drawingPath = true
        console.log('drawing path...')
        var commands = svgParse(pathString)
        // var commands = pathString.split(/(?=[MmLlHhVvZz])/)
        var cmdCount = commands.length
        console.log(cmdCount)
        var cmdIndex = 0
        var prevCmd
        function doCommand(){
            if(cmdIndex<cmdCount){
                var cmd = commands[cmdIndex]
                var cmdCode = cmd.code
                var tox = bc.pos.x
                var toy = bc.pos.y
                cmdIndex++
                var percentage = Math.round((cmdIndex/cmdCount)*100)
                console.log(cmd, percentage + '%')
                if(bc.client) bc.client.emit('progressUpdate',{
                    botID: bc._BOT_ID,
                    percentage: percentage
                })
                if(bc.localio) bc.localio.emit('progressUpdate',{
                    percentage: percentage
                })
                switch (cmdCode){
                    case 'M':
                        // absolute move
                        tox = Number(cmd.x)
                        toy = Number(cmd.y)
                        bc.moveTo(Number(tox), Number(toy), doCommand)
                        break
                    case 'L':
                        // absolute line
                        tox = Number(cmd.x)
                        toy = Number(cmd.y)
                        bc.lineTo(Number(tox), Number(toy), doCommand)
                        break
                    case 'm':
                        // relative move
                        tox += Number(cmd.x)
                        toy += Number(cmd.y)
                        bc.moveTo(Number(tox), Number(toy), doCommand)
                        break
                    case 'l':
                        // relative line
                        tox += Number(cmd.x)
                        toy += Number(cmd.y)
                        bc.lineTo(Number(tox), Number(toy), doCommand)
                        break
                    case 'H':
                        // absolute horizontal line
                        tox = Number(cmd.x)
                        bc.lineTo(Number(tox), Number(toy), doCommand)
                        break
                    case 'h':
                        // relative horizontal line
                        tox += Number(cmd.x)
                        bc.lineTo(Number(tox), Number(toy), doCommand)
                        break
                    case 'V':
                        // absolute vertical line
                        toy = Number(cmd.y)
                        bc.lineTo(Number(tox), Number(toy), doCommand)
                        break
                    case 'v':
                        // relative vertical line
                        toy += Number(cmd.y)
                        bc.lineTo(Number(tox), Number(toy), doCommand)
                        break
                    case 'C':
                        // absolute cubic bezier curve
                        bc.drawCubicBezier(
                            // [{x:tox,y:toy}, {x:cmd.x1,y:cmd.y1}, {x:cmd.x2,y:cmd.y2}, {x:cmd.x,y:cmd.y}],
                            // 0.01,
                            [ [tox,toy], [cmd.x1,cmd.y1], [cmd.x2,cmd.y2], [cmd.x,cmd.y] ],
                            1,
                            doCommand
                        )
                        break
                    case 'c':
                        // relative cubic bezier curve
                        bc.drawCubicBezier(
                            // [{x:tox,y:toy}, {x:tox+cmd.x1,y:toy+cmd.y1}, {x:tox+cmd.x2,y:toy+cmd.y2}, {x:tox+cmd.x,y:toy+cmd.y}],
                            // 0.01,
                            [ [tox,toy], [tox+cmd.x1,toy+cmd.y1], [tox+cmd.x2,toy+cmd.y2], [tox+cmd.x,toy+cmd.y] ],
                            1,
                            doCommand
                        )
                        break
                    case 'S':
                        // absolute smooth cubic bezier curve
                        
                        // check to see if previous command was a C or S
                        // if not, the inferred control point is assumed to be equal to the start curve's start point
                        var inf
                        if (prevCmd.command.indexOf('curveto')<0){
                            inf = {
                                x:tox,
                                y:toy
                            }
                        }else{
                            // get absolute x2 and y2 values from previous command if previous command was relative
                            if(prevCmd.relative){
                                prevCmd.x2 = bc.pos.x - prevCmd.x + prevCmd.x2
                                prevCmd.y2 = bc.pos.y - prevCmd.y + prevCmd.y2
                            }
                            // calculate inferred control point from previous commands
                            // reflection of x2,y2 of previous commands
                            inf = {
                                x: tox+(tox-prevCmd.x2),// make prevCmd.x2 and y2 values absolute, not relative for calculation
                                y: toy+(toy-prevCmd.y2)
                            }
                        }

                        // draw it!
                        var pts = [ [tox,toy], [inf.x,inf.y], [cmd.x2,cmd.y2], [cmd.x,cmd.y] ]
                        console.log('calculated points:',pts)
                        bc.drawCubicBezier(
                            pts,
                            1,
                            doCommand
                        )
                        
                        break
                    case 's':
                        // relative smooth cubic bezier curve

                        // check to see if previous command was a C or S
                        // if not, the inferred control point is assumed to be equal to the start curve's start point
                        var inf
                        if (prevCmd.command.indexOf('curveto')<0){
                            inf = {
                                x:tox,
                                y:toy
                            }
                        }else{
                            // get absolute x2 and y2 values from previous command if previous command was relative
                            if(prevCmd.relative){
                                prevCmd.x2 = bc.pos.x - prevCmd.x + prevCmd.x2
                                prevCmd.y2 = bc.pos.y - prevCmd.y + prevCmd.y2
                            }
                            // calculate inferred control point from previous commands
                            // reflection of x2,y2 of previous commands
                            inf = {
                                x: tox+(tox-prevCmd.x2),
                                y: toy+(toy-prevCmd.y2)
                            }
                        }

                        // draw it!
                        bc.drawCubicBezier(
                            [ [tox,toy], [inf.x,inf.y], [tox+cmd.x2,toy+cmd.y2], [tox+cmd.x,toy+cmd.y] ],
                            1,
                            doCommand
                        )
                        break
                    case 'Q':
                        // absolute quadratic bezier curve
                        bc.drawQuadraticBezier(
                            [ [tox,toy], [cmd.x1,cmd.y1], [cmd.x,cmd.y] ],
                            1,
                            doCommand
                        )
                        break
                    case 'q':
                        // relative quadratic bezier curve
                        bc.drawQuadraticBezier(
                            [ [tox,toy], [tox+cmd.x1,toy+cmd.y1], [tox+cmd.x,toy+cmd.y] ],
                            1,
                            doCommand
                        )
                        break
                    
                    case 'T':
                        // absolute smooth quadratic bezier curve
                        
                        // check to see if previous command was a C or S
                        // if not, the inferred control point is assumed to be equal to the start curve's start point
                        var inf
                        if (prevCmd.command.indexOf('curveto')<0){
                            inf = {
                                x:tox,
                                y:toy
                            }
                        }else{
                            // get absolute x1 and y1 values from previous command if previous command was relative
                            if(prevCmd.relative){
                                prevCmd.x1 = bc.pos.x - prevCmd.x + prevCmd.x1
                                prevCmd.y1 = bc.pos.y - prevCmd.y + prevCmd.y1
                            }
                            // calculate inferred control point from previous commands
                            // reflection of x1,y1 of previous commands
                            inf = {
                                x: tox+(tox-prevCmd.x1),
                                y: toy+(toy-prevCmd.y1)
                            }
                        }

                        // draw it!
                        bc.drawQuadraticBezier(
                            [ [tox,toy], [inf.x,inf.y], [cmd.x,cmd.y] ],
                            1,
                            doCommand
                        )
                        
                        break
                    case 't':
                        // relative smooth quadratic bezier curve

                        // check to see if previous command was a C or S
                        // if not, the inferred control point is assumed to be equal to the start curve's start point
                        var inf
                        if (prevCmd.command.indexOf('curveto')<0){
                            inf = {
                                x:tox,
                                y:toy
                            }
                        }else{
                            // get absolute x1 and y1 values from previous command if previous command was relative
                            if(prevCmd.relative){
                                prevCmd.x1 = bc.pos.x - prevCmd.x + prevCmd.x1
                                prevCmd.y1 = bc.pos.y - prevCmd.y + prevCmd.y1
                            }
                            // calculate inferred control point from previous commands
                            // reflection of x2,y2 of previous commands
                            inf = {
                                x: tox+(tox-prevCmd.x1),
                                y: toy+(toy-prevCmd.y1)
                            }
                        }

                        // draw it!
                        bc.drawQuadraticBezier(
                            [ [tox,toy], [inf.x,inf.y], [tox+cmd.x,toy+cmd.y] ],
                            1,
                            doCommand
                        )
                        break

                    case 'A':
                        // absolute arc

                        // convert arc to cubic bezier curves
                        var curves = arcToBezier({
                            px: tox,
                            py: toy,
                            cx: cmd.x,
                            cy: cmd.y,
                            rx: cmd.rx,
                            ry: cmd.ry,
                            xAxisRotation: cmd.xAxisRotation,
                            largeArcFlag: cmd.largeArc,
                            sweepFlag: cmd.sweep
                        })
                        console.log(curves)

                        // draw the arc
                        bc.drawArc(curves,doCommand)
                        
                        break
                    
                    case 'a':
                        // relative arc TODO: CHECK THIS!

                        // convert arc to cubic bezier curves
                        var curves = arcToBezier({
                            px: tox,
                            py: toy,
                            cx: tox+cmd.x,// relative
                            cy: toy+cmd.y,// relative
                            rx: cmd.rx,
                            ry: cmd.ry,
                            xAxisRotation: cmd.xAxisRotation,
                            largeArcFlag: cmd.largeArc,
                            sweepFlag: cmd.sweep
                        })
                        console.log(curves)

                        // draw the arc
                        bc.drawArc(curves,doCommand)
                        
                        break

                    case 'Z':
                    case 'z':
                        // STOP
                        doCommand()
                        break
                }

                prevCmd = cmd
                
            }else{
                cmdCount = 0
                cmdIndex = 0
                console.log('path done!')
                bc.drawingPath = false
                bc.drawNextPath()
            }
        }
        doCommand()
    }

    bc.drawArc = (curves, callback) => {
        var n=0
        var cCount = curves.length
        function doCommand(){
            if(n<cCount){
                var crv = curves[n]
                // draw the cubic bezier curve created from arc input
                bc.drawCubicBezier(
                    [ [bc.pos.x, bc.pos.y], [crv.x1, crv.y1], [crv.x2, crv.y2], [crv.x, crv.y] ],
                    1,
                    doCommand
                )
                n++
            }else{
                if(callback!=undefined) callback()
            }
        }
        doCommand()
    }

    /// NEW WAY (adaptive, per https://www.npmjs.com/package/adaptive-bezier-curve)
    // TODO: combine cubic/quadratic versions into one with a parameter
    bc.drawCubicBezier = (points, scale=1, callback) => {
        var n = 0// curret bezier step in iteration
        var pts = cBezier(points[0], points[1], points[2], points[3], scale)
        var ptCount = pts.length
        function doCommand(){
            if(n<ptCount){
                var pt = pts[n]
                bc.lineTo(Number(pt[0]), Number(pt[1]), doCommand)
                n++
            }else{
                // console.log('bezier done!')
                if (callback!=undefined) callback()
            }
        }
        doCommand()
    }
    bc.drawQuadraticBezier = (points, scale=1, callback) => {
        var n = 0// curret bezier step in iteration
        var pts = qBezier(points[0], points[1], points[2], scale)
        var ptCount = pts.length
        function doCommand(){
            if(n<ptCount){
                var pt = pts[n]
                bc.lineTo(Number(pt[0]), Number(pt[1]), doCommand)
                n++
            }else{
                // console.log('bezier done!')
                if (callback!=undefined) callback()
            }
        }
        doCommand()
    }

    bc.drawCircle = (x, y, r, callback) => {
        // http://jsfiddle.net/heygrady/X5fw4/
        // Calculate a point on a circle
        function circle(t, radius) {
            var r = radius || 100,
                arc = Math.PI * 2

            // calculate current angle
            var alpha = t * arc

            // calculate current coords
            var x = Math.sin(alpha) * r,
                y = Math.cos(alpha) * r

            // return coords
            return [x, y * -1]
        }

        var n = 0 //current step
        var pi = 3.1415926
        var C = 2*pi*r
        var seg = C

        function doCommand(){
            if(n<=seg){
                var t = n/seg
                var p = circle(t, r)
                if(n==0){
                    bc.moveTo(x+p[0], y+p[1], doCommand)
                }else{
                    bc.lineTo(x+p[0], y+p[1], doCommand)
                }
                n++
            }else{
                if (callback!=undefined) callback()
            }
        }
        doCommand()
    }
    bc.drawCircles = (o) => {
        console.log(o.count)
        var count = o.count
        var n = 0
        function doCommand(){
            if(n<count){
                bc.drawCircle(o.x[n], o.y[n], o.r[n], doCommand)
                console.log(n/count)
                n++
            }else{
                console.log('done with circles!')
            }
        }
        doCommand()
    }

    return bc
}
module.exports = BotController

console.log("   ,--.                      ,--.          ,--.  \n ,-|  ,--.--.,--,--,--.   ,--|  |-. ,---.,-'  '-. \n' .-. |  .--' ,-.  |  |.'.|  | .-. | .-. '-.  .-' \n\\ `-' |  |  \\ '-'  |   .'.   | `-' ' '-' ' |  |   \n `---'`--'   `--`--'--'   '--'`---' `---'  `--'  ")
