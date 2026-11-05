import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vendor code in its own long-lived chunks: an app update does not make browsers download the
// map engine, the editor or React again, and pages load only the libraries they use.
const VENDOR: [RegExp, string][] = [
  [/node_modules\/(maplibre-gl|@mapbox|earcut|kdbush|potpack|quickselect|tinyqueue|supercluster|pbf|gl-matrix|murmurhash-js)\//, 'maplibre'],
  [/node_modules\/(world-atlas|us-atlas\/states|topojson-client)/, 'geo'],
  [/node_modules\/(@tiptap|prosemirror-|orderedmap|rope-sequence|w3c-keyname|linkifyjs|marked|turndown)/, 'editor'],
  [/node_modules\/(react|react-dom|react-router|react-router-dom|@remix-run|scheduler)\//, 'react'],
];

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          for (const [re, name] of VENDOR) if (re.test(id)) return name;
          return undefined;
        },
      },
    },
  },
});
