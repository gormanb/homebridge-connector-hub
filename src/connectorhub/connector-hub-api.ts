/*
 * A set of enums and interfaces laying out the Connector hub wire protocol.
 */
enum DeviceOpCode {
  kClose = 0,
  kOpen = 1,
  kStopped = 2,
  kStatusQuery = 5
}

enum DeviceType {
  kWiFiBridge = '02000001',
  k433MHzRadioMotor = '10000000',
  kWiFiCurtain = '22000000',
  kWiFiTubularMotor = '22000002',
  kWiFiReceiver = '22000005'
}

enum DeviceModel {
  kRollerBlinds = 1,
  kVenetianBlinds = 2,
  kRomanBlinds = 3,
  kHoneycombBlinds = 4,
  kShangriLaBlinds = 5,
  kRollerShutter = 6,
  kRollerGate = 7,
  kAwning = 8,
  kTDBU = 9,
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

enum WirelessMode {
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
  type: DeviceModel;
  operation: DeviceOpCode;
  currentPosition: number;
  currentAngle: number;
  currentState: DeviceState;
  voltageMode: VoltageMode;
  batteryLevel: number;
  chargingState: ChargingState;
  wirelessMode: WirelessMode;
  RSSI: number;
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
}

// Sent to connected clients every 30-60s.
interface Heartbeat {
  msgType: 'Heartbeat';
  mac: string;
  deviceType: DeviceType;
  token: string;
  data: HeartbeatData;
}

// Sent to client on completion of an operation.
interface Report {
  msgType: 'Report';
  mac: string;
  deviceType: DeviceType;
  data: DeviceStatus;
}