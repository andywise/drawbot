![](drawbot.gif)

# Drawbot ✏️🤖

Drawing robot capable of rendering SVG paths over WebSockets. Powered by a Raspberry Pi running Node.js.

## Raspberry Pi Zero W Basic Setup
1. **Download and install [Etcher](https://etcher.io/)**.
2. **Download and install latest [Raspbian OS](https://www.raspberrypi.org/downloads/raspbian/)** and flash it onto your SD card with Etcher.
3. **Enable SSH** by adding a blank file named `ssh` (no extension) to the `boot` directory on the Pi's SD card. (Last tested with Raspbian Stretch Lite 2018-06-27 versiond.)
4. **Set up Wifi** by adding a file named `wpa_supplicant.conf` to the same `boot` directory with the following contents (replace `MySSID` and `MyPassword` with your credentials):  
	```
	ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev
	update_config=1
		
	network={ 
		ssid="MySSID" 
		psk="MyPassword" 
	}
	```

## Software Prerequisites
On the Drawbot Pi:

1. **Update, upgrade, and install NPM, Git.** (Automatically answer "yes" to everything.):
	* `sudo apt-get update`
	* `sudo apt-get upgrade`
	* `sudo apt-get install npm`
	* `sudo apt-get install git`

2. **Install Node.js.**
	* `sudo npm install -g n` (Install **n** for node.js version management. [github.com/tj/n](https://github.com/tj/n))
	* `sudo n stable` (Install latest stable version of Node.js. Last tested with v10.8.0)

3. **Upgrade NPM.** (and remove old apt-get version).
	* `sudo npm install npm@latest -g`
	* `sudo apt-get remove npm`
	* `sudo reboot`

4. **Install pigpio C library.** [npmjs.com/package/pigpio](https://www.npmjs.com/package/pigpio)
	* `sudo apt-get install pigpio` (Only if you're using Raspbian *Lite*.)
	* `npm install pigpio`

## Installation
On the Drawbot Pi:

1. `git clone` this repository.
2. `cd drawbot`
3. `npm i`

## Use
On the Drawbot Pi:

* Run `npm start` or `sudo node draw.js` to start the Drawbot controller.

## Controlling the Drawbot
On a device connected to the same local network as the Drawbot Pi:

* Go to [raspberrypi.local/control](http://raspberrypi.local/control) to access the Drawbot control interface.
* Use the "bullseye" interface to manually position the gondola, or raise/lower the pen/marker.
* Use the settings panel to configure the Drawbot's `D`, `X`, and `Y` values (see "Configuration" below).
* Drag and drop an SVG file onto the control interface to send artwork to the Drawbot!
* Note: Only the first `<path>` element will be drawn, so if necessary, combine artwork into a single compound path.

## Configuration
* Enter value for `D`: measure distance between string starting points (in millimeters).
* Enter starting `X` and `Y` values: measure distance from left and top (respectively) of left string starting point to initial pen position (also in mm).
* Note: Values will be stored in the `config.json` file.