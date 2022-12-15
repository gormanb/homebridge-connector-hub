/*
 * Various helper functions for the plugin, to facilitate communication with the
 * hub and to aid in interpreting its responses.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable indent */
import * as aesjs from 'aes-js';

import {Log} from '../util/log';

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

// Convert a percentage position into a binary open / closed state. Note that
// the input is a Connector hub position, not an inverted Homekit position.
export function positionToOpCode(position: number): hubapi.DeviceOpCode {
  return position >= 50 ? hubapi.DeviceOpCode.kClose :
                          hubapi.DeviceOpCode.kOpen;
}

// Given a kOpen or kClose opcode, return the equivalent Connector hub position.
export function opCodeToPosition(opCode: hubapi.DeviceOpCode): number {
  return consts.opCodePositions[opCode];
}

//
// Helpers which assist in interpreting the responses from the hub.
//

// Function to safely parse a possibly-invalid JSON response.
export function tryParse(jsonStr: string) {
  try {
    return JSON.parse(jsonStr);
  } catch (ex: any) {
    Log.debug('Received invalid response:', [jsonStr, ex.message]);
    return undefined;
  }
}

// Helper function which ensures that the device state received from the hub is
// in the format expected by the plugin. Mutates and returns the input object.
export function sanitizeDeviceState(deviceState: hubapi.ReadDeviceAck) {
  // Depending on the device type, the hub may return an explicit position or a
  // simple open / closed state. In the former case, we don't change anything.
  if (deviceState.data.currentPosition !== undefined) {
    return deviceState;
  }
  // Otherwise, convert the open / closed state into a currentPosition.
  if (deviceState.data.operation <= hubapi.DeviceOpCode.kOpen) {
    // kClose = 0 and kOpen = 1, but currentPosition is 0 for open.
    deviceState.data.currentPosition =
        (deviceState.data.operation === hubapi.DeviceOpCode.kOpen ? 0 : 100);
    return deviceState;
  }
  // If we reach here, then neither state nor position are available.
  Log.warn('Failed to sanitize device state:', deviceState);
  deviceState.data.currentPosition = 100;
  return deviceState;
}

// Homekit may set a percentage position for a device that only supports binary
// open and close. This function is used to handle this scenario. Note that the
// input targetPos is a Connector hub position, not a Homekit position.
export function binarizeTargetPosition(
    targetPos: number, deviceState: hubapi.ReadDeviceAck): number {
  // If the target is the same as the current position, do nothing. If not,
  // return the inverse of the current state as the new target position.
  const currentPos = opCodeToPosition(deviceState.data.operation);
  return targetPos !== currentPos ? (100 - currentPos) : targetPos;
}

// Input is the "data.type" field from the ReadDeviceAck response.
export function getDeviceModel(type: number): string {
  return consts.deviceModels[type] || 'Generic Blind';
}

// Estimate battery charge percentage from reported voltage.
// Calculation uses thresholds defined by the Connector app.
export function getBatteryPercent(batteryLevel: number): number {
  const voltageLevel = batteryLevel / 100.0;
  if (voltageLevel >= 15.9 || (voltageLevel >= 11.9 && voltageLevel < 13.2) ||
      (voltageLevel >= 7.9 && voltageLevel < 8.8)) {
    return 100;
  }
  if ((voltageLevel >= 14.5 && voltageLevel < 15.9) ||
      (voltageLevel >= 10.9 && voltageLevel < 11.9) ||
      (voltageLevel >= 7.3 && voltageLevel < 7.9)) {
    return 50;
  }
  if ((voltageLevel >= 14.2 && voltageLevel < 14.5) ||
      (voltageLevel >= 10.6 && voltageLevel < 10.9) ||
      (voltageLevel >= 7.1 && voltageLevel < 7.3)) {
    return 20;
  }
  if ((voltageLevel >= 14.0 && voltageLevel < 14.2) ||
      (voltageLevel >= 10.5 && voltageLevel < 10.6) ||
      (voltageLevel >= 7.0 && voltageLevel < 7.1)) {
    return 10;
  }
  if ((voltageLevel >= 13.2 && voltageLevel < 14.0) ||
      (voltageLevel >= 8.8 && voltageLevel < 10.5) ||
      (voltageLevel >= 6.8 && voltageLevel < 7.0)) {
    return 0;
  }
  return 100;
}

export function isLowBattery(batteryLevel: number): boolean {
  return getBatteryPercent(batteryLevel) <= consts.kLowBatteryPercent;
}