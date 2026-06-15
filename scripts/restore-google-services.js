// scripts/restore-google-service.json
const fs = require('fs');
const path = require('path');

const GOOGLE_SERVICES_PATH = './android/app/google-services.json';
const b64 = process.env.GOOGLE_SERVICES_JSON_BASE64_FIXED;

if (!b64) {
  console.warn('⚠️ GOOGLE_SERVICES_JSON_BASE64_FIXED not found, skipping');
  process.exit(0);
}

const decoded = Buffer.from(b64, 'base64').toString('utf8');
fs.mkdirSync(path.dirname(GOOGLE_SERVICES_PATH), { recursive: true });
fs.writeFileSync(GOOGLE_SERVICES_PATH, decoded);
console.log('✅ google-services.json restored from base64');
