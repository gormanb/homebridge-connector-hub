/* eslint-disable indent */
import {Log} from '../util/log';

import {DeviceCmd, DeviceOpCode, DeviceType, ReadDeviceAck, WirelessMode, WriteDeviceAck} from './connector-hub-api';
import {OperationState} from './connector-hub-constants';
import {ExtendedDeviceInfo, TDBUType} from './connector-hub-helpers';

// Response types we expect for device status. Undefined if no response.
export type ReadDeviceResponse = ReadDeviceAck|undefined;
export type WriteDeviceResponse = WriteDeviceAck|undefined;

/**
 * This class exposes methods for handling all conversions between Homekit and
 * Connector co-ordinate systems. Generally, Connector positions are the inverse
 * of Homekit values, but in certain cases this does not hold true.
 */
export class ConnectorDeviceHandler {
  // Cached device status, updated periodically.
  protected currentState: ReadDeviceResponse;
  protected lastState: ReadDeviceResponse;

  // By default, a value of 100 is fully closed for connector blinds.
  private kClosedValue = 100;

  // Map of canonical field names to their (variable) effective field names. For
  // a TDBU device, these fields will be suffixed with _T or _B.
  private fields = {
    currentPosition: 'currentPosition',
    currentState: 'currentState',
    currentAngle: 'currentAngle',
    targetPosition: 'targetPosition',
    targetAngle: 'targetAngle',
    batteryLevel: 'batteryLevel',
    operation: 'operation',
  };

  constructor(
      protected readonly deviceInfo: ExtendedDeviceInfo,
  ) {
    // Unlike hub devices, a WiFi curtain's position and target percentages are
    // the same as Homekit, and the inverse of other Connector devices. This is
    // also true of the top-down component of a TDBU blind.
    if (deviceInfo.deviceType === DeviceType.kWiFiCurtain ||
        deviceInfo.tdbuType === TDBUType.kTopDown) {
      this.kClosedValue = 0;
    }
    // Update the field names used in the device data if this is a TDBU blind.
    if (deviceInfo.tdbuType !== TDBUType.kNone) {
      const suffix = (deviceInfo.tdbuType === TDBUType.kTopDown ? '_T' : '_B');
      for (const field in this.fields) {
        this.fields[field] = `${this.fields[field]}${suffix}`;
      }
    }
  }

  // Return an array containing the Hub target corresponding to the input
  // Homekit value, and a command to implement the targeting request.
  protected makeTargetRequest(homekitTarget: number):
      [hubTarget: number, targetRequest: DeviceCmd] {
    const hubTarget = this.fromHomekitPercent(homekitTarget);
    if (this.usesBinaryState()) {
      return [
        this.binarizeTargetPosition(hubTarget),
        this.makeOpenCloseRequest(hubTarget),
      ];
    }
    return [hubTarget, this.makeTargetPositionRequest(hubTarget)];
  }

  // Check whether a response received from the hub is invalid.
  protected isInvalidAck(ack: WriteDeviceResponse|ReadDeviceResponse) {
    return ack && (!ack.data || (<WriteDeviceAck>ack)?.actionResult);
  }

  // Given a hub target value, constructs a binary open/close request.
  private makeOpenCloseRequest(hubTarget: number) {
    return {
      [this.fields.operation]:
          this.positionToOpCode(this.binarizeTargetPosition(hubTarget)),
    };
  }

  // Given a hub target value, constructs a percentage targeting request.
  private makeTargetPositionRequest(hubTarget: number) {
    return {[this.fields.targetPosition]: hubTarget};
  }

  // Convert a percentage position into a binary open / closed state. Note that
  // the input is a Connector hub position, not an inverted Homekit position.
  private positionToOpCode(hubPos: number): DeviceOpCode {
    return Math.abs(this.kClosedValue - hubPos) < 50 ? DeviceOpCode.kClose :
                                                       DeviceOpCode.kOpen;
  }

  // Given a kOpen or kClose opcode, return the equivalent position.
  private opCodeToPosition(opCode: DeviceOpCode): number {
    return opCode === DeviceOpCode.kClose ? this.kClosedValue :
                                            this.invertPC(this.kClosedValue);
  }

  // Helper function to convert between Hub and Homekit percentages.
  private invertPC(percent: number): number {
    return (100 - percent);
  }

  public toHomekitPercent(hubPC: number): number {
    return this.kClosedValue === 100 ? this.invertPC(hubPC) : hubPC;
  }

  private fromHomekitPercent(homekitPC: number): number {
    return this.kClosedValue === 100 ? this.invertPC(homekitPC) : homekitPC;
  }

  // Determine whether this device uses binary open/close commands.
  private usesBinaryState() {
    return (this.currentState || this.lastState)?.data.wirelessMode ===
        WirelessMode.kUniDirectional;
  }

  // Helper function which ensures that the device state received from the hub
  // is in the format expected by the plugin. Mutates and returns the input.
  protected sanitizeDeviceState(deviceState: ReadDeviceAck) {
    // Convert a TDBU reading into a generic device reading.
    for (const field in this.fields) {
      if (deviceState.data[this.fields[field]] !== undefined) {
        deviceState.data[field] = deviceState.data[this.fields[field]];
      }
    }
    // Merge the new state into the previous state. Important for devices which
    // may report only partial state on each refresh, e.g. TDBU blinds.
    deviceState.data =
        Object.assign({}, this.lastState?.data, deviceState.data);
    // Depending on the device type, the hub may return an explicit position or
    // a simple open / closed state. In the former case, don't change anything.
    if (deviceState.data.currentPosition !== undefined) {
      return deviceState;
    }
    // Otherwise, convert the open / closed state into a currentPosition.
    if (deviceState.data.operation <= DeviceOpCode.kOpen) {
      // Convert the device's operation code to a position value.
      deviceState.data.currentPosition =
          this.opCodeToPosition(deviceState.data.operation);
      return deviceState;
    }
    // If the operation is "stopped" then check if we have a target position.
    const target = <number>(deviceState.data.targetPosition);
    if (deviceState.data.operation === DeviceOpCode.kStopped && target >= 0) {
      deviceState.data.currentPosition = target;
      return deviceState;
    }
    // If we reach here, then neither state nor position are available.
    Log.warn('Failed to sanitize device state:', deviceState);
    deviceState.data.currentPosition = this.kClosedValue;
    return deviceState;
  }

  // Homekit may set a percentage position for a device that only supports
  // binary open and close. This function is used to handle this scenario. Note
  // that the input targetPos is a Connector hub position.
  private binarizeTargetPosition(hubTarget: number): number {
    return hubTarget >= 50 ? 100 : 0;
  }

  // Determines the direction in which the window covering is moving, given
  // current position and target.
  public getDirection(hubPos: number, hubTarget: number): number {
    const targetOffset = Math.abs(this.kClosedValue - hubTarget);
    const posOffset = Math.abs(this.kClosedValue - hubPos);
    return posOffset < targetOffset ?
        OperationState.OPEN_OPENING :
        (posOffset > targetOffset ? OperationState.CLOSED_CLOSING :
                                    OperationState.STOPPED);
  }
}