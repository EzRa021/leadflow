const { join } = require("path");

/**
 * @type {import("puppeteer").Configuration}
 */
module.exports = {
  // Keep Puppeteer's Chrome download inside the project so Render
  // can find it after the build step caches it.
  cacheDirectory: join(__dirname, ".cache", "puppeteer"),
};
