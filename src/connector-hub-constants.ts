/*
 * Constants defined by the Connector hub protocol.
 */
export const kMulticastIp = '238.0.0.18';
export const kSendPort = 32100;

export const opCodes =
    ['close', 'open', 'stop', undefined, undefined, 'status'];
export const hubStats = [undefined, 'Working', 'Pairing', 'Updating'];
export const deviceTypes = {
  '10000000': '433Mhz radio motor',
  '22000000': 'Wi-Fi Curtain',
  '02000001': 'Wi-Fi Bridge',
  '22000002': 'Wi-Fi tubular motor',
  '22000005': 'Wi-Fi receiver',
};
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
  'Bi-Directional (mechanical limits)',
  'Other',
];
export const voltageModes = ['AC Motor', 'DC Motor'];
export const stateModes = [
  'Not at any limit',
  'Top-limit',
  'Bottom-limit',
  'Limits detected',
  '3rd -limit detected',
];
