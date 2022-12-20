/* eslint-disable indent */
import {API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service} from 'homebridge';
import {isIPv4} from 'net';

import {ConnectorAccessory} from './connectorAccessory';
import {GetDeviceListAck} from './connectorhub/connector-hub-api';
import {ExtendedDeviceInfo} from './connectorhub/connector-hub-helpers';
import {ConnectorHubClient} from './connectorhub/connectorHubClient';
import {PLATFORM_NAME, PLUGIN_NAME} from './settings';
import {Log} from './util/log';

// Response type we expect from device discovery. Undefined if no response.
type DeviceListResponse = GetDeviceListAck|undefined;

// How long we wait after a failed discovery attempt before retrying.
const kDiscoveryRefreshInterval = 5000;

/**
 * This class is the entry point for the plugin. It is responsible for parsing
 * the user config, discovering accessories, and registering them.
 */
export class ConnectorHubPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
      this.api.hap.Characteristic;

  // This array is used to track restored cached accessories.
  public readonly cachedAccessories: PlatformAccessory[] = [];

  // This array records the handlers which wrap each accessory.
  public readonly accessoryHandlers: ConnectorAccessory[] = [];

  constructor(
      private readonly logger: Logger,
      public readonly config: PlatformConfig,
      public readonly api: API,
  ) {
    // Configure the custom log with the Homebridge logger and debug config.
    Log.configure(logger, config.enableDebugLog);

    // If the config is not valid, bail out immediately. We will not discover
    // any new accessories or register any handlers for cached accessories.
    const validationErrors = this.validateConfig(config);
    if (validationErrors.length > 0) {
      Log.error('Plugin suspended. Invalid configuration:', validationErrors);
      return;
    }

    // Notify the user that we have completed platform initialization.
    Log.debug('Finished initializing platform');

    // This event is fired when Homebridge has restored all cached accessories.
    // We must add handlers for these, and check for any new accessories.
    this.api.on('didFinishLaunching', () => {
      Log.debug('Finished restoring all cached accessories from disk');
      this.discoverDevices();
    });
  }

  // Validate that the plugin configuration conforms to the expected format.
  private validateConfig(config: PlatformConfig): string[] {
    const validationErrors: string[] = [];
    if (!config.connectorKey) {
      validationErrors.push('Connector Key has not been configured');
    }
    if (config.hubIp && !isIPv4(config.hubIp)) {
      validationErrors.push(`Hub IP is not valid IPv4: ${config.hubIp}`);
    }
    return validationErrors;
  }

  /**
   * This function is invoked for each cached accessory that homebridge restores
   * from disk at startup. Here we add the cached accessories to a list which
   * will be examined later during the 'discoverDevices' phase.
   */
  configureAccessory(accessory: PlatformAccessory) {
    Log.info('Loading accessory from cache:', accessory.displayName);
    this.cachedAccessories.push(accessory);
  }

  /**
   * Discover and register accessories. Accessories must only be registered
   * once; previously created accessories must not be registered again, to
   * avoid "duplicate UUID" errors.
   */
  async discoverDevices() {
    // Discover accessories from the local network. If we fail to discover
    // anything, schedule another discovery attempt in the future.
    const response = <DeviceListResponse>(
        await ConnectorHubClient.getDeviceList(this.config.hubIp));

    if (!response) {
      Log.warn(
          'Failed to contact hub. Retry in', kDiscoveryRefreshInterval, 'ms');
      setTimeout(() => this.discoverDevices(), kDiscoveryRefreshInterval);
      return response;
    }

    // Output the list of discovered devices in debug mode.
    Log.debug('Discovered devices:', response);

    // Iterate over the discovered devices and register each of them.
    // Skip index 0 since that entry always refers to the hub itself.
    for (let devNum = 1; devNum < response.data.length; ++devNum) {
      // Augment the basic device information with additional details.
      const deviceInfo: ExtendedDeviceInfo = Object.assign(
          {devNum: devNum, fwVersion: response.fwVersion},
          response.data[devNum]);

      // Generate a unique id for the accessory from its MAC address.
      const uuid = this.api.hap.uuid.generate(deviceInfo.mac);
      const defaultDisplayName = `Connector Device ${devNum}`;

      // See if an accessory with the same uuid already exists.
      let accessory =
          this.cachedAccessories.find(accessory => accessory.UUID === uuid);

      // If the accessory does not yet exist, we need to create it.
      if (!accessory) {
        Log.info('Adding new accessory:', defaultDisplayName);
        accessory = new this.api.platformAccessory(defaultDisplayName, uuid);
        this.api.registerPlatformAccessories(
            PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      } else {
        // Remove the cached accessory from the list before adding its handler.
        this.cachedAccessories.splice(
            this.cachedAccessories.indexOf(accessory), 1);
      }

      // Make sure the accessory stays in sync with any device config changes.
      accessory.context.device = deviceInfo;
      this.api.updatePlatformAccessories([accessory]);

      // Create the accessory handler for this accessory.
      this.accessoryHandlers.push(
          new ConnectorAccessory(this, accessory, response.token));
    }

    // Any cached accessories that remain in the cachedAccessories list are
    // stale and no longer exist on the hub. Remove them from Homekit.
    let removedAccessory: PlatformAccessory|undefined;
    while ((removedAccessory = this.cachedAccessories.pop())) {
      Log.info('Removing stale accessory:', removedAccessory.displayName);
      this.api.unregisterPlatformAccessories(
          PLUGIN_NAME, PLATFORM_NAME, [removedAccessory]);
    }
  }
}
