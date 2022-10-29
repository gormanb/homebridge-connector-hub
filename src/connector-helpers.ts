import aesjs = require('aes-js');
import dgram = require('dgram');

const sendIp = '238.0.0.18';
const sendPort = 32100;

const opCodes = ['close', 'open', 'stop', undefined, undefined, 'status'];
const hubStats = [undefined, 'Working', 'Pairing', 'Updating'];
const deviceTypes = {
  '10000000': '433Mhz radio motor',
  '22000000': 'Wi-Fi Curtain',
  '02000001': 'Wi-Fi Bridge',
  '22000002': 'Wi-Fi tubular motor',
  '22000005': 'Wi-Fi receiver',
};
const deviceModels = [
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
const wirelessModes = [
  'Uni-Directional',
  'Bi-Directional',
  'Bi-Directional (mechanical limits)',
  'Other',
];
const voltageModes = ['AC Motor', 'DC Motor'];
const stateModes = [
  'Not at any limit',
  'Top-limit',
  'Bottom-limit',
  'Limits detected',
  '3rd -limit detected',
];

function sendCommand(cmdObj, callback) {
  const socket = dgram.createSocket('udp4');
  socket.on('error', (ex) => {
    socket.close();
    throw ex;
  });
  socket.on('message', (msg, info) => {
    socket.close();
    callback(JSON.parse(msg.toString()));
  });
  const sendMsg = Buffer.from(JSON.stringify(cmdObj));
  socket.send(sendMsg, sendPort, sendIp);
}

function makeMsgId() {
  // The ID is the current timestamp with all non-numeric chars removed.
  return (new Date()).toJSON().replaceAll(/\D/g, '');
}

// 'command' is a string mapping to an opCode or is already a command object.
function makeCommandData(command: (string|object)) {
  if (typeof command === 'string') {
    return {operation: opCodes.indexOf(command)};
  }
  return command;
}

function makeGetDeviceListRequest() {
  return {msgType: 'GetDeviceList', msgID: makeMsgId()};
}

function makeReadDeviceRequest(deviceInfo) {
  return {
    msgType: 'ReadDevice',
    mac: deviceInfo.mac,
    deviceType: deviceInfo.deviceType,
    msgID: makeMsgId(),
  };
}

function makeWriteDeviceRequest(deviceInfo, accessToken, command) {
  return {
    msgType: 'WriteDevice',
    mac: deviceInfo.mac,
    deviceType: deviceInfo.deviceType,
    accessToken: accessToken,
    msgID: makeMsgId(),
    data: makeCommandData(command),
  };
}

export function computeAccessToken({connectorKey, hubToken}) {
  const aesEcb =
      new aesjs.ModeOfOperation.ecb(aesjs.utils.utf8.toBytes(connectorKey));
  const tokenEnc = aesEcb.encrypt(aesjs.utils.utf8.toBytes(hubToken));
  return aesjs.utils.hex.fromBytes(tokenEnc).toUpperCase();
}

export function getDeviceList({callback}) {
  sendCommand(makeGetDeviceListRequest(), callback);
}

export function getDeviceState({deviceInfo, callback}) {
  sendCommand(makeReadDeviceRequest(deviceInfo), callback);
}

// 'command' is a string command or an object indicating command and value.
export function setDeviceState({deviceInfo, accessToken, command, callback}) {
  const request = makeWriteDeviceRequest(deviceInfo, accessToken, command);
  sendCommand(request, callback);
}

export function setTargetPositionOrAngle(
    {deviceInfo, accessToken, cmdType, cmdValue, callback}) {
  const command = {[cmdType]: cmdValue};
  setDeviceState({deviceInfo, accessToken, command, callback});
}

export function processRawDeviceInfo(deviceInfo) {
  // TODO: populate the various codes with human-readable equivalents.
}