import { tmpdir } from "node:os";
import path from "node:path";
import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:5421";
export default defineConfig({
	testDir: "e2e",
	testMatch: /calendar-creation\.spec\.ts/,
	fullyParallel: false,
	workers: 1,
	retries: 0,
	timeout: 45_000,
	reporter: "list",
	outputDir: path.join(tmpdir(), "ryu-calendar-creation-results"),
	use: {
		baseURL,
		timezoneId: "UTC",
		locale: "en-US",
		viewport: { width: 1440, height: 1000 },
		trace: "retain-on-failure",
	},
	webServer: {
		command:
			"bunx vite --config vite.config.ts --host 127.0.0.1 --port 5421 --strictPort",
		cwd: import.meta.dirname,
		url: baseURL,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
