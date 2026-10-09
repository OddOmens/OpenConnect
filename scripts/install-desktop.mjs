#!/usr/bin/env node
// Adds OpenAppShot to the Claude desktop app as a local MCP connector.
// Edits ~/Library/Application Support/Claude/claude_desktop_config.json (a backup is written first).
// Restart the Claude app afterwards.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

let config = {};
if (fs.existsSync(file)) {
  const raw = fs.readFileSync(file, 'utf8');
  fs.writeFileSync(`${file}.bak`, raw);
  config = raw.trim() ? JSON.parse(raw) : {};
}
config.mcpServers ??= {};
config.mcpServers.openappshot = {
  // Absolute node path: the Claude app doesn't inherit your shell's PATH.
  command: process.execPath,
  args: [path.join(root, 'bin', 'appshot-mcp.mjs')],
};
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, JSON.stringify(config, null, 2) + '\n');
console.log(`✓ Added "openappshot" to ${file}`);
console.log('  Restart the Claude app, then ask: "What screenshots does <app> have in OpenAppShot?"');
