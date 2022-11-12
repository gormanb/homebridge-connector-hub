import {API} from 'homebridge';

import {ConnectorHubPlatform} from './platform';
import {PLATFORM_NAME} from './settings';

// Registers the platform with Homebridge.
export = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, ConnectorHubPlatform);
};
