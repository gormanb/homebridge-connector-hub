/* eslint-disable indent */
import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import * as helpers from './connectorhub/connector-hub-helpers';
import {ConnectorHubClient} from './connectorhub/connectorHubClient';
import {ConnectorHubPlatform} from './platform';

/**
 * An instance of this class is created for each accessory. Exposes both the
 * WindowCovering and Battery services for the blind.
 */
export class BlindAccessory {
  private static readonly kRefreshInterval = 5000;

  private client: ConnectorHubClient;
  private batteryService: Service;
  private blindService: Service;

  // Cached device status, updated periodically.
  private currentState: any = undefined;
  private lastState: any = undefined;

  constructor(
      private readonly platform: ConnectorHubPlatform,
      private readonly accessory: PlatformAccessory,
      private readonly hubToken: string,
  ) {
    // Create a new client connection for this device.
    this.client = new ConnectorHubClient(
        this.platform.config, this.accessory.context.device, this.hubToken,
        this.platform.log);

    // Set the accessory information to be displayed in Homekit.
    this.setAccessoryInformation();

    // Get the WindowCovering service if it exists, otherwise create one.
    this.blindService =
        this.accessory.getService(this.platform.Service.WindowCovering) ||
        this.accessory.addService(this.platform.Service.WindowCovering);

    // Add a service to report the battery level.
    this.batteryService =
        this.accessory.getService(this.platform.Service.Battery) ||
        this.accessory.addService(this.platform.Service.Battery);

    // Set the service name. This is the default name displayed by Homekit.
    this.blindService.setCharacteristic(
        this.platform.Characteristic.Name, accessory.displayName);
    this.batteryService.setCharacteristic(
        this.platform.Characteristic.Name, `${accessory.displayName} Battery`);

    // Initialize the device state and set up a periodic refresh.
    this.updateDeviceStatus();
    setInterval(
        () => this.updateDeviceStatus(), BlindAccessory.kRefreshInterval);

    // Register handlers for the CurrentPosition Characteristic.
    this.blindService
        .getCharacteristic(this.platform.Characteristic.CurrentPosition)
        .onGet(this.getCurrentPosition.bind(this));

    // Register handlers for the TargetPosition Characteristic
    this.blindService
        .getCharacteristic(this.platform.Characteristic.TargetPosition)
        .onSet(this.setTargetPosition.bind(this));
  }

  // Update the device information displayed in Homekit.
  setAccessoryInformation(modelNum = 0, manufacturer = 'Dooya') {
    const Characteristic = this.platform.Characteristic;
    const deviceInfo = this.accessory.context.device;
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.Manufacturer, manufacturer)
        .setCharacteristic(Characteristic.SerialNumber, deviceInfo.mac)
        .setCharacteristic(
            Characteristic.FirmwareRevision, deviceInfo.fwVersion)
        .setCharacteristic(
            Characteristic.Model, helpers.getDeviceModel(modelNum));
  }

  /**
   * This function is the main driver of the plugin. It periodically reads the
   * current device state from the hub and, if relevant values have changed,
   * pushes the new state to Homekit. This approach is taken because pulling the
   * status from the hub whenever Homekit requests it is too slow.
   */
  async updateDeviceStatus() {
    // Obtain the latest status from the device.
    const newState = await this.client.getDeviceState();

    // Update the cached current and last-good copies of the device status.
    this.lastState = (this.currentState || this.lastState);
    this.currentState = newState;

    // If we didn't hear back from the device, exit early.
    if (!newState) {
      this.platform.log.debug('Failed to update ', this.accessory.displayName);
      return;
    }

    // If this is the first time we've read the device, update the model type.
    if (!this.lastState) {
      this.setAccessoryInformation(newState.data.type);
    }

    // Note that the hub reports 0 as fully open and 100 as closed; Homekit
    // expects the opposite. We extract 'lastPos' as below because lastState
    // will be undefined on the first iteration, and so we force an update.
    const lastPos = (this.lastState && this.lastState.data.currentPosition);
    if (newState.data.currentPosition !== lastPos) {
      const newPos = (100 - newState.data.currentPosition);
      this.platform.log.debug(
          'Updating position ', [this.accessory.displayName, newPos]);
      // Update the TargetPosition, since we've just reached it, and the actual
      // CurrentPosition. Syncs Homekit if blinds are moved by another app.
      this.blindService.updateCharacteristic(
          this.platform.Characteristic.TargetPosition, newPos);
      this.blindService.updateCharacteristic(
          this.platform.Characteristic.CurrentPosition, newPos);
    }

    // Update the battery level if it has changed since the last refresh.
    const lastBattery = (this.lastState && this.lastState.data.batteryLevel);
    if (newState.data.batteryLevel !== lastBattery) {
      const batteryPercent =
          helpers.getBatteryPercent(newState.data.batteryLevel);
      this.platform.log.debug(
          'Updating battery ', [this.accessory.displayName, batteryPercent]);
      // Push the new battery percentage level to Homekit.
      this.batteryService.updateCharacteristic(
          this.platform.Characteristic.BatteryLevel, batteryPercent);
      this.batteryService.updateCharacteristic(
          this.platform.Characteristic.StatusLowBattery,
          helpers.isLowBattery(newState.data.batteryLevel));
      this.batteryService.updateCharacteristic(
          this.platform.Characteristic.ChargingState,
          newState.data.chargingState);
    }

    // The 'data.operation' value mirrors the Characteristic.PositionState enum:
    //
    // PositionState extends Characteristic {
    //   static readonly DECREASING = 0;
    //   static readonly INCREASING = 1;
    //   static readonly STOPPED = 2;
    // }
    //
    // However, real-time polling of the blinds causes severe degradation of
    // responsiveness over time; we therefore use passive read requests, which
    // only update the state after each movement is complete. This means that
    // only the position ever changes; the PositionState is always STOPPED. For
    // this reason, we don't bother reporting it. It is sufficient to report the
    // TargetPosition and CurrentPosition, and this also makes it simple to keep
    // Homekit in sync with external movement of the blinds.
  }

  /**
   * Handle "set TargetPosition" requests from HomeKit. These are sent when the
   * user changes the state of the blind. Throws SERVICE_COMMUNICATION_FAILURE
   * if the hub cannot be contacted.
   */
  async setTargetPosition(value: CharacteristicValue) {
    // Homekit positions are the inverse of what the hub expects.
    const adjustedTarget = (100 - <number>value);
    const ack = await this.client.setTargetPosition(adjustedTarget);
    if (!ack) {
      this.platform.log.debug('Failed to target', this.accessory.displayName);
      throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    this.platform.log.debug(
        'Targeted: ', [this.accessory.displayName, adjustedTarget]);
  }

  /**
   * Handle "get CurrentPosition" requests from HomeKit. Returns the most recent
   * value cached by the periodic updater; throws SERVICE_COMMUNICATION_FAILURE
   * if the most recent attempt to contact the hub failed.
   */
  async getCurrentPosition(): Promise<CharacteristicValue> {
    if (!this.currentState) {
      this.platform.log.debug(
          'Failed to get position: ', this.accessory.displayName);
      throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    // Note that the hub reports 0 as fully open and 100 as closed; Homekit
    // expects the opposite.
    const currentPos = (100 - this.currentState.data.currentPosition);
    this.platform.log.debug(
        'Returning position: ', [this.accessory.displayName, currentPos]);
    return currentPos;
  }
}
