import {DeviceType} from './connector-hub-api';

/*
 * Constants defined by the Connector hub protocol and by this plugin.
 */
export const kMulticastIp = '238.0.0.18';
export const kSendPort = 32100;

// Battery level constants.
export const kLowBatteryPercent = 15;

// Length of a hub's MAC address, excluding colons.
export const kMacAddrLength = 12;

// Operation states that the hub may report.
export enum OperationState {
  CLOSED_CLOSING = 0,
  OPEN_OPENING = 1,
  STOPPED = 2
}

// Used to determine the type of read request to send.
export enum ReadDeviceType {
  kPassive,  // Read cached values from the hub.
  kActive    // Read real-time values from the device.
}

// Discrete commands that can be sent to the hub.
export const opCodes =
    ['close', 'open', 'stop', undefined, undefined, 'status'];

// States that the Connector hub can be in.
export const hubStats = [undefined, 'Working', 'Pairing', 'Updating'];

// Device types. Can be either the hub itself or a connected device.
export const deviceTypes = {
  [DeviceType.k433MHzRadioMotor]: '433Mhz Radio Motor',
  [DeviceType.kWiFiCurtain]: 'Wi-Fi Curtain',
  [DeviceType.kWiFiBridge]: 'Wi-Fi Bridge',
  [DeviceType.kWiFiBridgeAlt]: 'Wi-Fi Bridge',
  [DeviceType.kWiFiTubularMotor]: 'Wi-Fi Tubular Motor',
  [DeviceType.kWiFiReceiver]: 'Wi-Fi Receiver',
};

// Recognised device models that can be connected to the hub.
export const deviceModels = [
  undefined,
  'Roller Blinds',
  'Venetian Blinds',
  'Roman Blinds',
  'Honeycomb Blinds',
  'Shangri-La Blinds',
  'Roller Shutter',
  'Roller Gate',
  'Awning',
  'TDBU Blinds',  // Top-Down Bottom-Up
  'Day & Night Blinds',
  'Dimming Blinds',
  'Curtain',
  'Curtain Left',
  'Curtain Right',
];

export const wirelessModes = [
  'Uni-Directional',
  'Bi-Directional',
  'Bi-Directional, Mechanical Limits',
  'Other',
];

// Motor type for the given device.
export const voltageModes = ['AC Motor', 'DC Motor'];

// Discrete states that the devices can be in.
export const stateModes = [
  'Not at any limit',
  'Top Limit',
  'Bottom Limit',
  'Limits Detected',
  '3rd Limit Detected',
];
