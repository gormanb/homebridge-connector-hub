/*
 * Generic helper functions for the ConnectorHubClient.
 */
import * as aesjs from 'aes-js';

import {opCodes} from './connector-hub-constants';

export function computeAccessToken({connectorKey, hubToken}): string {
  const aesEcb =
      new aesjs.ModeOfOperation.ecb(aesjs.utils.utf8.toBytes(connectorKey));
  const tokenEnc = aesEcb.encrypt(aesjs.utils.utf8.toBytes(hubToken));
  return aesjs.utils.hex.fromBytes(tokenEnc).toUpperCase();
}

export function makeMsgId() {
  // The ID is the current timestamp with all non-numeric chars removed.
  return (new Date()).toJSON().replaceAll(/\D/g, '');
}

// 'command' is a string mapping to an opCode or is already a command object.
export function makeCommandData(command: (string|object)) {
  if (typeof command === 'string') {
    return {operation: opCodes.indexOf(command)};
  }
  return command;
}

export function makeGetDeviceListRequest() {
  return {msgType: 'GetDeviceList', msgID: makeMsgId()};
}

export function makeReadDeviceRequest(deviceInfo) {
  return {
    msgType: 'ReadDevice',
    mac: deviceInfo.mac,
    deviceType: deviceInfo.deviceType,
    msgID: makeMsgId(),
  };
}

export function makeWriteDeviceRequest({deviceInfo, accessToken, command}) {
  return {
    msgType: 'WriteDevice',
    mac: deviceInfo.mac,
    deviceType: deviceInfo.deviceType,
    accessToken: accessToken,
    msgID: makeMsgId(),
    data: makeCommandData(command),
  };
}