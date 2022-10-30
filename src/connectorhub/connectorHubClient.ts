/* eslint-disable indent */
import {DgramAsPromised} from 'dgram-as-promised';
import {Logger, PlatformConfig} from 'homebridge';

import * as consts from './connector-hub-constants';
import * as helpers from './connector-hub-helpers';

const kSocketTimeout = 500;

async function sendCommand(cmdObj: object, ip: string): Promise<any|undefined> {
  // Create a new socket to service this request.
  const socket = DgramAsPromised.createSocket('udp4');
  setTimeout(socket.destroy, kSocketTimeout);

  // Send the message...
  const sendMsg = Buffer.from(JSON.stringify(cmdObj));
  socket.send(sendMsg, consts.kSendPort, ip);
  const response = await socket.recv();

  // ... and return a parsed response, if the operation was successful.
  return (response ? JSON.parse(response.msg.toString()) : undefined);
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

  public static getDeviceList(ip: string|undefined) {
    const sendIp = (ip || consts.kMulticastIp);
    return sendCommand(helpers.makeGetDeviceListRequest(), sendIp);
  }

  public getDeviceState() {
    return sendCommand(
        helpers.makeReadDeviceRequest(this.deviceInfo), this.sendIp);
  }

  public setTargetPosition(position: number) {
    return this.setDeviceState({targetPosition: position});
  }

  public setTargetAngle(angle: number) {
    return this.setDeviceState({targetAngle: angle});
  }

  // 'command' is a string command or an object indicating command and value.
  private setDeviceState(command: object) {
    const request = helpers.makeWriteDeviceRequest(
        this.deviceInfo, this.accessToken, command);
    return sendCommand(request, this.sendIp);
  }
}
