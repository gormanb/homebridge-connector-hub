/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable indent */
import {DgramAsPromised} from 'dgram-as-promised';
import {PlatformConfig} from 'homebridge';

import {Log} from '../util/log';

import * as hubapi from './connector-hub-api';
import * as consts from './connector-hub-constants';
import * as helpers from './connector-hub-helpers';

const kSocketTimeoutMs = 250;
const kMaxRetries = 3;

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

    try {
      // Send the message and wait for a response from the hub.
      const sendResult = socket.send(sendMsg, consts.kSendPort, ip);
      response = await sendResult && await socket.recv();
    } catch (ex: any) {
      Log.error('Network error:', ex.message);
    }
  }

  // Return a parsed response, if the operation was successful.
  return (response && helpers.tryParse(response.msg.toString()));
}

export class ConnectorHubClient {
  private accessToken: string;

  constructor(
      private readonly config: PlatformConfig,
      private readonly deviceInfo: hubapi.DeviceInfo,
      private readonly hubIp: string,
      private readonly hubToken: string,
  ) {
    this.accessToken = helpers.computeAccessToken(
        {connectorKey: this.config.connectorKey, hubToken: this.hubToken});
  }

  public static getDeviceList(hubIp: string): Promise<DeviceResponse> {
    return sendCommand(helpers.makeGetDeviceListRequest(), hubIp);
  }

  public getDeviceState(): Promise<DeviceResponse> {
    return sendCommand(
        helpers.makeReadDeviceRequest(this.deviceInfo), this.hubIp);
  }

  public setOpenCloseState(op: hubapi.DeviceOpCode): Promise<DeviceResponse> {
    return this.setDeviceState({operation: op});
  }

  public setTargetPosition(position: number): Promise<DeviceResponse> {
    return this.setDeviceState({targetPosition: position});
  }

  public setTargetAngle(angle: number): Promise<DeviceResponse> {
    return this.setDeviceState({targetAngle: angle});
  }

  private setDeviceState(command: hubapi.DeviceCmd): Promise<DeviceResponse> {
    const request = helpers.makeWriteDeviceRequest(
        this.deviceInfo, this.accessToken, command);
    return sendCommand(request, this.hubIp);
  }
}
