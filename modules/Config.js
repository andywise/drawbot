var jsonfile = require('jsonfile')

var Config = (file, callback) => {
    var c = {}

    c.data = {}
    c.save = (cb) => {
        jsonfile.writeFile(file, c.data,  {spaces: 2, EOL: '\r\n'}, function (err) {
          console.error(err)
          if(cb!=undefined) cb()
        })
    }

    var open = (cb) => {
        jsonfile.readFile(file, (err, o) => {
            c.data = o
            if(cb!=undefined) cb()
        })
    }
    open(callback)

    return c
}
module.exports = Config