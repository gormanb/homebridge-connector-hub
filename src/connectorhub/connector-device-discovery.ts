/* eslint-disable indent */
import * as dgram from 'dgram';

import {ConnectorHubPlatform} from '../platform';
import {Log} from '../util/log';

import {kSendPort} from './connector-hub-constants';
import {makeGetDeviceListRequest, tryParse} from './connector-hub-helpers';

// These constants determine how long each discovery period lasts for, and how
// often we send GetDeviceList requests during that period.
const kDiscoveryDurationMs = 10 * 1000;
const kDiscoveryFrequencyMs = 1000;

// Determines how frequently we perform discovery to find new devices.
const kDiscoveryIntervalMs = 5 * 60 * 1000;

// Sends GetDeviceListReq every kDiscoveryFrequencyMs for kDiscoveryDurationMs.
export function doDiscovery(hubIp: string, platform: ConnectorHubPlatform) {
  Log.debug('Starting discovery for hub:', hubIp);
  let receivedResponse = false;

  // Create a socket for this discovery session, and add listeners to it.
  const socket = dgram.createSocket('udp4');
  socket.on('message', (msg) => {
    const recvMsg = tryParse(msg.toString());
    if (recvMsg && recvMsg.msgType === 'GetDeviceListAck') {
      platform.registerDevices(hubIp, recvMsg);
      receivedResponse = true;
    }
  });
  socket.on('error', (ex) => {
    Log.error('Network error:', ex.message);
  });

  let kStartTime = (new Date()).getTime();
  const timer = setInterval(() => {
    // Send a message to the hub requesting the list of available devices.
    const sendMsg = Buffer.from(JSON.stringify(makeGetDeviceListRequest()));
    socket.send(sendMsg, kSendPort, hubIp);

    // When we have exceeded the discovery duration...
    if ((new Date()).getTime() - kStartTime > kDiscoveryDurationMs) {
      // ... if we didn't hear back from the hub, keep going...
      if (!receivedResponse) {
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
