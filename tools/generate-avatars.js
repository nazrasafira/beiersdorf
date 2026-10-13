#!/usr/bin/env node
/*
 * Generates illustrated portraits for the demo users into assets/avatars/<username>.svg
 * (DiceBear "Lorelei" style by Lisa Wischofsky, CC0 1.0). Real photos uploaded in the app replace these.
 *
 * Usage (needs the generator packages, e.g. in a temp folder):
 *   npm install @dicebear/core @dicebear/collection
 *   NODE_PATH=<that folder>/node_modules node tools/generate-avatars.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { createAvatar } = require('@dicebear/core');
const { lorelei } = require('@dicebear/collection');

const root = path.join(__dirname, '..');
const sandbox = { window: {}, console };
vm.runInNewContext(fs.readFileSync(path.join(root, 'assets/js/data.js'), 'utf8'), sandbox);
const users = sandbox.window.Data.allUsers();

const out = path.join(root, 'assets/avatars');
fs.mkdirSync(out, { recursive: true });
const backgrounds = ['dbe4f3', 'e3ecf9', 'e8e3f5', 'f6e7e1', 'e2f1ea', 'f4ecd8'];
users.forEach((u, i) => {
  const svg = createAvatar(lorelei, {
    seed: u.username,
    backgroundColor: [backgrounds[i % backgrounds.length]],
    beardProbability: 0,
    radius: 50,
  }).toString();
  fs.writeFileSync(path.join(out, u.username + '.svg'), svg);
});
console.log(`wrote ${users.length} avatars to assets/avatars/`);
