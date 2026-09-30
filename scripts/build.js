const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const output = path.join(root, 'dist');

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return {};
  return Object.fromEntries(
    fs.readFileSync(file, 'utf8')
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=');
        const key = line.slice(0, index).trim();
        const value = line.slice(index + 1).trim().replace(/^['"]|['"]$/g, '');
        return [key, value];
      })
  );
}

const localEnv = loadDotEnv(path.join(root, '.env'));
const env = { ...localEnv, ...process.env };
const url = env.SUPABASE_URL;
const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;

if (!url || !publishableKey) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_PUBLISHABLE_KEY. Copy .env.example to .env locally, or add both variables in your host dashboard.');
}

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

for (const file of ['index.html', 'app.js', 'data.js', 'style.css', 'html2pdf.bundle.min.js']) {
  fs.copyFileSync(path.join(root, file), path.join(output, file));
}
fs.cpSync(path.join(root, 'images'), path.join(output, 'images'), { recursive: true });

const browserConfig = `/* Generated during deployment. Values are publishable browser configuration only. */\nwindow.SUPABASE_CONFIG = ${JSON.stringify({ url, publishableKey }, null, 2)};\n`;
fs.writeFileSync(path.join(output, 'supabase-config.js'), browserConfig);
console.log('Built static catalogue in dist/.');

