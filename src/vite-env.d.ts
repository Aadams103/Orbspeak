/// <reference types="vite/client" />
/// <reference types="vite-plugin-svgr/client" />

interface ImportMetaEnv {
	readonly TENANT_ID?: string;
	readonly VITE_BUILD_VERSION?: string;
	readonly VITE_APP_VERSION?: string;
	// add more env vars as needed
}

interface ImportMeta {
	readonly env: ImportMetaEnv;
}
