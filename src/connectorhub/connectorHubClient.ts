/* eslint-disable indent */
import {DgramAsPromised} from 'dgram-as-promised';
import {PlatformConfig} from 'homebridge';

import {Log} from '../util/log';

import * as hubapi from './connector-hub-api';
import * as consts from './connector-hub-constants';
import * as helpers from './connector-hub-helpers';

const kSocketTimeoutMs = 250;
const kMaxRetries = 3;

// Function to safely parse possibly-invalid JSON.
function tryParse(input: string) {
  try {
    return JSON.parse(input);
  } catch (err) {
    return undefined;
  }
}

// Types we expect for connector hub requests and responses.
type DeviceRequest =
    hubapi.GetDeviceListReq|hubapi.WriteDeviceReq|hubapi.ReadDeviceReq;
type DeviceResponse =
    hubapi.GetDeviceListAck|hubapi.WriteDeviceAck|hubapi.ReadDeviceAck;

async function sendCommand(
    cmdObj: DeviceRequest, ip: string): Promise<DeviceResponse> {
  // A promise that holds the ack response from the hub.
  let response;

  // Retry up to kMaxRetries times to overcome any transient network issues.
  for (let attempt = 0; attempt < kMaxRetries && !response; ++attempt) {
    // Create a socket to service this request.
    const socket = DgramAsPromised.createSocket('udp4');

    // Convert the command to a byte buffer of the string representation.
    const sendMsg = Buffer.from(JSON.stringify(cmdObj));

    // Set a maximum timeout for the request.
    setTimeout(() => socket.close(), kSocketTimeoutMs);

    // Send the message and wait for a response from the hub.
    const sendResult = socket.send(sendMsg, consts.kSendPort, ip);
    response = await sendResult && await socket.recv();
  }

  // Return a parsed response, if the operation was successful.
  return (response ? tryParse(response.msg.toString()) : undefined);
}

export class ConnectorHubClient {
  private accessToken: string;
  private sendIp: string;

  constructor(
      private readonly config: PlatformConfig,
      private readonly deviceInfo: hubapi.DeviceInfo,
      private readonly hubToken: string,
  ) {
    this.sendIp = (this.config.hubIp || consts.kMulticastIp);
    this.accessToken = helpers.computeAccessToken(
        {connectorKey: this.config.connectorKey, hubToken: this.hubToken});
  }

  public static getDeviceList(ip?: string): Promise<DeviceResponse> {
    const sendIp = (ip || consts.kMulticastIp);
    return sendCommand(helpers.makeGetDeviceListRequest(), sendIp);
  }

  public getDeviceState(): Promise<DeviceResponse> {
    const command = helpers.makeReadDeviceRequest(this.deviceInfo);
    return sendCommand(command, this.sendIp);
  }

  public setTargetPosition(position: number): Promise<DeviceResponse> {
    if (position === 100 || position === 0) {
      const opCode = position === 0 ? hubapi.DeviceOpCode.kOpen :
                                      hubapi.DeviceOpCode.kClose;
      Log.debug('Simple target command:', {operation: opCode});
      return this.setDeviceState({operation: opCode});
    }
    return this.setDeviceState({targetPosition: position});
  }

  public setTargetAngle(angle: number): Promise<DeviceResponse> {
    return this.setDeviceState({targetAngle: angle});
  }

  private setDeviceState(command: hubapi.DeviceCmd): Promise<DeviceResponse> {
    const request = helpers.makeWriteDeviceRequest(
        this.deviceInfo, this.accessToken, command);
    return sendCommand(request, this.sendIp);
  }
}
