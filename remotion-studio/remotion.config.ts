/**
 * Note: When using the Node.JS APIs, the config file
 * doesn't apply. Instead, pass options directly to the APIs.
 *
 * All configuration options: https://remotion.dev/docs/config
 */

import { Config } from "@remotion/cli/config";

Config.setRspack(true);
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setDefaultPremountInSeconds(2);
// Headless Linux / cloud containers have no GPU: SwiftShader-over-ANGLE is the
// only backend that gives Three.js a WebGL context there.
Config.setChromiumOpenGlRenderer("swangle");
