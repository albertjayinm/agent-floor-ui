import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    copyPublicDir: false,
    lib: { entry: { 'agent-floor-ui': 'src/library.ts', protocol: 'src/protocol.ts' }, formats: ['es'], fileName: (_format, name) => `${name}.js`, cssFileName: 'agent-floor-ui' },
    rollupOptions: { external: ['react', 'react-dom/client', 'react/jsx-runtime'] },
  },
});