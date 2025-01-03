/* eslint-disable max-len */
/* eslint-disable indent */
import {CharacteristicValue, PlatformAccessory, Service} from 'homebridge';

import {ReadDeviceAck} from './connectorhub/connector-hub-api';
import {kNetworkSettings, ReadDeviceType} from './connectorhub/connector-hub-constants';
import {ExtendedDeviceInfo, getBatteryPercent, getDeviceModel, isInvalidAck, isLowBattery, makeDeviceName} from './connectorhub/connector-hub-helpers';
import {ConnectorDeviceHandler, ReadDeviceResponse, WriteDeviceResponse} from './connectorhub/connectorDeviceHandler';
import {ConnectorHubClient} from './connectorhub/connectorHubClient';
import {ConnectorHubPlatform} from './platform';
import {Log} from './util/log';

/**
 * An instance of this class is created for each accessory. Exposes both the
 * WindowCovering and Battery services for the device.
 */
export class ConnectorAccessory extends ConnectorDeviceHandler {
  // Interval at which we actively rather than passively read the device state.
  private static readonly kActiveReadInterval = 60 * 60 * 1000;
  private performActiveRead = true;

  // Network client used to communicate with the hub.
  private client: ConnectorHubClient;

  // Window covering and battery services exposed to Homekit.
  private batteryService: Service;
  private wcService: Service;

  // Current target position for this device.
  private currentTargetPos = -1;

  // Handlers for the periodic refresh and active read timers.
  private periodicRefreshTimer: NodeJS.Timer;
  private activeReadTimer: NodeJS.Timer;

