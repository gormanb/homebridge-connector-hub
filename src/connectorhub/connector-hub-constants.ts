/*
 * Constants defined by the Connector hub protocol and by this plugin.
 */
export const kMulticastIp = '238.0.0.18';
export const kSendPort = 32100;

// Battery level constants.
export const kLowBatteryPercent = 15;

// Operation states that the hub may report.
export enum OperationState {
  CLOSED_CLOSING = 0,
  OPEN_OPENING = 1,
  STOPPED = 2
}

// Discrete commands that can be sent to the hub.
export const opCodes =
    ['close', 'open', 'stop', undefined, undefined, 'status'];

// Maps opCodes to corresponding percentage position.
export const opCodePositions = [100, 0];

// States that the Connector hub can be in.
export const hubStats = [undefined, 'Working', 'Pairing', 'Updating'];

// Device types. Can be either the hub itself or a connected device.
export const deviceTypes = {
  '10000000': '433Mhz Radio Motor',
  '22000000': 'Wi-Fi Curtain',
  '02000001': 'Wi-Fi Bridge',
  '22000002': 'Wi-Fi Tubular Motor',
  '22000005': 'Wi-Fi Receiver',
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
  'TDBU',
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
