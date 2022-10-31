/*
 * Generic helper functions for the ConnectorHubClient.
 */
/* eslint-disable indent */
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
export function makeCommandData(command: string|object) {
  if (typeof command === 'string') {
    return {operation: opCodes.indexOf(command)};
  }
  return command;
}

export function makeGetDeviceListRequest() {
  return {msgType: 'GetDeviceList', msgID: makeMsgId()};
}

export function makeWriteDeviceRequest(
    deviceInfo: any, accessToken: string, command: object|string) {
  return {
    msgType: 'WriteDevice',
    mac: deviceInfo.mac,
    deviceType: deviceInfo.deviceType,
    accessToken: accessToken,
    msgID: makeMsgId(),
    data: makeCommandData(command),
  };
}

// A ReadDevice request only updates its state after each movement of the blinds
// is complete. In order to obtain the true state, we have to issue a
// WriteDevice request with a 'status' request.
export function makeReadDeviceRequest(deviceInfo: any, accessToken: string) {
  return makeWriteDeviceRequest(deviceInfo, accessToken, 'status');
}
