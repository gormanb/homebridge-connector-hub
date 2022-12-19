
# Homebridge Connector Hub Plugin

This plugin exposes blinds, shades, curtains and similar devices managed by a Connector Motor Hub [DD7002B](https://fccid.io/VYYDD7002B/User-Manual/User-manual-4082340) or [DD1554](https://fccid.io/VYY1554A00/Users-Manual/User-Manual-4750744) - typically manufactured by [Dooya](https://dooya.in/wi-fi-system/) and sold under various brand names - as Homekit accessories. If your devices are controlled by the Connector+ app on [iOS](https://apps.apple.com/us/app/connector/id1344058317) or [Android](https://play.google.com/store/apps/details?id=com.smarthome.app.connector&gl=US), this plugin will make them available in Homekit.

Note that the devices must already have been paired with the hub via the app in order for them to be visible to this plugin.

## Instructions

In the plugin configuration, fill in the `Connector Key` field. The key can be obtained using the Connector+ app:
- In the top-left corner of the screen, tap the Menu button (☰)
- Tap your account profile picture, then go to the About page
- Tap the screen five times to display the key.

This is the only mandatory configuration required by the plugin. The plugin will attempt to automatically find your hub via UDP multicast. If this does not work, you can use the `Connector Hub IP` setting to manually point the plugin to the Connector hub.

## Acknowledgements

Thanks to [@alexbacchin](https://github.com/alexbacchin) for putting together [a repo full of documentation](https://github.com/alexbacchin/ConnectorBridge) about the Connector hub network protocol. I had almost given up on finding a way to make my blinds visible to Homekit until I stumbled across it :smiley:
