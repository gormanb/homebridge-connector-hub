/* eslint-disable indent */
import * as dgram from 'dgram';

import {ConnectorHubPlatform} from '../platform';
import {Log} from '../util/log';

import {DeviceModel, DeviceStatusTDBU, DeviceType, GetDeviceListAck, ReadDeviceAck} from './connector-hub-api';
import {kSendPort} from './connector-hub-constants';
import {makeGetDeviceListRequest, makeReadDeviceRequest, TDBUType, tryParse} from './connector-hub-helpers';

// These constants determine how long each discovery period lasts for, and how
// often we send GetDeviceList requests during that period.
const kDiscoveryDurationMs = 15 * 1000;
const kDiscoveryFrequencyMs = 1000;

// Determines how frequently we perform discovery to find new devices.
const kDiscoveryIntervalMs = 5 * 60 * 1000;

// Sends GetDeviceListReq every kDiscoveryFrequencyMs for kDiscoveryDurationMs.
export function doDiscovery(hubIp: string, platform: ConnectorHubPlatform) {
  Log.debug('Starting discovery for hub:', hubIp);
  let deviceList: GetDeviceListAck;

  // Create a socket for this discovery session, and add listeners to it.
  const socket = dgram.createSocket('udp4');
  socket.on('message', (msg) => {
    const recvMsg = tryParse(msg.toString());
    if (recvMsg && recvMsg.msgType === 'GetDeviceListAck') {
      deviceList = <GetDeviceListAck>(recvMsg);
      for (const devInfo of deviceList.data) {
        // If this entry is the hub itself, skip over it and continue.
        if (devInfo.deviceType !== DeviceType.kWiFiBridge) {
          const readDevReq =
              Buffer.from(JSON.stringify(makeReadDeviceRequest(devInfo)));
          socket.send(readDevReq, kSendPort, hubIp);
        }
      }
    } else if (recvMsg && recvMsg.msgType === 'ReadDeviceAck') {
      platform.registerDevice(hubIp, recvMsg, deviceList.token);
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
    const getDevListReq =
        Buffer.from(JSON.stringify(makeGetDeviceListRequest()));
    socket.send(getDevListReq, kSendPort, hubIp);

    // When we have exceeded the discovery duration...
    if ((new Date()).getTime() - kStartTime > kDiscoveryDurationMs) {
      // ... if we didn't hear back from the hub, keep going...
      if (!deviceList) {
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
//   - If this is a TDBU device and has a _T field, add kTopDown to the array.
//   - If this is a TDBU device and has a _B field, add kBottomUp to the array.
//   - If this is not a TDBU device, returns [kNone].
export function identifyTdbuDevices(deviceInfo: ReadDeviceAck): TDBUType[] {
  if (deviceInfo.data.type !== DeviceModel.kTopDownBottomUp) {
    return [TDBUType.kNone];
  }
  const tdbuDevInfo = <DeviceStatusTDBU>(deviceInfo.data);
  const tdbuTypes: TDBUType[] = [];
  if (tdbuDevInfo.operation_T !== undefined) {
    tdbuTypes.push(TDBUType.kTopDown);
  }
  if (tdbuDevInfo.operation_B !== undefined) {
    tdbuTypes.push(TDBUType.kBottomUp);
  }
  return tdbuTypes;
}