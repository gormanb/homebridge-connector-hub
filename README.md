
# Homebridge Blinds Connector Plugin

This plugin exposes blinds, shades, curtains and similar devices managed by a Connector Motor Hub [DD7002B](https://fccid.io/VYYDD7002B/User-Manual/User-manual-4082340)/[DD1554](https://fccid.io/VYY1554A00/Users-Manual/User-Manual-4750744) or compatible bridge - as well as standalone Wifi motors such as the [DT72TE, DT72TV, DM35F and DM45E](https://dooya.in/wi-fi-motors/) series - as Homekit accessories. These are typically manufactured by [Dooya](https://dooya.in/wi-fi-system/) and sold under various brand names. If your devices are controlled by the Connector+ app ([iOS](https://apps.apple.com/us/app/connector/id1344058317)/[Android](https://play.google.com/store/apps/details?id=com.smarthome.app.connector&gl=US)) or one of the branded apps from the manufacturers listed below, this plugin will make them available in Homekit.

In addition to the Dooya devices mentioned above, the plugin is also expected to work with devices sold by the following vendors, which use the same network protocol:

- [AMP Motorization](https://www.ampmotorization.com/)
- [Alta Bliss Automation](https://www.altawindowfashions.com/product/automation/bliss-automation/)
- [Bloc Blinds](https://www.blocblinds.com/)
- [Brel Home](https://www.brel-home.nl/)
- [3 Day Blinds](https://www.3dayblinds.com/)
- [Diaz](https://www.diaz.be/en/)
- [Coulisse B.V.](https://coulisse.com/) [Motion Blinds](https://motionblinds.com/)
- [Gaviota](https://www.gaviotagroup.com/en/)
- [Havana Shade](https://havanashade.com/)
- [Hurrican Shutters Wholesale](https://www.hurricaneshutterswholesale.com/)
- [Inspired Shades](https://www.inspired-shades.com/)
- [iSmartWindow](https://www.ismartwindow.co.nz/)
- [Martec](https://www.martec.co.nz/)
- [Raven Rock MFG](https://www.ravenrockmfg.com/)
- [ScreenAway](https://www.screenaway.com.au/)
- [Smart Blinds](https://www.smartblinds.nl/)
- [Smart Home](https://www.smart-home.hu/)
- [Uprise Smart Shades](http://uprisesmartshades.com/)

The following hubs/bridges are also expected to work with this plugin:

- CM-20 Motion Blinds bridge
- CMD-01 Motion Blinds mini-bridge
- DD7002B Connector bridge
- D1554 Connector mini-bridge
- DD7002B Brel-Home box
- D1554 Brel Home USB plug

Note that the blinds/curtains/etc must already have been paired with the app in order for them to be visible to this plugin.

## Instructions

In the plugin configuration, fill in the `App Key` field. The key can be obtained using the Connector+ app:
- In the top-left corner of the screen, tap the Menu button (☰)
- Tap your account profile picture, then go to the About page
- Tap the screen five times to display the key.

For branded apps, the key can be obtained using similar approaches:

- In the Coulisse Motion Blinds app, go to Settings > About and tap the screen five times.
- In the Brel Home app, go to the Me page and tap five times on either the `version` field (iOS) or to the right of the photo placeholder (Android).
- In the Bloc Blinds app, go to Settings > About and tap five times on the Bloc Blinds icon.

This is the only mandatory configuration required by the plugin. The plugin will attempt to automatically find your devices via UDP multicast. If this does not work, you can use the `Connector Hub / Wifi Device IPs` section to manually point the plugin to your hub and/or standalone devices.

## Acknowledgements

Thanks to [@alexbacchin](https://github.com/alexbacchin) for putting together [a repo full of documentation](https://github.com/alexbacchin/ConnectorBridge) about the Connector hub network protocol. I had almost given up on finding a way to make my blinds visible to Homekit until I stumbled across it :smiley:
