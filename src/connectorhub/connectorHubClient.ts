/* eslint-disable indent */
import * as dgram from 'dgram';
import {Logger, PlatformConfig} from 'homebridge';

import * as consts from './connector-hub-constants';
import * as helpers from './connector-hub-helpers';

type CallbackFunc = (response: any) => void;

function sendCommand(cmdObj: object, ip: string, callback: CallbackFunc) {
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
  socket.send(sendMsg, consts.kSendPort, ip);
}

export class ConnectorHubClient {
  private accessToken: string;
  private sendIp: string;

  constructor(
      private readonly config: PlatformConfig,
      private readonly deviceInfo: object,
      private readonly hubToken: string,
      private readonly log: Logger,
  ) {
    this.sendIp = (this.config.hubIp || consts.kMulticastIp);
    this.accessToken = helpers.computeAccessToken(
        {connectorKey: this.config.connectorKey, hubToken: this.hubToken});
  }

  public static getDeviceList(ip: string|undefined, callback: CallbackFunc) {
    const sendIp = (ip || consts.kMulticastIp);
    sendCommand(helpers.makeGetDeviceListRequest(), sendIp, callback);
  }

  public getDeviceState(callback: CallbackFunc) {
    sendCommand(
        helpers.makeReadDeviceRequest(this.deviceInfo), this.sendIp, callback);
  }

  public setTargetPosition(position: number, callback: CallbackFunc) {
    this.setDeviceState({targetPosition: position}, callback);
  }

  public setTargetAngle(angle: number, callback: CallbackFunc) {
    this.setDeviceState({targetAngle: angle}, callback);
  }

  // 'command' is a string command or an object indicating command and value.
  private setDeviceState(command: object, callback: CallbackFunc) {
    const request = helpers.makeWriteDeviceRequest(
        {deviceInfo: this.deviceInfo, accessToken: this.accessToken, command});
    sendCommand(request, this.sendIp, callback);
  }
}
