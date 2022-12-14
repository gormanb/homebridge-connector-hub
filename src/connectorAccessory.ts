/* eslint-disable indent */
import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {ReadDeviceAck, WriteDeviceAck} from './connectorhub/connector-hub-api';
import * as helpers from './connectorhub/connector-hub-helpers';
import {ConnectorHubClient} from './connectorhub/connectorHubClient';
import {ConnectorHubPlatform} from './platform';
import {Log} from './util/log';

// Response types we expect for device status. Undefined if no response.
type ReadDeviceResponse = ReadDeviceAck|undefined;
type WriteDeviceResponse = WriteDeviceAck|undefined;

/**
 * An instance of this class is created for each accessory. Exposes both the
 * WindowCovering and Battery services for the device.
 */
export class ConnectorAccessory {
  private static readonly kRefreshInterval = 5000;

  private client: ConnectorHubClient;
  private batteryService: Service;
  private wcService: Service;

  // Cached device status, updated periodically.
  private currentState: ReadDeviceResponse;
  private lastState: ReadDeviceResponse;

  // Current target position for this device.
  private currentTargetPos = -1;

  // Does the device only support binary open / close?
  private usesBinaryState = false;

  constructor(
      private readonly platform: ConnectorHubPlatform,
      private readonly accessory: PlatformAccessory,
      private readonly hubToken: string,
  ) {
    // Create a new client connection for this device.
    this.client = new ConnectorHubClient(
        this.platform.config, this.accessory.context.device, this.hubToken);

    // Get the WindowCovering service if it exists, otherwise create one.
    this.wcService =
        this.accessory.getService(this.platform.Service.WindowCovering) ||
        this.accessory.addService(this.platform.Service.WindowCovering);

    // Add a service to report the battery level.
    this.batteryService =
        this.accessory.getService(this.platform.Service.Battery) ||
        this.accessory.addService(this.platform.Service.Battery);

    // Initialize the device state and set up a periodic refresh.
    this.updateDeviceStatus();
    setInterval(
        () => this.updateDeviceStatus(), ConnectorAccessory.kRefreshInterval);

    // Register handlers for the CurrentPosition Characteristic.
    this.wcService
        .getCharacteristic(this.platform.Characteristic.CurrentPosition)
        .onGet(this.getCurrentPosition.bind(this));

    // Register handlers for the PositionState Characteristic.
    this.wcService.getCharacteristic(this.platform.Characteristic.PositionState)
        .onGet(this.getPositionState.bind(this));

    // Register handlers for the TargetPosition Characteristic
    this.wcService
        .getCharacteristic(this.platform.Characteristic.TargetPosition)
        .onGet(this.getTargetPosition.bind(this))
        .onSet(this.setTargetPosition.bind(this));
  }

  // Update the device information displayed in Homekit. Only called once.
  setAccessoryInformation(deviceState: ReadDeviceAck) {
    const Characteristic = this.platform.Characteristic;
    const deviceInfo = this.accessory.context.device;

    // Update the accessory display name, in case it wasn't set already.
    this.accessory.displayName =
        helpers.makeDeviceName(deviceInfo.devNum, deviceState.data.type);
    this.platform.api.updatePlatformAccessories([this.accessory]);

    // Set the service names. These are the default names displayed by Homekit.
    this.wcService.setCharacteristic(
        Characteristic.Name, this.accessory.displayName);
    this.batteryService.setCharacteristic(
        Characteristic.Name, `${this.accessory.displayName} Battery`);

    // Update default accessory name and additional information in Homekit.
    this.accessory.getService(this.platform.Service.AccessoryInformation)!
        .setCharacteristic(Characteristic.Name, this.accessory.displayName)
        .setCharacteristic(Characteristic.Manufacturer, 'Dooya')
        .setCharacteristic(Characteristic.SerialNumber, deviceInfo.mac)
        .setCharacteristic(
            Characteristic.FirmwareRevision, deviceInfo.fwVersion)
        .setCharacteristic(
            Characteristic.Model,
            helpers.getDeviceModel(deviceState.data.type));
  }

