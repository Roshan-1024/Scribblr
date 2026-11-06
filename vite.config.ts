import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// Supabase connection used by the app:
//  - scribblr.public.json  (committed) the project's URL + publishable key. These are public by
//    design: every browser running Scribblr receives them. Data is protected by row-level security.
//  - scribblr.config.json  (git-ignored, optional) local override, e.g. to point a fork at your own project.
const file = (name: string) => fileURLToPath(new URL(`./${name}`, import.meta.url));
const override = file('scribblr.config.json');
const configPath = existsSync(override) ? override : file('scribblr.public.json');

// Safety net: never ship a secret key to browsers.
const { supabaseAnonKey = '' } = JSON.parse(readFileSync(configPath, 'utf8'));
const jwtRole = (() => {
  try { return JSON.parse(Buffer.from(supabaseAnonKey.split('.')[1], 'base64url').toString()).role; } catch { return null; }
})();
if (supabaseAnonKey.startsWith('sb_secret_') || jwtRole === 'service_role') {
  throw new Error(
    `\n\n[scribblr] ${configPath} contains a SECRET Supabase key.\n` +
    'Secret / service_role keys bypass all security rules and must never be shipped to users.\n' +
    'Use the publishable (anon) key instead: Supabase → Project Settings → API Keys.\n',
  );
}

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { 'scribblr-config': configPath } },
  server: { port: 5173 },
  build: { target: 'es2021', sourcemap: false },
});
