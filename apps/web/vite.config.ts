import { paraglideVitePlugin } from "@inlang/paraglide-js";
import babel from "@rolldown/plugin-babel";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact, { reactCompilerPreset } from "@vitejs/plugin-react";
import { nitro } from "nitro/vite";
import { defineConfig } from "vite";
import { execSync } from "node:child_process";
import pkg from "../../package.json" with { type: "json" };

// Opt-in: `VITE_TANSTACK_DEVTOOLS=1 pnpm dev:web` — slows SSR when Metro co-runs.
const enableDevtools = process.env.VITE_TANSTACK_DEVTOOLS === "1";
// Set by `tools/scripts/dev-all.mjs` when Vite co-runs with Metro.
const coRunWithMetro = process.env.INNOCENZ_DEV_ALL === "1";

/**
 * Vite derives `isProduction` from `process.env.NODE_ENV`, NOT from `mode`, and
 * on this path it resolves `mode: "production"` while NODE_ENV is still
 * "development" — so every `vite build` was silently a DEVELOPMENT build.
 *
 * Not cosmetic: the JSX transform emitted `jsxDEV()` while React's CJS wrapper
 * folded to jsx-dev-runtime.production.js, where `exports.jsxDEV = void 0`. Every
 * server-rendered route died on "jsxDEV is not a function", and the client
 * shipped React's development build.
 *
 * `enforce: "pre"` is LOAD-BEARING. nitro() builds the `client` and `ssr`
 * environments inside its own config() hook and freezes NODE_ENV into their
 * `define` right then. Fixing NODE_ENV after nitro() runs corrects only the
 * `nitro` environment — client and ssr keep define["process.env.NODE_ENV"] ===
 * "development". This must win the race, so it runs in the pre phase.
 *
 * Gated on `mode` so `vite build --mode development` still builds for dev.
 */
const forceProductionNodeEnv = {
	name: "innocenz:force-production-node-env",
	enforce: "pre" as const,
	config(_userConfig: unknown, env: { command: string; mode: string }) {
		if (env.command === "build" && env.mode === "production") {
			process.env.NODE_ENV = "production";
		}
	},
};

/**
 * Short commit for the build badge. Must never break the build: Docker images
 * are built from a copied context with no .git, and CI checkouts can be
 * shallow — so an env var wins if set, and anything else degrades to "unknown".
 */
function appGitSha(): string {
	const fromEnv = process.env.IZ_APP_GIT_SHA?.trim();
	if (fromEnv) return fromEnv;
	try {
		return execSync("git rev-parse --short HEAD", {
			stdio: ["ignore", "pipe", "ignore"],
		})
			.toString()
			.trim();
	} catch {
		return "unknown";
	}
}

const config = defineConfig({
	// Consumed by src/agency-portal/lib/build-info.ts — see src/build-globals.d.ts.
	define: {
		__IZ_APP_VERSION__: JSON.stringify(pkg.version),
		__IZ_APP_GIT_SHA__: JSON.stringify(appGitSha()),
	},
	resolve: {
		tsconfigPaths: true,
		// TanStack Start also dedupes these; keep here so client + SSR share one copy
		// without absolute aliases (aliasing to node_modules/react makes Vite's SSR
		// runner execute CJS index.js as ESM → "module is not defined").
		dedupe: ["react", "react-dom"],
	},
	// country-state-city ships multi‑MB city JSON; pre-bundling it often hits Vite's
	// 120s optimizer timeout (worse under `pnpm dev:all` with Metro on Windows).
	optimizeDeps: {
		exclude: ["country-state-city"],
	},
	server: {
		// Proxy only backend-owned /img paths so Vite can still serve marketing
		// assets from apps/web/public/img (landing, UAB badge, etc.).
		// Profile/gallery images stay same-origin to avoid CORP blocks.
		proxy: {
			"^/img/(users|pr|outlets|agencies)(/|$)": {
				target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:7777",
				changeOrigin: true,
			},
			"/img/blank-profile-picture.png": {
				target: process.env.VITE_API_PROXY_TARGET ?? "http://localhost:7777",
				changeOrigin: true,
			},
		},
		...(coRunWithMetro
			? {
					watch: {
						// Don't compete with Metro for these trees on Windows.
						ignored: [
							"**/apps/mobile/**",
							"**/apps/backend/**",
							"**/postgres/**",
							"**/.git/**",
							"**/android/**",
							"**/ios/**",
						],
					},
				}
			: {}),
	},
	plugins: [
		forceProductionNodeEnv,
		...(enableDevtools ? [devtools()] : []),
		paraglideVitePlugin({
			project: "./project.inlang",
			outdir: "./src/paraglide",
			strategy: ["url", "baseLocale"],
			urlPatterns: [
				{
					pattern: ":protocol://:domain(.*)::port?/:path(.*)?",
					localized: [
						["en", ":protocol://:domain(.*)::port?/en/:path(.*)?"],
						["cn", ":protocol://:domain(.*)::port?/cn/:path(.*)?"],
					],
				},
			],
		}),
		// `inlineDynamicImports` works around a NITRO chunking bug, and without it the
		// built server does not boot at all. Vite's own SSR output is correct — it
		// imports rolldown's `__exportAll` helper from its runtime chunk. Nitro then
		// re-bundles, splits that one chunk into two that import EACH OTHER, and leaves
		// the helper on the far side of the cycle: it is a hoisted `var`, so it reads as
		// `undefined` before its defining module body runs and every route 500s with
		// "__exportAll is not a function". Emitting a single chunk removes the cycle.
		// Cost: one ~20 MB server file, ~680 ms cold start (91 ms warm) — measured.
		// REMOVE THIS once nitro stops splitting that chunk, and re-run the boot check
		// in TEST_SCRIPT.md §8 rather than trusting a green `nx build`.
		nitro({ inlineDynamicImports: true, rollupConfig: { external: [/^@sentry\//] } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
		babel({ presets: [reactCompilerPreset()] }),
	],
});

export default config;
