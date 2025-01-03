/* eslint-disable indent */
import {API, Characteristic, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service} from 'homebridge';
import {isIPv4} from 'net';

import {ConnectorAccessory} from './connectorAccessory';
import {doDiscovery, identifyTdbuDevices, removeStaleAccessories} from './connectorhub/connector-device-discovery';
import {ReadDeviceAck} from './connectorhub/connector-hub-api';
import {kMulticastIp, kNetworkSettings} from './connectorhub/connector-hub-constants';
import {ExtendedDeviceInfo, makeDeviceName, spliceIndexOf, TDBUType} from './connectorhub/connector-hub-helpers';
import {PLATFORM_NAME, PLUGIN_NAME} from './settings';
import {Log} from './util/log';

/**
 * This class is the entry point for the plugin. It is responsible for parsing
 * the user config, discovering accessories, and registering them.
 */
export class ConnectorHubPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic =
      this.api.hap.Characteristic;

  // This array is used to track restored cached accessories.
  private readonly cachedAccessories: PlatformAccessory[] = [];

  // This array records the handlers which wrap each accessory.
  private readonly accessoryHandlers: ConnectorAccessory[] = [];

  // This array records which hubs have been scanned for devices.
  private readonly scannedHubs: string[] = [];

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

    // Update the retry settings to reflect the config values.
    kNetworkSettings.maxRetries = config.maxRetries;
    kNetworkSettings.retryDelayMs = config.retryDelayMs;
    kNetworkSettings.refreshIntervalMs = config.refreshIntervalMs;

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
      validationErrors.push('App Key has not been configured');
    }
    // Enforce default values for all applicable fields.
    config.refreshIntervalMs =
        (config.refreshIntervalMs || kNetworkSettings.refreshIntervalMs);
    config.retryDelayMs =
        (config.retryDelayMs || kNetworkSettings.retryDelayMs);
    config.maxRetries = (config.maxRetries || kNetworkSettings.maxRetries);
    config.reverseDirection = (config.reverseDirection || []);
    config.hubIps = (config.hubIps || []);
    // Check for invalid entries and compile a list of all validation errors.
    const invalidIps = config.hubIps.filter((ip: string) => !isIPv4(ip));
    for (const invalidIp of invalidIps) {
      validationErrors.push(`Hub IP is not valid IPv4: ${invalidIp}`);
    }
    if (config.refreshIntervalMs <= 0) {
      validationErrors.push('Refresh interval must be > 0');
    }
    if (config.maxRetries <= 0) {
      validationErrors.push('Max request retries must be > 0');
    }
    if (config.retryDelayMs <= 0) {
      validationErrors.push('Request retry delay must be > 0');
    }
    return validationErrors;
  }

  /**
   * This function is invoked for each cached accessory that homebridge restores
   * from disk at startup. Here we add the cached accessories to a list which
   * will be examined later during the 'discoverDevices' phase.
   */
  public configureAccessory(accessory: PlatformAccessory) {
    Log.info('Loading accessory from cache:', accessory.displayName);
    this.cachedAccessories.push(accessory);
  }

  /**
   * Iterate over the given hub IPs and begin the discovery process for each.
   * Note that we use the term "hub" here to distinguish them from individual
   * devices, but in practice a device may be its own hub if, for instance, it
   * is a WiFi motor device.
   */
  private async discoverDevices() {
    if (this.config.hubIps.length === 0) {
      Log.info('No device IPs configured, defaulting to multicast discovery');
      this.config.hubIps.push(kMulticastIp);
    }
    // Perform device discovery, then repeat at regular intervals.
    for (const hubIp of this.config.hubIps) {
      doDiscovery(hubIp, this);
    }
  }

  // The list of hubs that have been successfully scanned during discovery.
  private hubIpsScanned: string[] = [];

  public async onDiscoveryCompleteForHub(hubIp: string) {
    // Add this hub to the list of hubs we've scanned.
    this.hubIpsScanned.push(hubIp);
    // Don't try to remove stale devices until we have heard from evey hub.
    if (!this.config.hubIps.every(ip => this.hubIpsScanned.includes(ip))) {
      return;
    }
    Log.debug('Checking for stale cached accessories...');
    removeStaleAccessories(this.cachedAccessories, this);
    // Clear the list of scanned hubs for the next round of discovery.
    this.hubIpsScanned = [];
  }

  /**
   * Register discovered accessories. Accessories must only be registered once;
   * previously created accessories must not be registered again, to avoid
   * "duplicate UUID" errors.
   */
  public async registerDevice(
      hubIp: string, deviceState: ReadDeviceAck, hubToken: string) {
    // Output the discovered device if we're in debug mode.
    Log.debug('Discovered device:', deviceState);

    // If this is a TDBU blind, we may have to create two separate accessories.
    const tdbuTypes: TDBUType[] = identifyTdbuDevices(deviceState);

    // Iterate over all TDBU types, if such types exist. Otherwise this will
    // just register the plain single-motor device directly.
    for (const tdbuType of tdbuTypes) {
      // Augment the basic device information with additional details.
      const deviceInfo: ExtendedDeviceInfo = {
        mac: deviceState.mac,
        deviceType: deviceState.deviceType,
        subType: deviceState.data.type,
        tdbuType: tdbuType,
        hubIp: hubIp,
        hubToken: hubToken,
      };

      // Generate a unique id for the accessory from its MAC address. Append the
      // TDBU type to differentiate the top down from the bottom up accessory.
      const uuid = this.api.hap.uuid.generate(deviceInfo.mac + tdbuType);

      // Generate a display name for the device from the extended device info.
      const displayName = makeDeviceName(deviceInfo);

      // Check whether we have already registered this device in this session.
      if (this.accessoryHandlers.some(elem => elem.accessory.UUID === uuid)) {
        continue;
      }

      // See if a cached accessory with the same uuid already exists.
      let accessory =
          this.cachedAccessories.find(accessory => accessory.UUID === uuid);

      // If the accessory does not yet exist, we need to create it.
      if (!accessory) {
        Log.info('Adding new accessory:', displayName);
        accessory = new this.api.platformAccessory(displayName, uuid);
        this.api.registerPlatformAccessories(
            PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      } else {
        // Remove the cached accessory from the list before adding a handler.
        this.cachedAccessories.splice(
            this.cachedAccessories.indexOf(accessory), 1);
      }

      // Make sure the accessory stays in sync with any device config changes.
      accessory.context.device = deviceInfo;
      this.api.updatePlatformAccessories([accessory]);

      // Create the accessory handler for this accessory.
      Log.debug('Creating handler for accessory:', displayName);
      this.accessoryHandlers.push(new ConnectorAccessory(this, accessory));
    }
  }

  /**
   * Unregister a stale accessory. This will remove the accessory from both
   * Homebridge and from Homekit.
   */
  public unregisterDevice(accessory: PlatformAccessory) {
    // Unregister the specified accessory from the plugin.
    Log.info('Removing stale accessory:', accessory.displayName);
    this.api.unregisterPlatformAccessories(
        PLUGIN_NAME, PLATFORM_NAME, [accessory]);
    // Remove this cached or active accessory from the appropriate list.
    this.cachedAccessories.splice(
        spliceIndexOf(this.cachedAccessories, accessory), 1);
    this.accessoryHandlers.splice(
        spliceIndexOf(
            this.accessoryHandlers.map(ah => ah.accessory), accessory),
        1);
  }
}
