/*
 * Constants defined by the Connector hub protocol.
 */
export const kMulticastIp = '238.0.0.18';
export const kSendPort = 32100;

// Discrete states that the blinds can be in.
export enum BlindPositionState {
  DECREASING,
  INCREASING,
  STOPPED
}

// Discrete commands that can be sent to the blinds.
export const opCodes =
    ['close', 'open', 'stop', undefined, undefined, 'status'];

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

// Recognised models of blinds that can be connected to the hub.
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
  'Curtain (Open Left)',
  'Curtain (Open Right)',
];

export const wirelessModes = [
  'Uni-Directional',
  'Bi-Directional',
  'Bi-Directional (with mechanical limits)',
  'Other',
];

// Motor type for the given device.
export const voltageModes = ['AC Motor', 'DC Motor'];

// Discrete states that the blinds can be in.
export const stateModes = [
  'Not at any limit',
  'Top-limit',
  'Bottom-limit',
  'Limits detected',
  '3rd limit detected',
];
