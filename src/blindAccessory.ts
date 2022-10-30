/* eslint-disable indent */
import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {ConnectorHubClient} from './connectorHubClient';
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

  private client: ConnectorHubClient;

  constructor(
      private readonly platform: ConnectorHubPlatform,
      private readonly accessory: PlatformAccessory,
  ) {
    // Create a new client connection to the hub.
    this.client =
        new ConnectorHubClient(this.platform.config, this.platform.log);

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
    this.client.getDeviceState({
      deviceInfo: this.accessory.context.device,
      callback: (response) => {
        // Note that the hub reports 0 as fully open and 100 as closed; Homekit
        // expects the opposite.
        this.blindService.updateCharacteristic(
            this.platform.Characteristic.CurrentPosition,
            100 - response.data.currentPosition);

        // The 'operation' value mirrors the PositionState enum
        // 0 = decreasing, 1 = increasing, 2 = stopped
        this.blindService.updateCharacteristic(
            this.platform.Characteristic.PositionState,
            response.data.operation);
      },
    });
  }

  /**
   * Handle "SET" requests from HomeKit
   * These are sent when the user changes the state of an accessory, for
   * example, turning on a Light bulb.
   */
  async setTargetPosition(value: CharacteristicValue) {
    // Homekit positions are the inverse of what the hub expects.
    const adjustedTarget = (100 - <number>value);
    this.client.setTargetPositionOrAngle({
      deviceInfo: this.accessory.context.device,
      accessToken: this.platform.getAccessToken(),
      cmdType: 'targetPosition',
      cmdValue: adjustedTarget,
      callback: () => {/* no-op */},
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
