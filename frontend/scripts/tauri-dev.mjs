import {spawn} from "node:child_process";
import {existsSync} from "node:fs";
import {dirname, resolve} from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendRoot = resolve(__dirname, "..");
const projectRoot = resolve(frontendRoot, "..");
const backendHealthUrl = "http://127.0.0.1:7000/health";
const backendStartupTimeoutMs = 90_000;
const backendPollIntervalMs = 500;

/** @type {import("node:child_process").ChildProcess | null} */
let backendProcess = null;
/** @type {import("node:child_process").ChildProcess | null} */
let frontendProcess = null;
let shuttingDown = false;

function killProcessTree(childProcess) {
    if (!childProcess || childProcess.exitCode !== null) {
        return;
    }

    if (process.platform === "win32") {
        spawn("taskkill", ["/PID", String(childProcess.pid), "/T", "/F"], {
            stdio: "ignore",
        });
        return;
    }

    childProcess.kill("SIGTERM");
}

async function shutdown(exitCode = 0) {
    if (shuttingDown) {
        return;
    }
    shuttingDown = true;

    killProcessTree(frontendProcess);
    killProcessTree(backendProcess);

    setTimeout(() => {
        process.exit(exitCode);
    }, 250);
}

function registerProcessHandlers() {
    for (const signal of ["SIGINT", "SIGTERM", "SIGHUP"]) {
        process.on(signal, () => {
            void shutdown(0);
        });
    }

    process.on("exit", () => {
        killProcessTree(frontendProcess);
        killProcessTree(backendProcess);
    });
}

function getBackendCommand() {
    const venvPython = process.platform === "win32"
        ? resolve(projectRoot, ".venv", "Scripts", "python.exe")
        : resolve(projectRoot, ".venv", "bin", "python");

    if (existsSync(venvPython)) {
        return {
            command: venvPython,
            args: ["run.py", "--serve"],
        };
    }

    return {
        command: "uv",
        args: ["run", "python", "run.py", "--serve"],
    };
}

function isHealthyResponse(responseText) {
    try {
        const parsed = JSON.parse(responseText);
        return parsed?.status === "healthy";
    } catch {
        return false;
    }
}

async function waitForBackendReady() {
    const deadline = Date.now() + backendStartupTimeoutMs;

    while (Date.now() < deadline) {
        if (backendProcess && backendProcess.exitCode !== null) {
            throw new Error(`Backend exited early with code ${backendProcess.exitCode}`);
        }

        try {
            const response = await fetch(backendHealthUrl);
            if (response.ok && isHealthyResponse(await response.text())) {
                return;
            }
        } catch {
            // Keep polling until the backend is ready or times out.
        }

        await new Promise((resolveDelay) =>
            setTimeout(resolveDelay, backendPollIntervalMs),
        );
    }

    throw new Error(
        `Backend did not become ready within ${backendStartupTimeoutMs / 1000} seconds`,
    );
}

function spawnBackend() {
    const {command, args} = getBackendCommand();
    console.log(`[tauri-dev] starting backend: ${command} ${args.join(" ")}`);
    backendProcess = spawn(command, args, {
        cwd: projectRoot,
        stdio: "inherit",
    });

    backendProcess.on("exit", (code, signal) => {
        if (!shuttingDown) {
            console.error(
                `[tauri-dev] backend exited unexpectedly (code=${code}, signal=${signal ?? "none"})`,
            );
            void shutdown(code ?? 1);
        }
    });
}

function spawnFrontend() {
    console.log("[tauri-dev] backend ready, starting Vite dev server");
    frontendProcess = spawn("bun", ["run", "dev"], {
        cwd: frontendRoot,
        stdio: "inherit",
    });

    frontendProcess.on("exit", (code, signal) => {
        if (!shuttingDown) {
            console.error(
                `[tauri-dev] frontend exited unexpectedly (code=${code}, signal=${signal ?? "none"})`,
            );
            void shutdown(code ?? 1);
        }
    });
}

async function main() {
    registerProcessHandlers();
    spawnBackend();
    await waitForBackendReady();
    spawnFrontend();
}

main().catch((error) => {
    console.error("[tauri-dev] startup failed");
    console.error(error);
    void shutdown(1);
});
