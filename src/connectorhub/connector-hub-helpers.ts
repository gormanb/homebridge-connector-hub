/*
 * Various helper functions for the plugin, to facilitate communication with the
 * hub and to aid in interpreting its responses.
 */

/* eslint-disable indent */
import * as aesjs from 'aes-js';

import * as hubapi from './connector-hub-api';
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

export function makeMsgId(): string {
  // The ID is the current timestamp with all non-numeric chars removed.
  return (new Date()).toJSON().replaceAll(/\D/g, '');
}

export function makeGetDeviceListRequest(): hubapi.GetDeviceListReq {
  return {msgType: 'GetDeviceList', msgID: makeMsgId()};
}

// A ReadDevice request only updates the position after each movement of the
// blinds is complete. In order to obtain the real-time state, we must issue a
// WriteDevice request for a 'status' operation. However, polling with this
// method causes the responsiveness of the blinds to degrade over time; there
// may be some kind of rate-limiting mechanism in the hub. ReadDevice has no
// such issues, possibly because it reads a cached value from the hub itself.
export function makeReadDeviceRequest(deviceInfo: hubapi.DeviceInfo):
    hubapi.ReadDeviceReq {
  return {
    msgType: 'ReadDevice',
    mac: deviceInfo.mac,
    deviceType: deviceInfo.deviceType,
    msgID: makeMsgId(),
  };
}

export function makeWriteDeviceRequest(
    deviceInfo: hubapi.DeviceInfo, accessToken: string,
    command: hubapi.DeviceCmd): hubapi.WriteDeviceReq {
  return {
    msgType: 'WriteDevice',
    mac: deviceInfo.mac,
    deviceType: deviceInfo.deviceType,
    accessToken: accessToken,
    msgID: makeMsgId(),
    data: command,
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