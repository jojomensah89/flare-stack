import { browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

export default defineBackground(() => {
  // Manifest V3 background service worker
  browser.runtime.onInstalled.addListener((details) => {
    if (details.reason === "install") {
      console.log("{{PROJECT_NAME}} browser extension installed successfully.");
    }
  });
});
