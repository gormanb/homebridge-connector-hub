/*
 * A set of enums and interfaces laying out the Connector hub wire protocol.
 */
export enum DeviceOpCode {
  kClose = 0,
  kOpen = 1,
  kStopped = 2,
  kStatusQuery = 5
}

export enum DeviceType {
  kWiFiBridge = '02000001',
  kWiFiBridgeAlt = '02000002',
  k433MHzRadioMotor = '10000000',
  kWiFiCurtain = '22000000',
  kWiFiTubularMotor = '22000002',
  kWiFiReceiver = '22000005'
}

export enum DeviceModel {
  kRollerBlinds = 1,
  kVenetianBlinds = 2,
  kRomanBlinds = 3,
  kHoneycombBlinds = 4,
  kShangriLaBlinds = 5,
  kRollerShutter = 6,
  kRollerGate = 7,
  kAwning = 8,
  kTopDownBottomUp = 9,
  kDayAndNightBlinds = 10,
  kDimmingBlinds = 11,
  kCurtain = 12,
  kCurtainOpenLeft = 13,
  kCurtainOpenRight = 14
}

enum DeviceState {
  kNoLimits = 0,
  kTopLimitDetected = 1,
  kBottomLimitDetected = 2,
  kLimitsDetected = 3,
  kThirdLimitDetected = 4
}

enum HubState {
  kWorking = 1,
  kPairing = 2,
  kUpdating = 3
}

enum VoltageMode {
  kACMotor = 0,
  kDCMotor = 1
}

enum ChargingState {
  kNotCharging = 0,
  kCharging = 1,
  kNotChargeable = 2
}

export enum WirelessMode {
  kUniDirectional = 0,
  kBiDirectional = 1,
  kBiDiWithMechanicalLimits = 2,
  kOther = 3
}

export interface DeviceInfo {
  mac: string;
  deviceType: DeviceType;
}

interface DeviceStatus {
  type: DeviceModel;  // Can be absent for a WiFi motor device
  operation: DeviceOpCode;
  direction?: number;  // Observed on Wifi curtain, likely DeviceOpCode
  currentPosition: number;
  targetPosition?: number;  // Only observed on Wifi motor devices
  currentAngle: number;
  currentState: DeviceState;
  switchMode?: number;   // Observed on Wifi curtain, unknown function
  controlMode?: number;  // Observed on Wifi curtain, unknown function
  voltageMode: VoltageMode;
  batteryLevel: number;
  chargingState: ChargingState;
  wirelessMode: WirelessMode;
  RSSI: number;
}

// Extended DeviceStatus for TDBU blinds.
export interface DeviceStatusTDBU extends DeviceStatus {
  operation_T: DeviceOpCode;
  operation_B: DeviceOpCode;
  currentPosition_T: number;
  currentPosition_B: number;
  currentState_T: DeviceState;
  currentState_B: DeviceState;
  batteryLevel_T: number;
  batteryLevel_B: number;
}

interface HeartbeatData {
  currentState: HubState;
  numberOfDevices: number;
  RSSI: number;
}

export interface DeviceCmd {
  operation?: DeviceOpCode;
  targetPosition?: number;
  targetAngle?: number;
}

// Not used at present, since Homekit does not support TDBU blinds.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface DeviceCmdTDBU extends DeviceCmd {
  operation_T?: DeviceOpCode;
  operation_B?: DeviceOpCode;
  targetPosition_T?: number;
  targetPosition_B?: number;
}

//
// Messages sent to and received from the hub begin here.
//

export interface GetDeviceListReq {
  msgType: 'GetDeviceList';
  msgID: string;
}

export interface GetDeviceListAck {
  msgType: 'GetDeviceListAck';
  mac: string;
  deviceType: DeviceType;
  fwVersion: string;
  ProtocolVersion: string;
  token: string;
  data: DeviceInfo[];
}

export interface WriteDeviceReq {
  msgType: 'WriteDevice';
  mac: string;
  deviceType: DeviceType;
  accessToken: string;
  msgID: string;
  data: DeviceCmd;
}

export interface WriteDeviceAck {
  msgType: 'WriteDeviceAck';
  mac: string;
  deviceType: DeviceType;
  data: DeviceStatus;
  actionResult?: string;
}

export interface ReadDeviceReq {
  msgType: 'ReadDevice';
  mac: string;
  deviceType: DeviceType;
  msgID: string;
}

export interface ReadDeviceAck {
  msgType: 'ReadDeviceAck';
  mac: string;
  deviceType: DeviceType;
  data: DeviceStatus;
  actionResult?: string;
}

// Sent to connected clients every 30-60s. Not used at present.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Heartbeat {
  msgType: 'Heartbeat';
  mac: string;
  deviceType: DeviceType;
  token: string;
  data: HeartbeatData;
}

// Sent to client on completion of an operation. Not used at present.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
interface Report {
  msgType: 'Report';
  mac: string;
  deviceType: DeviceType;
  data: DeviceStatus;
}