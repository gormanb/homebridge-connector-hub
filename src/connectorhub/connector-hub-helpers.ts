/*
 * Various helper functions for the plugin, to facilitate communication with the
 * hub and to aid in interpreting its responses.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable indent */
import * as aesjs from 'aes-js';

import {Log} from '../util/log';

import {DeviceCmd, DeviceInfo, DeviceModel, DeviceType, GetDeviceListReq, ReadDeviceReq, WriteDeviceReq} from './connector-hub-api';
import {deviceModels, deviceTypes, kLowBatteryPercent, kMacAddrLength} from './connector-hub-constants';

//
// Special types used internally by the plugin.
//

export enum TDBUType {
  kNone = '',
  kTopDown = ' Top-Down',
  kBottomUp = ' Bottom-Up'
}

// This augmented type is not part of the Hub API.
export interface ExtendedDeviceInfo extends DeviceInfo {
  subType: DeviceModel;
  tdbuType: TDBUType;
  hubIp: string;
  hubToken: string;
}

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

export function makeGetDeviceListRequest(): GetDeviceListReq {
  return {msgType: 'GetDeviceList', msgID: makeMsgId()};
}

// A ReadDevice request only updates the position after each movement of the
// device is complete. In order to obtain the real-time state, we must issue a
// WriteDevice request for a 'status' operation. However, polling with this
// method causes the responsiveness of the devices to degrade over time; there
// may be some kind of rate-limiting mechanism in the hub. ReadDevice has no
// such issues, possibly because it reads a cached value from the hub itself.
export function makeReadDeviceRequest(deviceInfo: DeviceInfo): ReadDeviceReq {
  return {
    msgType: 'ReadDevice',
    mac: deviceInfo.mac,
    deviceType: deviceInfo.deviceType,
    msgID: makeMsgId(),
  };
}

export function makeWriteDeviceRequest(
    deviceInfo: DeviceInfo, accessToken: string,
    command: DeviceCmd): WriteDeviceReq {
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

// Helper function to safely parse a possibly-invalid JSON response.
export function tryParse(jsonStr: string) {
  try {
    return JSON.parse(jsonStr);
  } catch (ex: any) {
    Log.debug('Received invalid response:', [jsonStr, ex.message]);
    return undefined;
  }
}

// Safe indexOf for use with splice. If the element does not exist in the array,
// returns the array length, which will cause splice to remove nothing.
export function spliceIndexOf(arr: any[], value: any) {
  const idx = arr.indexOf(value);
  return (idx >= 0 ? idx : arr.length);
}

// Helper to implement a logical XOR.
export function xor(foo, bar) {
  return foo ? !bar : bar;
}

// Helper function to determine whether the given deviceType is a WiFi bridge.
// A given hub may report one of several valid device type codes.
export function isWifiBridge(deviceType: DeviceType) {
  return deviceType === DeviceType.kWiFiBridge ||
      deviceType === DeviceType.kWiFiBridgeAlt;
}

// The 'type' is the 'deviceType' field from the ReadDeviceAck response.
// The 'subType' is the 'data.type' field from the ReadDeviceAck response.
export function getDeviceModel(
    type: string, subType?: number, tdbuType = TDBUType.kNone): string {
  // For some devices, such as a Wifi curtain motor, there is no device subtype
  // and the model is determined by the type. For other devices, generally RF
  // motors connected to a hub, look up the device subtype.
  const basicModel = subType ? deviceModels[subType] || 'Unidentified Device' :
                               deviceTypes[type];

  // Append the TDBU type to the model name.
  return basicModel + tdbuType;
}

// Given a device's MAC, extract the MAC of its parent hub.
export function extractHubMac(deviceMac: string): string {
  return deviceMac.slice(0, kMacAddrLength);
}

export function makeDeviceName(devInfo: ExtendedDeviceInfo): string {
  // The format of a device's MAC is [hub_mac][device_num] where the former is a
  // 12-character hex string and the latter is a 4-digit hex string. If this is
  // a WiFi motor which does not have a hub, device_num can be empty.
  const macAddr = devInfo.mac.slice(0, kMacAddrLength);
  const devNumHex = devInfo.mac.slice(kMacAddrLength);
  // Parse the hex devNum string into a decimal representation.
  const devNum = parseInt(devNumHex || '0001', 16).toString().padStart(2, '0');
  // Get the device model based on its type, sub-type, and TDBU type.
  const deviceModel =
      getDeviceModel(devInfo.deviceType, devInfo.subType, devInfo.tdbuType);
  // Construct and return the final device name as '[model] [device_num]-[mac]'
  return `${deviceModel} ${devNum}-${macAddr}`;
}

// Estimate battery charge percentage from reported voltage.
// Calculation uses thresholds defined by the Connector app.
export function getBatteryPercent(batteryLevel?: number): number {
  if (batteryLevel === undefined) {
    return -1;
  }
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
  return getBatteryPercent(batteryLevel) <= kLowBatteryPercent;
}