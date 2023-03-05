/* eslint-disable indent */
import {Log} from '../util/log';

import {DeviceInfo, DeviceOpCode, DeviceType, ReadDeviceAck} from './connector-hub-api';
import {OperationState} from './connector-hub-constants';

/**
 * This class exposes methods for handling all conversions between Homekit and
 * Connector co-ordinate systems. Generally, Connector positions are the inverse
 * of Homekit values, but in certain cases this does not hold true.
 */
export class ConnectorDeviceHandler {
  // By default, a value of 100 is fully closed for connector blinds.
  private kClosedValue = 100;

  constructor(
      private readonly deviceInfo: DeviceInfo,
  ) {
    // Unlike hub devices, a WiFi curtain's position and target percentages are
    // the same as Homekit, and the inverse of other Connector devices.
    if (deviceInfo.deviceType === DeviceType.kWiFiCurtain) {
      this.kClosedValue = 0;
    }
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

  // Helper function which ensures that the device state received from the hub
  // is in the format expected by the plugin. Mutates and returns the input.
  public sanitizeDeviceState(deviceState: ReadDeviceAck) {
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