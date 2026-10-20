import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { createReadStream } from 'node:fs';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), {
    name: 'offline-media-development-resource',
    configureServer(server) {
      server.middlewares.use('/media/ffmpeg-core.wasm', (_request, response) => {
        response.setHeader('Content-Type', 'application/wasm');
        createReadStream(resolve('src-tauri/resources/media/ffmpeg-core.wasm')).pipe(response);
      });
    },
  }],
  clearScreen: false,
  server: { port: 1420, strictPort: true, watch: { ignored: ['**/src-tauri/**', '**/artifacts/**', '**/test-results/**'] } },
  build: { target: 'es2022', sourcemap: false },
});
