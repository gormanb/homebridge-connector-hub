/* eslint-disable indent */
import * as dgram from 'dgram';
import {PlatformAccessory} from 'homebridge';

import {ConnectorHubPlatform} from '../platform';
import {Log} from '../util/log';

import {DeviceInfo, DeviceModel, GetDeviceListAck, ReadDeviceAck} from './connector-hub-api';
import {kMulticastIp, kSendPort} from './connector-hub-constants';
import {extractHubMac, isWifiBridge, makeGetDeviceListRequest, makeReadDeviceRequest, TDBUType, tryParse} from './connector-hub-helpers';
import {ConnectorHubClient} from './connectorHubClient';

// These constants determine how long each discovery period lasts for, and how
// often we send GetDeviceList requests during that period.
const kDiscoveryDurationMs = 15 * 1000;
const kDiscoveryFrequencyMs = 1000;

// Determines how frequently we perform discovery to find new devices.
const kDiscoveryIntervalMs = 5 * 60 * 1000;

// Mapping of hub MACs to IP addresses.
const hubMacToIp = {};

// Sends GetDeviceListReq every kDiscoveryFrequencyMs for kDiscoveryDurationMs.
export async function doDiscovery(
    hubIp: string, platform: ConnectorHubPlatform) {
  Log.debug('Starting discovery for hub:', hubIp);
  const discoveredDevices: string[] = [];
  const hubTokens = {};

  // Create a socket for this discovery session, and add listeners to it.
  const socket = dgram.createSocket('udp4');
  socket.on('message', (msg) => {
    const recvMsg = tryParse(msg.toString());
    if (recvMsg && recvMsg.msgType === 'GetDeviceListAck') {
      // Extract the device list and record the token associated with this hub.
      const deviceList = <GetDeviceListAck>(recvMsg);
      hubTokens[deviceList.mac] = deviceList.token;
      hubMacToIp[deviceList.mac] = hubIp;
      // Filter out any devices that have already been discovered this session.
      const undiscoveredDevices = deviceList.data.filter(
          (devInfo) => !discoveredDevices.includes(devInfo.mac));
      // For all as-yet undiscovered devices, request full device information.
      for (const devInfo of undiscoveredDevices) {
        // If this entry is the hub itself, skip over it and continue.
        if (!isWifiBridge(devInfo.deviceType)) {
          socket.send(
              JSON.stringify(makeReadDeviceRequest(devInfo)), kSendPort, hubIp);
        }
      }
    } else if (recvMsg && recvMsg.msgType === 'ReadDeviceAck') {
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

  let kStartTime = (new Date()).getTime();
  const timer = setInterval(() => {
    // Send a message to the hub requesting the list of available devices.
    socket.send(JSON.stringify(makeGetDeviceListRequest()), kSendPort, hubIp);

    // When we have exceeded the discovery duration...
    if ((new Date()).getTime() - kStartTime > kDiscoveryDurationMs) {
      // ... if we didn't hear back from the hub, keep going...
      if (!Object.keys(hubTokens).length) {
        Log.warn(`Device discovery failed to reach hub ${hubIp}, retrying...`);
        kStartTime = (new Date()).getTime();
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
    }
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
    if (hubIp && await checkDeviceExists(hubIp, deviceInfo)) {
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
async function checkDeviceExists(hubIp: string, deviceInfo: DeviceInfo) {
  const devReply = await ConnectorHubClient.readDeviceState(hubIp, deviceInfo);
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