  constructor(
      private readonly platform: ConnectorHubPlatform,
      public readonly accessory: PlatformAccessory,
  ) {
    // Initialize the superclass constructor.
    super(<ExtendedDeviceInfo>accessory.context.device, platform.config);

    // Create a new client connection for this device.
    this.client = new ConnectorHubClient(
        this.platform.config, this.deviceInfo, this.deviceInfo.hubIp,
        this.deviceInfo.hubToken);

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
    this.periodicRefreshTimer = setInterval(
        () => this.updateDeviceStatus(), kNetworkSettings.refreshIntervalMs);

    // Set up a timer to indicate when we should perform active reads.
    this.activeReadTimer = setInterval(() => {
      this.performActiveRead = true;
    }, ConnectorAccessory.kActiveReadInterval);

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

    // Update the accessory display name, in case it wasn't set already.
    this.accessory.displayName = makeDeviceName(this.deviceInfo);
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
        .setCharacteristic(Characteristic.SerialNumber, this.deviceInfo.mac)
        .setCharacteristic(
            Characteristic.Model,
            getDeviceModel(deviceState.deviceType, deviceState.data.type));
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
    // Determine whether we should perform an active or passive read, obtain the
    // latest status from the device, and reset the active read tracker.
    let newState = <ReadDeviceResponse>(await this.client.getDeviceState(
        this.performActiveRead ? ReadDeviceType.kActive :
                                 ReadDeviceType.kPassive));
    this.performActiveRead = false;

    // Check whether the response from the hub is valid.
    if (newState && isInvalidAck(newState)) {
      // Read reply with 'actionResult' implies the device has been removed.
      if (newState.msgType === 'ReadDeviceAck' && newState.actionResult) {
        Log.info('Stale device response received:', newState);
        this.platform.unregisterDevice(this.accessory);
        clearInterval(this.periodicRefreshTimer);
        clearInterval(this.activeReadTimer);
        return;
      }
      // Otherwise, we may have a write reply error due to invalid access token.
      Log.error('Error received from hub. App key may be invalid:', newState);
      return;
    }

    // Update the cached current and last-good copies of the device status.
    this.lastState = (this.currentState || this.lastState);
    this.currentState = newState;

    // If we didn't hear back from the device, exit early.
    if (!newState) {
      Log.debug('Periodic refresh failed:', this.accessory.displayName);
      return;
    }

    // Log a debug message showing the new device state received from the hub.
    Log.debug(`Latest ${this.accessory.displayName} state:`, newState);

    // Sanitize the device state for the specific device that we are handling.
    this.currentState = newState = this.sanitizeDeviceState(newState);

    // The first time we read the device, we update the accessory details.
    if (!this.lastState) {
      this.setAccessoryInformation(newState);
    }

    // We extract 'lastPos' as below because lastState will be undefined on the
    // first iteration, so we wish to force an update.
    const lastPos = (this.lastState?.data.currentPosition);
    if (newState.data.currentPosition !== lastPos) {
      // Log a message for the user to signify that the position has changed.
      const newPos = this.toHomekitPercent(newState.data.currentPosition);
      Log.info('Updating position:', [this.accessory.displayName, newPos]);

      // The hub updates only after completing each movement. Update the target
      // position to match the new currentPosition. Usually this is a no-op, but
      // it will keep Homekit in sync if the device is moved externally.
      this.currentTargetPos = newState.data.currentPosition;
      // Push the new state of the window covering properties to Homekit.
      this.updateWindowCoveringService();
    }

    // Update the battery level if it has changed since the last refresh.
    const lastBatteryPC = getBatteryPercent(this.lastState?.data.batteryLevel);
    const batteryPC = getBatteryPercent(newState?.data.batteryLevel);
    if (batteryPC !== lastBatteryPC) {
      // Log a message for the user, then push the new battery state to Homekit.
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
          this.toHomekitPercent(this.currentState.data.currentPosition));
      this.wcService.updateCharacteristic(
          this.platform.Characteristic.TargetPosition,
          this.toHomekitPercent(this.currentTargetPos));
      this.wcService.updateCharacteristic(
          this.platform.Characteristic.PositionState,
          this.getDirection(
              this.currentState.data.currentPosition, this.currentTargetPos));
    }
  }

  // Push the current values of the battery service properties to Homekit.
  updateBatteryService() {
    // We only update if we have an up-to-date device state.
    if (this.currentState) {
      this.batteryService.updateCharacteristic(
          this.platform.Characteristic.BatteryLevel,
          getBatteryPercent(this.currentState.data.batteryLevel));
      this.batteryService.updateCharacteristic(
          this.platform.Characteristic.StatusLowBattery,
          isLowBattery(this.currentState.data.batteryLevel));
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
    // Adjust the target value from Homekit to Hub values, and construct a
    // target request appropriate to this device.
    const [hubTarget, targetReq] = this.makeTargetRequest(<number>targetVal);

    // Send the targeting request in the appropriate format for this device.
    const ack = <WriteDeviceResponse>await (() => {
      return this.client.setDeviceState(targetReq);
    })();

    // If we didn't receive an ack, or if the ack reports an exception from the
    // hub, or if the ack is invalid, throw a communications error to Homekit.
    if (!ack || isInvalidAck(ack)) {
      Log.error(
          `Failed to set ${this.accessory.displayName} to ${targetVal}:`,
          (ack || 'No response from hub'));
      throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }

    // Record the current targeted position, and inform Homekit.
    this.currentTargetPos = hubTarget;
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
    const currentTarget = this.toHomekitPercent(this.currentTargetPos);
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
      Log.debug('Failed to get position:', this.accessory.displayName);
      throw new this.platform.api.hap.HapStatusError(
          this.platform.api.hap.HAPStatus.SERVICE_COMMUNICATION_FAILURE);
    }
    // Position is cached in Connector hub format, convert to Homekit format.
    const currentPos =
        this.toHomekitPercent(this.currentState.data.currentPosition);
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
    const posState = this.getDirection(
        this.currentState.data.currentPosition, this.currentTargetPos);
    Log.debug('Returning pos state:', [this.accessory.displayName, posState]);
    return posState;
  }
}
