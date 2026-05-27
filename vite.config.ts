// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { nitro } from "nitro/vite";

// The v0 sandbox proxy forwards external traffic to localhost:5173, so the dev
// server MUST listen on 5173 in this environment. We only override when not
// running inside the Lovable sandbox (which forces port 8080).
const isLovableSandbox =
	process.env.LOVABLE_SANDBOX === "1" ||
	!!process.env.DEV_SERVER__PROJECT_PATH;

export default defineConfig({
	cloudflare: false,
	plugins: [nitro({ preset: process.env.VERCEL ? "vercel" : undefined })],
	vite: {
		build: {
			chunkSizeWarningLimit: 1000,
		},
		...(isLovableSandbox
			? {}
			: {
					server: {
						host: "0.0.0.0",
						port: 5173,
						strictPort: true,
					},
				}),
	},
});
