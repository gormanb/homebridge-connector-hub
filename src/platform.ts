/* eslint-disable indent */
import {API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service} from 'homebridge';

import {BlindAccessory} from './blindAccessory';
import {GetDeviceListAck} from './connectorhub/connector-hub-api';
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
  public readonly accessoryHandlers: BlindAccessory[] = [];

  constructor(
      private readonly logger: Logger,
      public readonly config: PlatformConfig,
      public readonly api: API,
  ) {
    // Configure the custom log with the Homebridge logger and debug config.
    Log.configure(logger, config.enableDebug);

    // Notify the user that we have completed platform initialization.
    Log.debug('Finished initializing platform');

    // When this event is fired it means Homebridge has restored all cached
    // accessories from disk. We only register new accessories after this event
    // is fired, in order to ensure they weren't added to homebridge already.
    // This event can also be used to start discovery of new accessories.
    this.api.on('didFinishLaunching', () => {
      Log.debug('Finished restoring all cached accessories from disk');
      this.discoverDevices();
    });
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
      Log.info(
          'Failed to contact hub. Retry in', kDiscoveryRefreshInterval, 'ms');
      setTimeout(() => this.discoverDevices(), kDiscoveryRefreshInterval);
      return response;
    }

    // Iterate over the discovered devices and register each of them.
    for (let devNum = 1; devNum < response.data.length; ++devNum) {
      // Generate a unique id for the accessory from its MAC address.
      const device =
          Object.assign({fwVersion: response.fwVersion}, response.data[devNum]);
      const defaultDisplayName = `Connector Blind ${devNum}`;
      const uuid = this.api.hap.uuid.generate(device.mac);

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
      accessory.context.device = device;
      this.api.updatePlatformAccessories([accessory]);

      // Create the accessory handler for this accessory.
      this.accessoryHandlers.push(
          new BlindAccessory(this, accessory, response.token));
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
