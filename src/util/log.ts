/* eslint-disable @typescript-eslint/no-explicit-any */
import {Logger} from 'homebridge';

/**
 * A logging class intended to allow finer-grain control over logging levels.
 */
export class Log {
  private static enableDebugLog: boolean;
  private static internalLog: Logger;

  public static configure(internalLog: Logger, enableDebugLog: boolean) {
    Log.enableDebugLog = enableDebugLog;
    Log.internalLog = internalLog;
  }

  public static info(message: string, ...parameters: any[]): void {
    Log.internalLog.info(message, ...parameters);
  }

  public static warn(message: string, ...parameters: any[]): void {
    Log.internalLog.warn(message, ...parameters);
  }

  public static error(message: string, ...parameters: any[]): void {
    Log.internalLog.error(message, ...parameters);
  }

  // Homebridge only outputs debug-level messages when the entire instance has
  // been started in debug mode. We use 'info' level and prepend [DEBUG] to
  // signify debug messages when the user has enabled verbose logging.
  public static debug(message: string, ...parameters: any[]): void {
    if (Log.enableDebugLog) {
      Log.internalLog.info(`[DEBUG] ${message}`, ...parameters);
    }
  }
}
