/**
 * @format
 */

import 'react-native-get-random-values';
import { shim as rnQuickBase64Shim } from 'react-native-quick-base64';

import { AppRegistry, LogBox } from 'react-native';
import App from '@app/App';
// import StorybookUIRoot from '@app/StorybookUIRoot';
import { name as appName } from './app.json';

rnQuickBase64Shim();

AppRegistry.registerComponent(appName, () => App);
// AppRegistry.registerComponent(appName, () => StorybookUIRoot);

LogBox.ignoreLogs([
  'Could not find Fiber with id',
  'Non-serializable values were found in the navigation state.',
  'Require cycle: node_modules/react-native-paper/src/components/Appbar',
  'Require cycle: node_modules/pouchdb-utils/lib/index-browser.js',
  'Require cycle: node_modules/@craftzdog/pouchdb-adapter-websql-core',
]);
