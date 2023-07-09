/* eslint-disable indent */
import {Log} from '../util/log';

import {DeviceOpCode, DeviceType, ReadDeviceAck, WriteDeviceAck} from './connector-hub-api';
import {OperationState} from './connector-hub-constants';
import {ExtendedDeviceInfo, TDBUType} from './connector-hub-helpers';

/**
 * This class exposes methods for handling all conversions between Homekit and
 * Connector co-ordinate systems. Generally, Connector positions are the inverse
 * of Homekit values, but in certain cases this does not hold true.
 */
export class ConnectorDeviceHandler {
  // By default, a value of 100 is fully closed for connector blinds.
  private kClosedValue = 100;

  // Does the device only support binary open / close?
  protected usesBinaryState = false;

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
    // the same as Homekit, and the inverse of other Connector devices.
    if (deviceInfo.deviceType === DeviceType.kWiFiCurtain) {
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

  protected extractCurrentPosition(deviceState: ReadDeviceAck|WriteDeviceAck) {
    return deviceState.data[this.fields.currentPosition];
  }

  protected makeOpenCloseRequest(binarizedTarget: number) {
    return {[this.fields.operation]: this.positionToOpCode(binarizedTarget)};
  }

  protected makeTargetPositionRequest(target: number) {
    return {[this.fields.targetPosition]: target};
  }

  // Convert a percentage position into a binary open / closed state. Note that
  // the input is a Connector hub position, not an inverted Homekit position.
  public positionToOpCode(position: number): DeviceOpCode {
    return Math.abs(this.kClosedValue - position) < 50 ? DeviceOpCode.kClose :
                                                         DeviceOpCode.kOpen;
  }

  // Given a kOpen or kClose opcode, return the equivalent position.
  public opCodeToPosition(opCode: DeviceOpCode): number {
    return opCode === DeviceOpCode.kClose ? this.kClosedValue :
                                            this.invertPC(this.kClosedValue);
  }

  // Helper function to convert between Hub and Homekit percentages.
  private invertPC(percent: number): number {
    return (100 - percent);
  }

  public toHomekitPercent(percent: number): number {
    return this.kClosedValue === 100 ? this.invertPC(percent) : percent;
  }

  public fromHomekitPercent(percent: number): number {
    return this.kClosedValue === 100 ? this.invertPC(percent) : percent;
  }

  // Determine whether this device uses binary open/close commands, by checking
  // whether the currentPosition percentage field is absent.
  private checkUsesBinaryState(deviceState: ReadDeviceAck): boolean {
    // Need to check all possible variants since TDBU blinds sometimes report
    // the state of only one of their components.
    const currentPosFields =
        ['currentPosition', 'currentPosition_T', 'currentPosition_B'];
    return currentPosFields.every(
        (fieldName) => deviceState.data[fieldName] === undefined);
  }

  // Helper function which ensures that the device state received from the hub
  // is in the format expected by the plugin. Mutates and returns the input.
  public sanitizeDeviceState(
      deviceState: ReadDeviceAck, lastState?: ReadDeviceAck) {
    // Determine whether the device only reports binary open / closed state,
    // then sanitize the status object to conform to the expected format.
    this.usesBinaryState =
        this.usesBinaryState || this.checkUsesBinaryState(deviceState);

    // Convert a TDBU reading into a generic device reading.
    for (const field in this.fields) {
      if (deviceState.data[this.fields[field]] !== undefined) {
        deviceState.data[field] = deviceState.data[this.fields[field]];
      }
    }
    // Merge the new state into the previous state. Important for devices which
    // may report only partial state on each refresh, e.g. TDBU blinds.
    deviceState = Object.assign({}, lastState, deviceState);
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
    // If we reach here, then neither state nor position are available.
    Log.warn('Failed to sanitize device state:', deviceState);
    deviceState.data.currentPosition = this.kClosedValue;
    return deviceState;
  }

  // Homekit may set a percentage position for a device that only supports
  // binary open and close. This function is used to handle this scenario. Note
  // that the input targetPos is a Connector hub position.
  public binarizeTargetPosition(targetPos: number): number {
    return targetPos >= 50 ? 100 : 0;
  }

  // Determines the direction in which the window covering is moving, given
  // current position and target.
  public getDirection(pos: number, target: number): number {
    const targetOffset = Math.abs(this.kClosedValue - target);
    const posOffset = Math.abs(this.kClosedValue - pos);
    return posOffset < targetOffset ?
        OperationState.OPEN_OPENING :
        (posOffset > targetOffset ? OperationState.CLOSED_CLOSING :
                                    OperationState.STOPPED);
  }
}