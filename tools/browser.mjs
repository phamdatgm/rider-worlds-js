// Shared headless Chrome launcher for the puppeteer-core tools (smoke / scenario / debug).
// CHROME=<path> overrides the browser; otherwise the first existing default for this OS is used.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const DEFAULTS = {
  win32: ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe'],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  linux: ['/opt/pw-browsers/chromium-1194/chrome-linux/chrome', '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'],
};

export function chromePath() {
  if (process.env.CHROME) return process.env.CHROME;
  const found = (DEFAULTS[process.platform] || []).find((p) => fs.existsSync(p));
  if (!found) throw new Error('Chrome not found: set CHROME=<path to chrome executable>');
  return found;
}

export function launchBrowser(opts = {}) {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'];
  // Chrome refuses to start as root (containers, CI) unless the sandbox is off
  if (process.getuid?.() === 0) args.push('--no-sandbox');
  return puppeteer.launch({ executablePath: chromePath(), headless: 'new', args, ...opts });
}
