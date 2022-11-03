/*
 * Generic helper functions for the ConnectorHubClient.
 */
/* eslint-disable indent */
import * as aesjs from 'aes-js';

import * as consts from './connector-hub-constants';

//
// Helpers which facilitate communication with the hub.
//

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
    return {operation: consts.opCodes.indexOf(command)};
  }
  return command;
}

export function makeGetDeviceListRequest() {
  return {msgType: 'GetDeviceList', msgID: makeMsgId()};
}

// A ReadDevice request only updates the position after each movement of the
// blinds is complete. In order to obtain the real-time state, we must issue a
// WriteDevice request for a 'status' operation. However, polling with this
// method causes the responsiveness of the blinds to degrade over time; there
// may be some kind of rate-limiting mechanism in the hub. ReadDevice has no
// such issues, possibly because it reads a cached value from the hub itself.
export function makeReadDeviceRequest(deviceInfo) {
  return {
    msgType: 'ReadDevice',
    mac: deviceInfo.mac,
    deviceType: deviceInfo.deviceType,
    msgID: makeMsgId(),
  };
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

//
// Helpers which assist in interpreting the responses from the hub.
//

// Input is the "data.type" field from the ReadDeviceAck response.
export function getDeviceModel(type: number): string {
  return consts.deviceModels[type] || 'Generic Blind';
}

export function getBatteryPercent(batteryLevel: number): number {
  return Math.round(100 * (batteryLevel / consts.kMaxBatteryLevel));
}

export function isLowBattery(batteryLevel: number): boolean {
  return getBatteryPercent(batteryLevel) <= consts.kLowBatteryPercent;
}