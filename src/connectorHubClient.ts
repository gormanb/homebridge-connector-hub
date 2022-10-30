/* eslint-disable indent */
import {Logger, PlatformConfig} from 'homebridge';

import * as constants from './connector-hub-constants';

import aesjs = require('aes-js');
import dgram = require('dgram');

export class ConnectorHubClient {
  private sendIp = constants.kMulticastIp;

  constructor(
      private readonly config: PlatformConfig,
      private readonly log: Logger,
  ) {
    if (this.config.hubIp !== undefined) {
      this.sendIp = this.config.hubIp;
    }
  }

  public static computeAccessToken({connectorKey, hubToken}) {
    const aesEcb =
        new aesjs.ModeOfOperation.ecb(aesjs.utils.utf8.toBytes(connectorKey));
    const tokenEnc = aesEcb.encrypt(aesjs.utils.utf8.toBytes(hubToken));
    return aesjs.utils.hex.fromBytes(tokenEnc).toUpperCase();
  }

  public getDeviceList({callback}) {
    this.sendCommand(this.makeGetDeviceListRequest(), callback);
  }

  public getDeviceState({deviceInfo, callback}) {
    this.sendCommand(this.makeReadDeviceRequest(deviceInfo), callback);
  }

  // 'command' is a string command or an object indicating command and value.
  public setDeviceState({deviceInfo, accessToken, command, callback}) {
    const request =
        this.makeWriteDeviceRequest(deviceInfo, accessToken, command);
    this.sendCommand(request, callback);
  }

  public setTargetPositionOrAngle(
      {deviceInfo, accessToken, cmdType, cmdValue, callback}) {
    const command = {[cmdType]: cmdValue};
    this.setDeviceState({deviceInfo, accessToken, command, callback});
  }

  private sendCommand(cmdObj, callback) {
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
    socket.send(sendMsg, constants.kSendPort, this.sendIp);
  }

  private makeMsgId() {
    // The ID is the current timestamp with all non-numeric chars removed.
    return (new Date()).toJSON().replaceAll(/\D/g, '');
  }

  // 'command' is a string mapping to an opCode or is already a command object.
  private makeCommandData(command: (string|object)) {
    if (typeof command === 'string') {
      return {operation: constants.opCodes.indexOf(command)};
    }
    return command;
  }

  private makeGetDeviceListRequest() {
    return {msgType: 'GetDeviceList', msgID: this.makeMsgId()};
  }

  private makeReadDeviceRequest(deviceInfo) {
    return {
      msgType: 'ReadDevice',
      mac: deviceInfo.mac,
      deviceType: deviceInfo.deviceType,
      msgID: this.makeMsgId(),
    };
  }

  private makeWriteDeviceRequest(deviceInfo, accessToken, command) {
    return {
      msgType: 'WriteDevice',
      mac: deviceInfo.mac,
      deviceType: deviceInfo.deviceType,
      accessToken: accessToken,
      msgID: this.makeMsgId(),
      data: this.makeCommandData(command),
    };
  }
}