  /**
   * This function is the main driver of the plugin. It periodically reads the
   * current device state from the hub and, if relevant values have changed,
   * pushes the new state to Homekit. This approach is taken because pulling the
   * status from the hub whenever Homekit requests it is too slow. It also means
   * that Homekit will stay in sync with any external changes to the device
   * state, e.g. if the device is moved using a physical remote.
   *
   * Note that the hub does not report real-time values; it only updates the
   * device state when a movement completes.
   */
  async updateDeviceStatus() {
    // Obtain the latest status from the device.
    const newState = <ReadDeviceResponse>(await this.client.getDeviceState());

    // Update the cached current and last-good copies of the device status.
    this.lastState = (this.currentState || this.lastState);
    this.currentState = newState;

    // If we didn't hear back from the device, exit early.
    if (!newState) {
      Log.warn('Periodic refresh failed:', this.accessory.displayName);
      return;
    }

    // Determine whether the device only reports binary open / closed state,
    // then sanitize the status object to conform to the expected format.
    this.usesBinaryState = (newState.data.currentPosition === undefined);
    this.currentState = helpers.sanitizeDeviceState(newState);

    // The first time we read the device, we update the accessory details.
    if (!this.lastState) {
      this.setAccessoryInformation(newState);
    }

    // We extract 'lastPos' as below because lastState will be undefined on the
    // first iteration, so we wish to force an update.
    const lastPos = (this.lastState && this.lastState.data.currentPosition);
    if (newState.data.currentPosition !== lastPos) {
      // Log a message for the user, with additional information in debug mode.
      const newPos = helpers.toHomekitPercent(newState.data.currentPosition);
      Log.debug(`Updated ${this.accessory.displayName} state:`, newState);
      Log.info('Updating position:', [this.accessory.displayName, newPos]);

      // The hub updates only after completing each movement. Update the target
      // position to match the new currentPosition. Usually this is a no-op, but
      // it will keep Homekit in sync if the device is moved externally.
      this.currentTargetPos = newState.data.currentPosition;
      // Push the new state of the window covering properties to Homekit.
      this.updateWindowCoveringService();
    }

    // Update the battery level if it has changed since the last refresh.
    const lastBattery = (this.lastState && this.lastState.data.batteryLevel);
    if (newState.data.batteryLevel !== lastBattery) {
      // Log a message for the user, then push the new battery state to Homekit.
      const batteryPC = helpers.getBatteryPercent(newState.data.batteryLevel);
      Log.info('Updating battery:', [this.accessory.displayName, batteryPC]);
      this.updateBatteryService();
    }
  }

  // Push the current status of the window covering properties to Homekit.
  updateWindowCoveringService() {
    // We only update if we have an up-to-date device state. Note that the hub
    // reports 0 as fully open and 100 as closed, but Homekit expects the
    // opposite. Correct the values before reporting.
    if (this.currentState) {
      this.wcService.updateCharacteristic(
          this.platform.Characteristic.CurrentPosition,
          helpers.toHomekitPercent(this.currentState.data.currentPosition));
      this.wcService.updateCharacteristic(
          this.platform.Characteristic.TargetPosition,
          helpers.toHomekitPercent(this.currentTargetPos));
      this.wcService.updateCharacteristic(
          this.platform.Characteristic.PositionState,
          helpers.getPositionState(
              this.currentState.data.currentPosition, this.currentTargetPos));
    }
  }

  // Push the current values of the battery service properties to Homekit.
  updateBatteryService() {
    // We only update if we have an up-to-date device state.
    if (this.currentState) {
      this.batteryService.updateCharacteristic(
          this.platform.Characteristic.BatteryLevel,
          helpers.getBatteryPercent(this.currentState.data.batteryLevel));
      this.batteryService.updateCharacteristic(
          this.platform.Characteristic.StatusLowBattery,
          helpers.isLowBattery(this.currentState.data.batteryLevel));
      this.batteryService.updateCharacteristic(
          this.platform.Characteristic.ChargingState,
          this.currentState.data.chargingState ||
              this.platform.Characteristic.ChargingState.NOT_CHARGING);
    }
  }

