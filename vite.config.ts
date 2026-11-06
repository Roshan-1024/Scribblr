import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// scribblr.config.json holds the Supabase keys and is not in git.
// Without it the app builds anyway and shows a setup screen.
const local = fileURLToPath(new URL('./scribblr.config.json', import.meta.url));
const example = fileURLToPath(new URL('./scribblr.config.example.json', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { 'scribblr-config': existsSync(local) ? local : example } },
  server: { port: 5173 },
  build: { target: 'es2021', sourcemap: false },
});
