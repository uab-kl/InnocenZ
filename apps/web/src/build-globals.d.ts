/**
 * Build-time constants injected by `define` in vite.config.ts.
 *
 * They are REPLACED at build time, not resolved at runtime — so if the define
 * is ever removed, referencing one throws ReferenceError the moment the module
 * is evaluated, rather than rendering "undefined". That is exactly what used to
 * happen here: build-info.ts read both of these with no define behind either,
 * and only escaped notice because BuildVersionBadge has no renderer and the
 * whole module was tree-shaken out of the bundle.
 */
declare const __IZ_APP_VERSION__: string;
declare const __IZ_APP_GIT_SHA__: string;