  /**
   * Handle "set TargetPosition" requests from HomeKit. These are sent when the
   * user changes the state of the device. Throws SERVICE_COMMUNICATION_FAILURE
   * if the hub cannot be contacted.
   */
  async setTargetPosition(targetVal: CharacteristicValue) {
    // Homekit positions are the inverse of what the hub expects.
    let adjustedTarget = helpers.fromHomekitPercent(<number>targetVal);

    // Make sure the target value is supported for this device. We know that if
    // 'usesBinaryState' is set, we have already read and cached a device state.
    if (this.usesBinaryState) {
      adjustedTarget = helpers.binarizeTargetPosition(
          adjustedTarget, <ReadDeviceAck>(this.currentState || this.lastState));
    }

    // Send the request to the hub and wait for a response.
    const ack = <WriteDeviceResponse>(
        await this.client.setTargetPosition(adjustedTarget));

    // Check whether the ack we received is valid for the request we sent.
    const invalidAck = ack &&
        (!this.usesBinaryState && ack.data.currentPosition === undefined);

    // If we didn't receive an ack, or if the ack reports an exception from the
    // hub, or if the ack is invalid, throw a communications error to Homekit.
    if (!ack || ack.actionResult || invalidAck) {
      Log.error(
          `Failed to set ${this.accessory.displayName} to ${targetVal}:`,
          (ack || 'No response from hub'));
      throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    // Record the current targeted position, and inform Homekit.
    this.currentTargetPos = adjustedTarget;
    this.updateWindowCoveringService();

    // Log the result of the operation for the user.
    Log.info('Targeted:', [this.accessory.displayName, targetVal]);
    Log.debug('Target response:', (ack || 'None'));
  }

  async getTargetPosition(): Promise<CharacteristicValue> {
    // If a target position hasn't been set yet, report a communication error.
    if (this.currentTargetPos < 0) {
      throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    // Target is cached in Connector hub format, convert to Homekit format.
    const currentTarget = helpers.toHomekitPercent(this.currentTargetPos);
    Log.debug('Returning target:', [this.accessory.displayName, currentTarget]);
    return currentTarget;
  }

  /**
   * Handle "get CurrentPosition" requests from HomeKit. Returns the most recent
   * value cached by the periodic updater; throws SERVICE_COMMUNICATION_FAILURE
   * if the most recent attempt to contact the hub failed.
   */
  async getCurrentPosition(): Promise<CharacteristicValue> {
    if (!this.currentState) {
      Log.error('Failed to get position:', this.accessory.displayName);
      throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    // Log the current state of the device if we are in debug mode.
    Log.debug(`${this.accessory.displayName} state:`, this.currentState);
    // Note that the hub reports 0 as fully open and 100 as closed, but
    // Homekit expects the opposite. Correct the value before reporting.
    const currentPos =
        helpers.toHomekitPercent(this.currentState.data.currentPosition);
    Log.debug('Returning position:', [this.accessory.displayName, currentPos]);
    return currentPos;
  }

  /**
   * In theory, the value of 'currentState.data.operation' would provide us with
   * the correct PositionState. However, real-time polling of the devices causes
   * severe degradation of responsiveness over time; we therefore use passive
   * read requests, which only update the state after each movement is complete.
   * This means that only the position ever changes, while the PositionState is
   * always in the STOPPED state.
   *
   * Conversely, for devices which only use binary open/close commands, the op
   * state is *never* STOPPED; it is always opening/open or closing/closed. But
   * it is not possible to tell whether the motion is still in progress, or
   * whether the operation code represents the current resting state.
   *
   * For these reasons, we compute the PositionState manually using the current
   * and target positions.
   */
  async getPositionState(): Promise<CharacteristicValue> {
    // If we don't know the current or target position, throw an exception.
    if (this.currentTargetPos < 0 || !this.currentState) {
      throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    const posState = helpers.getPositionState(
        this.currentState.data.currentPosition, this.currentTargetPos);
    Log.debug('Returning pos state:', [this.accessory.displayName, posState]);
    return posState;
  }
}
