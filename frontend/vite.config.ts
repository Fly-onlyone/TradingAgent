import type { Duplex } from "node:stream";
import { fileURLToPath, URL } from "node:url";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// Service workers conflict with Tauri's custom protocol — skip PWA in Tauri builds
const isTauriBuild = Boolean(process.env.TAURI_ENV_PLATFORM);

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
		name: "suppress-ws-proxy-errors",
		configureServer(server) {
			server.httpServer?.on("upgrade", (_req, socket: Duplex) => {
				const origEmit = socket.emit;
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				socket.emit = function (
					this: Duplex,
					event: string,
					...args: unknown[]
				) {
					if (event === "error") {
						const err = args[0];
						if (
							err instanceof Error &&
							(err as NodeJS.ErrnoException).code === "ECONNRESET"
						) {
							return true as any;
						}
					}
					return origEmit.apply(this, [event, ...args] as Parameters<
						typeof origEmit
					>);
				} as typeof origEmit;
			});
		},
	};
}

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [
		tailwindcss(),
		suppressWsProxyErrors(),
		tanstackRouter({
			target: "react",
			autoCodeSplitting: true,
		}),
		...(!isTauriBuild
			? [
					VitePWA({
						registerType: "autoUpdate",
						injectRegister: "auto",
						includeAssets: ["coin.png"],
						manifest: {
							name: "Trading Agent",
							short_name: "Trading Agent",
							description: "AI-powered cryptocurrency trading dashboard",
							theme_color: "#000000",
							background_color: "#ffffff",
							display: "standalone",
							icons: [
								{
									src: "coin.png",
									type: "image/png",
									sizes: "512x512",
								},
							],
						},
						workbox: {
							globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
							runtimeCaching: [
								{
									urlPattern: /\/api\/.*/i,
									handler: "NetworkFirst",
									options: {
										cacheName: "api-cache",
										networkTimeoutSeconds: 2,
										cacheableResponse: {
											statuses: [0, 200],
										},
										expiration: {
											maxEntries: 80,
											maxAgeSeconds: 60 * 60,
										},
									},
								},
								{
									urlPattern: /\.(?:js|css)$/i,
									handler: "StaleWhileRevalidate",
									options: {
										cacheName: "static-resources",
										cacheableResponse: {
											statuses: [0, 200],
										},
										expiration: {
											maxEntries: 120,
											maxAgeSeconds: 24 * 60 * 60,
										},
									},
								},
							],
						},
						devOptions: {
							enabled: false,
						},
					}),
				]
			: []),
		viteReact(),

		// Sentry source map upload — only during builds with auth token
		...(process.env.SENTRY_AUTH_TOKEN
			? [
					sentryVitePlugin({
						org: "fly-theonlyone",
						project: "trading-agent-frontend",
						authToken: process.env.SENTRY_AUTH_TOKEN,
						sourcemaps: {
							filesToDeleteAfterUpload: ["./dist/**/*.map"],
						},
					}),
				]
			: []),
	],
	build: {
		sourcemap: "hidden",
		rollupOptions: {
			output: {
				manualChunks: (id: string) => {
					if (id.includes("@radix-ui/") || id.includes("@base-ui/"))
						return "vendor-radix";
					if (id.includes("framer-motion")) return "vendor-motion";
					if (id.includes("@tanstack/")) return "vendor-tanstack";
					if (id.includes("@sentry/")) return "vendor-sentry";
				},
			},
		},
	},
	resolve: {
		alias: {
			"@": fileURLToPath(new URL("./src", import.meta.url)),
		},
	},
	server: {
		proxy: {
			"/api": {
				target: "http://localhost:7000",
				changeOrigin: true,
			},
			"/ws": {
				target: "http://localhost:7000",
				ws: true,
				changeOrigin: true,
			},
		},
	},
});
