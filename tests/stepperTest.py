import sys
import time
import RPi.GPIO as GPIO

GPIO.setmode(GPIO.BCM)


directionPin_RIGHT = 6
stepPin_RIGHT = 13

directionPin_LEFT = 20
stepPin_LEFT = 21

servoPin = 18

stepsPerRevolution = 200
stepDelay = 1

# * Setup pins 
GPIO.setup(directionPin_LEFT, GPIO.OUT)
GPIO.setup(stepPin_LEFT, GPIO.OUT)
GPIO.setup(directionPin_RIGHT, GPIO.OUT)
GPIO.setup(stepPin_RIGHT, GPIO.OUT)
GPIO.setup(servoPin, GPIO.OUT)

try: 
    while True:
        # * Test the left motor
        print("Testing left motor: forward")
        GPIO.output(directionPin_LEFT, GPIO.HIGH)

        for i in range(stepsPerRevolution):
            print("Step")
            GPIO.output(stepPin_LEFT, GPIO.HIGH)
            time.sleep(stepDelay)
            GPIO.output(stepPin_LEFT, GPIO.LOW)
            time.sleep(stepDelay)

        time.sleep(5)

        print("Testing left motor: reverse")
        GPIO.output(directionPin_LEFT, GPIO.HIGH)

        for i in range(stepsPerRevolution):
            print("Step")
            GPIO.output(stepPin_LEFT, GPIO.HIGH)
            time.sleep(stepDelay)
            GPIO.output(stepPin_LEFT, GPIO.LOW)
            time.sleep(stepDelay)

        time.sleep(5)
except KeyboardInterrupt:
    print("Cleaning up gpio")
    GPIO.cleanup()
