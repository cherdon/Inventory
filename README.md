# Inventori

This app poses to be an asset/inventory management tool for home use, and other business use cases if need be (events, etc.)

It leverages a DB that can be synced to the cloud, and an optional RFID tagging system that would open up a whole load of possibilities for use cases.

This is a forked version of the Inventori App from zetavg/Inventory, and the resources from the README can be found at the bottom.

## Documentation

View the documentation here: [Inventori Confluence](https://cherdon.atlassian.net/wiki/spaces/KB/pages/83591169/Inventori).


## Development

The majority of the codebase is written in TypeScript, employing React Native to build the mobile app. Java and Objective-C native modules are used for handling UART/Bluetooth communications with RFID devices, and other heavy-lifting tasks such as supporting index build for full-text searching. 

For more details on each project component, check the following directories:

* `App/` - the React Native iOS/Android app.
* `Data/` - data schema and data logic.
* `packages/` - other shared modules.


## Resources

* Documentation: [https://docs.inventory.z72.io](https://docs.inventory.z72.io)
* Telegram Channel: https://t.me/inventory_app.
* Telegram Group: https://t.me/inventory_app_discussions.
* **iOS TestFlight**: Join via https://testflight.apple.com/join/aXKHypal.
* **Android APK Download**: Please check the `.apk` assets in the [latest release](https://github.com/zetavg/Inventory/releases).
* Demo Video: [YouTube](https://bit.ly/inventory-demo-yt).
* Supported devices: [RFID Devices](https://docs.inventory.z72.io/rfid-hardware/supported-rfid-devices).
* ![](https://github.com/zetavg/Inventory/assets/3784687/9647b3cf-4b6d-4385-9059-eb7b85e2e2df)
