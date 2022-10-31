/* eslint-disable indent */
import {DgramAsPromised, SocketAsPromised} from 'dgram-as-promised';
import {Logger, PlatformConfig} from 'homebridge';

import * as consts from './connector-hub-constants';
import * as helpers from './connector-hub-helpers';

async function sendCommand(
    cmdObj: object, socket: SocketAsPromised|undefined, ip: string) {
  // If no socket was supplied, create a single-use socket.
  if (!socket) {
    socket = DgramAsPromised.createSocket('udp4');
    setTimeout(() => socket?.close(), 500);
  }
  // Send the message...
  const sendMsg = Buffer.from(JSON.stringify(cmdObj));
  socket.send(sendMsg, consts.kSendPort, ip);
  const response = await socket.recv();

  // ... and return a parsed response, if the operation was successful.
  return (response ? JSON.parse(response.msg.toString()) : undefined);
}

export class ConnectorHubClient {
  private socket: SocketAsPromised;
  private accessToken: string;
  private sendIp: string;

  constructor(
      private readonly config: PlatformConfig,
      private readonly deviceInfo: object,
      private readonly hubToken: string,
      private readonly log: Logger,
  ) {
    this.socket = DgramAsPromised.createSocket('udp4');
    this.sendIp = (this.config.hubIp || consts.kMulticastIp);
    this.accessToken = helpers.computeAccessToken(
        {connectorKey: this.config.connectorKey, hubToken: this.hubToken});
  }

  public static getDeviceList(ip: string|undefined) {
    const sendIp = (ip || consts.kMulticastIp);
    return sendCommand(helpers.makeGetDeviceListRequest(), undefined, sendIp);
  }

  public getDeviceState() {
    const command = helpers.makeReadDeviceRequest(this.deviceInfo);
    return sendCommand(command, this.socket, this.sendIp);
  }

  public setTargetPosition(position: number) {
    return this.setDeviceState({targetPosition: position});
  }

  public setTargetAngle(angle: number) {
    return this.setDeviceState({targetAngle: angle});
  }

  // 'command' is a string command or a ready-made command object.
  private setDeviceState(command: object|string) {
    const request = helpers.makeWriteDeviceRequest(
        this.deviceInfo, this.accessToken, command);
    return sendCommand(request, this.socket, this.sendIp);
  }
}
