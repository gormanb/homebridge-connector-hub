/* eslint-disable max-len */
/* eslint-disable indent */
import * as dgram from 'dgram';
import {PlatformAccessory, PlatformConfig} from 'homebridge';

import {ConnectorHubPlatform} from '../platform';
import {Log} from '../util/log';

import {DeviceInfo, DeviceModel, GetDeviceListAck, ReadDeviceAck} from './connector-hub-api';
import {kMulticastIp, kSendPort} from './connector-hub-constants';
import {computeAccessToken, extractHubMac, isInvalidAck, isWifiBridge, makeGetDeviceListRequest, makeReadDeviceRequest, TDBUType, tryParse} from './connector-hub-helpers';
import {ConnectorHubClient} from './connectorHubClient';

// These constants determine how long each discovery period lasts for, and how
// often we send GetDeviceList requests during that period.
const kDiscoveryDurationMs = 15 * 1000;
const kDiscoveryFrequencyMs = 1000;

// Determines how frequently we perform discovery to find new devices.
const kDiscoveryIntervalMs = 5 * 60 * 1000;

// Mappings of hub MACs to IP addresses and tokens.
const hubMacToIp = {};
const hubTokens = {};

// Sends GetDeviceListReq every kDiscoveryFrequencyMs for kDiscoveryDurationMs.
export async function doDiscovery(
    hubIp: string, platform: ConnectorHubPlatform) {
  Log.debug('Starting discovery for hub:', hubIp);
  const discoveredDevices: string[] = [];
  let deviceList: GetDeviceListAck;

  // Create a socket for this discovery session, and add listeners to it.
  const socket = dgram.createSocket('udp4');
  socket.on('message', (msg) => {
    const recvMsg = tryParse(msg.toString());
    if (recvMsg && recvMsg.msgType === 'GetDeviceListAck') {
      // Extract the device list and record the token associated with this hub.
      deviceList = <GetDeviceListAck>(recvMsg);
      hubTokens[deviceList.mac] = deviceList.token;
      hubMacToIp[deviceList.mac] = hubIp;
      // Compute the accessToken for use with ReadDevice requests.
      const accessToken = computeAccessToken(
          platform.config.connectorKey,
          deviceList.token,
      );
      // Filter out any devices that have already been discovered this session.
      const undiscoveredDevices = deviceList.data.filter(
          (devInfo) => !discoveredDevices.includes(devInfo.mac));
      // For all as-yet undiscovered devices, request full device information.
      for (const devInfo of undiscoveredDevices) {
        // If this entry is the hub itself, skip over it and continue.
        if (!isWifiBridge(devInfo.deviceType)) {
          const readDevReq = makeReadDeviceRequest(devInfo, accessToken);
          socket.send(JSON.stringify(readDevReq), kSendPort, hubIp);
        }
      }
    } else if (recvMsg && recvMsg.msgType === 'ReadDeviceAck') {
      if (isInvalidAck(recvMsg)) {
        Log.debug('Invalid device response during discovery:', recvMsg);
        return;
      }
      const hubToken = hubTokens[extractHubMac(recvMsg.mac)];
      platform.registerDevice(hubIp, recvMsg, hubToken);
      discoveredDevices.push(recvMsg.mac);
    } else if (recvMsg) {
      Log.debug('Unexpected message during discovery:', recvMsg);
    }
  });
  socket.on('error', (ex) => {
    Log.error('Network error:', ex.message);
  });

  let kStartTime = Date.now();
  const timer = setInterval(() => {
    // If the discovery period hasn't expired yet, send a message to the hub to
    // request the list of available devices.
    if (Date.now() - kStartTime < kDiscoveryDurationMs) {
      socket.send(JSON.stringify(makeGetDeviceListRequest()), kSendPort, hubIp);
      return;
    }
    // If we're here, then the discovery period is complete. If we didn't hear
    // back from the hub at all, reset the discovery period and keep going...
    if (!deviceList) {
      Log.warn(`Device discovery failed to reach hub ${hubIp}, retrying...`);
      kStartTime = Date.now();
      return;
    }
    // ... otherwise, end discovery and close the socket...
    Log.debug('Finished discovery for hub:', hubIp);
    clearInterval(timer);
    socket.close();

    // ... inform the platform that we have finished discovery...
    platform.onDiscoveryCompleteForHub(hubIp);

    // ... then schedule the next round of discovery.
    setTimeout(() => doDiscovery(hubIp, platform), kDiscoveryIntervalMs);
  }, kDiscoveryFrequencyMs);
}

// Determines whether it is safe to remove suspected stale accessories, and if
// so unregisters them from the plugin.
export async function removeStaleAccessories(
    accessories: PlatformAccessory[], platform: ConnectorHubPlatform) {
  // Iterate over a copy of the accessories array, since it may be modified.
  for (const accessory of [...accessories]) {
    const deviceInfo = accessory.context.device;
    const hubIp = hubMacToIp[extractHubMac(deviceInfo.mac)];
    // If we don't know the device's hub IP but we did discovery in multicast
    // mode, conservatively decline to remove the device. Hub may be offline.
    if (!hubIp && platform.config.hubIps.includes(kMulticastIp)) {
      Log.debug('Skip stale device, hub not found via multicast:', deviceInfo);
      continue;
    }
    // If we have a hub IP and the hub reports that the device exists, do not
    // unregsiter it. We missed it during discovery, wait until the next round.
    if (hubIp && await checkDeviceExists(deviceInfo, hubIp, platform.config)) {
      continue;
    }
    // If we're here, then either we don't have a hub IP, implying the device is
    // an orphan, or the hub reports that the device does not exist. Remove it.
    platform.unregisterDevice(accessory);
  }
}

// Check whether the given device exists on the specified hub. A read response
// with 'actionResult' implies the device does not exist. If we don't get any
// response, conservatively assume that the device exists.
async function checkDeviceExists(
    deviceInfo: DeviceInfo, hubIp: string, config: PlatformConfig) {
  const hubToken = hubTokens[extractHubMac(deviceInfo.mac)];
  const devReply = await ConnectorHubClient.readDeviceState(
      deviceInfo, hubIp, hubToken, config.connectorKey);
  if (!devReply) {
    Log.debug('No response when checking stale device:', [hubIp, deviceInfo]);
  }
  const deviceExists = !(<ReadDeviceAck>devReply)?.actionResult;
  if (!deviceExists) {
    Log.info('Stale device response received:', devReply);
  }
  return deviceExists;
}

// Function which returns an array of information about a possibly-TDBU device.
export function identifyTdbuDevices(deviceState: ReadDeviceAck): TDBUType[] {
  return (deviceState.data.type === DeviceModel.kTopDownBottomUp) ?
      [TDBUType.kTopDown, TDBUType.kBottomUp] :
      [TDBUType.kNone];
}