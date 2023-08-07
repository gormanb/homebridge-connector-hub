/* eslint-disable indent */
import * as dgram from 'dgram';

import {ConnectorHubPlatform} from '../platform';
import {Log} from '../util/log';

import {DeviceModel, DeviceType, GetDeviceListAck, ReadDeviceAck} from './connector-hub-api';
import {kSendPort} from './connector-hub-constants';
import {extractHubMac, makeGetDeviceListRequest, makeReadDeviceRequest, TDBUType, tryParse} from './connector-hub-helpers';

// These constants determine how long each discovery period lasts for, and how
// often we send GetDeviceList requests during that period.
const kDiscoveryDurationMs = 15 * 1000;
const kDiscoveryFrequencyMs = 1000;

// Determines how frequently we perform discovery to find new devices.
const kDiscoveryIntervalMs = 5 * 60 * 1000;

// Sends GetDeviceListReq every kDiscoveryFrequencyMs for kDiscoveryDurationMs.
export function doDiscovery(hubIp: string, platform: ConnectorHubPlatform) {
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
      // Filter out any devices that have already been discovered this session.
      const undiscoveredDevices = deviceList.data.filter(
          (devInfo) => !discoveredDevices.includes(devInfo.mac));
      // For all as-yet undiscovered devices, request full device information.
      for (const devInfo of undiscoveredDevices) {
        // If this entry is the hub itself, skip over it and continue.
        if (devInfo.deviceType !== DeviceType.kWiFiBridge) {
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

      // ... then schedule the next round of discovery.
      setTimeout(() => doDiscovery(hubIp, platform), kDiscoveryIntervalMs);
    }
  }, kDiscoveryFrequencyMs);
}

// Function which returns an array of information about a possibly-TDBU device.
export function identifyTdbuDevices(deviceState: ReadDeviceAck): TDBUType[] {
  return (deviceState.data.type === DeviceModel.kTopDownBottomUp) ?
      [TDBUType.kTopDown, TDBUType.kBottomUp] :
      [TDBUType.kNone];
}