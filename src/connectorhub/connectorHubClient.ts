/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable indent */
import {DgramAsPromised} from 'dgram-as-promised';
import {PlatformConfig} from 'homebridge';

import {Log} from '../util/log';

import * as hubapi from './connector-hub-api';
import * as consts from './connector-hub-constants';
import {ReadDeviceType} from './connector-hub-constants';
import * as helpers from './connector-hub-helpers';

const kSocketTimeoutMs = 250;
const kMaxRetries = 3;

// Types we expect for connector hub requests and responses.
type DeviceRequest =
    hubapi.GetDeviceListReq|hubapi.WriteDeviceReq|hubapi.ReadDeviceReq;
type DeviceResponse =
    hubapi.GetDeviceListAck|hubapi.WriteDeviceAck|hubapi.ReadDeviceAck;

// Function to send a request to the hub and receive a sequence of responses.
async function sendCommandMultiResponse(
    cmdObj: DeviceRequest, ip: string,
    expectSingleResponse = false): Promise<DeviceResponse[]> {
  // Array of responses received from the hub(s).
  const responses: DeviceResponse[] = [];

  // Retry up to kMaxRetries times to overcome any transient network issues.
  for (let attempt = 0; attempt < kMaxRetries && !responses.length; ++attempt) {
    try {
      // Create a socket to service this request.
      const socket = DgramAsPromised.createSocket('udp4');

      // Convert the command to a string representation.
      const sendMsg = JSON.stringify(cmdObj);

      // Send the message. We'll wait for confirmation that it was sent later.
      const sendResult = socket.send(sendMsg, consts.kSendPort, ip);

      // Holds the message parsed from the hub response.
      let response: DeviceResponse;

      do {
        // Set a maximum timeout for the request. If we get a response within
        // the timeout, clear the timeout for the next iteration.
        const timer = setTimeout(() => socket.close(), kSocketTimeoutMs);
        const recvMsg = await sendResult && await socket.recv();

        // Try to parse the response and add it to the list of responses.
        if ((response = recvMsg && helpers.tryParse(recvMsg.msg.toString()))) {
          responses.push(response);
        }

        // Clear the timeout if we still need to read from the socket.
        if (response && !expectSingleResponse) {
          clearTimeout(timer);
        }
      } while (response && !expectSingleResponse);
    } catch (ex: any) {
      Log.error('Network error:', ex.message);
    }
  }

  // Return a series of responses, or an empty array if the op was unsuccessful.
  return responses;
}

// Function to send a request to the hub and receive a single response.
async function sendCommand(
    cmdObj: DeviceRequest, ip: string): Promise<DeviceResponse> {
  // Delegate to the generic function with the expectation of a single response.
  const response = await sendCommandMultiResponse(cmdObj, ip, true);
  return response ? response[0] : response;
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

  public static getDeviceList(hubIp: string): Promise<DeviceResponse[]> {
    return sendCommandMultiResponse(helpers.makeGetDeviceListRequest(), hubIp);
  }

  public static readDeviceState(hubIp: string, deviceInfo: hubapi.DeviceInfo):
      Promise<DeviceResponse> {
    return sendCommand(helpers.makeReadDeviceRequest(deviceInfo), hubIp);
  }

  public getDeviceState(readType: ReadDeviceType): Promise<DeviceResponse> {
    if (readType === ReadDeviceType.kActive) {
      const activeReq = helpers.makeWriteDeviceRequest(
          this.deviceInfo, this.accessToken,
          {operation: hubapi.DeviceOpCode.kStatusQuery});
      return sendCommand(activeReq, this.hubIp);
    }
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

  public setDeviceState(command: hubapi.DeviceCmd): Promise<DeviceResponse> {
    const request = helpers.makeWriteDeviceRequest(
        this.deviceInfo, this.accessToken, command);
    return sendCommand(request, this.hubIp);
  }
}
