const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

/**
 * The app reads the web app's own translations (../messages) and the few rules
 * written to be shared (../src/lib, plain functions only) rather than keeping
 * copies that would drift. Metro only sees files under the project by default,
 * so those folders are added to what it watches.
 */
const config = getDefaultConfig(__dirname);
config.watchFolders = [
  ...(config.watchFolders ?? []),
  path.resolve(__dirname, "../messages"),
  path.resolve(__dirname, "../src/lib"),
];

module.exports = config;
