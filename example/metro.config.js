// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Add the parent directory to watchFolders so Metro can resolve the local package
config.watchFolders = [path.resolve(__dirname, "..")];

// Ensure Metro resolves the local package correctly
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, "node_modules"),
  path.resolve(__dirname, "..", "node_modules"),
];

config.resolver.extraNodeModules = {
  "react-native-chunk-upload": "..",
};

module.exports = config;
