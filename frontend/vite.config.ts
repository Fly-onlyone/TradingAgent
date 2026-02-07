import { defineConfig, type Plugin } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import viteReact from '@vitejs/plugin-react'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath, URL } from 'node:url'
import type { Duplex } from 'node:stream'

/**
 * Suppress ECONNRESET errors on WebSocket proxy sockets.
 *
 * Vite attaches its own socket error handler during HTTP upgrade,
 * which logs "[vite] ws proxy socket error" for every ECONNRESET.
 * These are normal — browsers reset the TCP connection when navigating
 * away or closing tabs. This plugin patches socket.emit on upgrade
 * to swallow ECONNRESET before it reaches any handler.
 */
function suppressWsProxyErrors(): Plugin {
  return {
    name: 'suppress-ws-proxy-errors',
    configureServer(server) {
      server.httpServer?.on('upgrade', (_req, socket: Duplex) => {
        const origEmit = socket.emit
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        socket.emit = function (this: Duplex, event: string, ...args: unknown[]) {
          if (event === 'error') {
            const err = args[0]
            if (
              err instanceof Error &&
              (err as NodeJS.ErrnoException).code === 'ECONNRESET'
            ) {
              return true as any
            }
          }
          return origEmit.apply(this, [event, ...args] as Parameters<typeof origEmit>)
        } as typeof origEmit
      })
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    suppressWsProxyErrors(),
    devtools(),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:7000',
        changeOrigin: true,
      },
      '/ws': {
        target: 'http://localhost:7000',
        ws: true,
        changeOrigin: true,
      },
    },
  },
})
