/* eslint-disable indent */
import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import * as connectorhub from './connector-helpers';
import {ConnectorHubPlatform} from './platform';

/**
 * Platform Accessory
 * An instance of this class is created for each accessory your platform
 * registers Each accessory may expose multiple services of different service
 * types.
 */
export class BlindAccessory {
  private blindService: Service;
  // private batteryService: Service;

  private static readonly kMinRefreshInterval = 2000;
  private lastRefresh = (new Date(0)).getTime();
  private currentState = null;

  constructor(
      private readonly platform: ConnectorHubPlatform,
      private readonly accessory: PlatformAccessory,
  ) {
    // set accessory information
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(this.platform.Characteristic.Manufacturer, 'Dooya');
    // .setCharacteristic(this.platform.Characteristic.Model, 'Default-Model')
    // .setCharacteristic(
    //     this.platform.Characteristic.SerialNumber, accessory.UUID);

    // get the service if it exists, otherwise create a new service. you can
    // create multiple services for each accessory.
    // TODO: add a service for the battery here.
    this.blindService =
        this.accessory.getService(this.platform.Service.WindowCovering) ||
        this.accessory.addService(this.platform.Service.WindowCovering);

    // set the service name, this is what is displayed as the default name on
    // the Home app in this example we are using the name we stored in the
    // `accessory.context` in the `discoverDevices` method.
    this.blindService.setCharacteristic(
        this.platform.Characteristic.Name,
        accessory.context.device.displayName);

    // each service must implement at-minimum the "required characteristics" for
    // the given service type see
    // https://developers.homebridge.io/#/service/Lightbulb
    /*
        // register handlers for the CurrentPosition Characteristic
        this.blindService
            .getCharacteristic(this.platform.Characteristic.CurrentPosition)
            .onGet(this.getCurrentPosition.bind(this));

        // register handlers for the PositionState Characteristic
        this.blindService
            .getCharacteristic(this.platform.Characteristic.PositionState)
            .onGet(this.getPositionState.bind(this));
    */
    // register handlers for the TargetPosition Characteristic
    this.blindService
        .getCharacteristic(this.platform.Characteristic.TargetPosition)
        //.onGet(this.getTargetPosition.bind(this))
        .onSet(this.setTargetPosition.bind(this));

    // Periodically refresh the status of the device.
    setInterval(() => {
      this.updateDeviceStatus();
    }, BlindAccessory.kMinRefreshInterval);
  }

  updateDeviceStatus() {
    connectorhub.getDeviceState({
      deviceInfo: this.accessory.context.device,
      callback: (response) => {
        const currentState = (this.currentState || response);

        this.blindService.updateCharacteristic(
            this.platform.Characteristic.CurrentPosition,
            response.currentPosition);

        const direction =
            response.currentPosition - currentState.currentPosition;
        const posState =
            (direction === 0 ?
                 this.platform.Characteristic.PositionState.STOPPED :
                 (direction > 0) ?
                 this.platform.Characteristic.PositionState.INCREASING :
                 this.platform.Characteristic.PositionState.DECREASING);
        this.blindService.updateCharacteristic(
            this.platform.Characteristic.PositionState, posState);

        this.currentState = response;
      },
    });
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for
   * example, turning on a Light bulb.
   */
  async setTargetPosition(value: CharacteristicValue) {
    connectorhub.setTargetPositionOrAngle({
      deviceInfo: this.accessory.context.device,
      accessToken: this.platform.getAccessToken(),
      cmdType: 'targetPosition',
      cmdValue: value.valueOf(),
      callback: () => { /* no-op */ },
    });
    this.platform.log.debug('Set Characteristic TargetPosition ->', value);
  }

  /**
   * Handle the "GET" requests from HomeKit
   * These are sent when HomeKit wants to know the current state of the
   accessory, for example, checking if a Light bulb is on.
   *
   * GET requests should return as fast as possbile. A long delay here will
   result in
   * HomeKit being unresponsive and a bad user experience in general.
   *
   * If your device takes time to respond you should update the status of your
   device
   * asynchronously instead using the `updateCharacteristic` method instead.

   * @example
   * this.service.updateCharacteristic(this.platform.Characteristic.On, true)
   */
  async getCurrentPosition(): Promise<CharacteristicValue> {
    // implement your own code to check if the device is on
    const isOn = true;

    this.platform.log.debug('Get Characteristic On ->', isOn);

    // if you need to return an error to show the device as "Not Responding" in
    // the Home app: throw new
    // this.platform.api.hap.HapStatusError(this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);

    return isOn;
  }
}
