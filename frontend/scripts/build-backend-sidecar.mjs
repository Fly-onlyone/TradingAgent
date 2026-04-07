import {spawnSync} from "node:child_process";
import {appendFileSync, copyFileSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import process from "node:process";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const frontendRoot = resolve(__dirname, "..");
const projectRoot = resolve(frontendRoot, "..");
const backendRoot = resolve(projectRoot, "backend");
const srcTauriRoot = resolve(frontendRoot, "src-tauri");
const buildRoot = resolve(srcTauriRoot, "backend-build");
const specDir = resolve(buildRoot, "spec");
const workDir = resolve(buildRoot, "work");
const backendEntry = resolve(backendRoot, "desktop_entry.py");
const envExample = resolve(projectRoot, "backend", ".env.example");
const pyInstallerExe = resolve(projectRoot, ".venv", "Scripts", "pyinstaller.exe");
const runtimeExe = resolve(srcTauriRoot, "trading-agent-backend.exe");
const envBundleDest = resolve(srcTauriRoot, ".env");
const pyInstallerDataSeparator = process.platform === "win32" ? ";" : ":";

function isEnabled(name) {
    return process.env[name] === "1";
}

const cliArgs = process.argv.slice(2);
const shouldClean = isEnabled("BUILD_BACKEND_SIDECAR_CLEAN") || cliArgs.includes("--clean");
const shouldForce = isEnabled("BUILD_BACKEND_SIDECAR_FORCE") || cliArgs.includes("--force");
const shouldSync = isEnabled("BUILD_BACKEND_SIDECAR_FORCE_SYNC") || !existsSync(pyInstallerExe);
const buildLog = resolve(buildRoot, "build.log");

function log(message) {
    const line = `[${new Date().toISOString()}] ${message}`;
    console.log(line);
    appendFileSync(buildLog, line + "\n");
}

function run(command, args, cwd) {
    log(`> ${command} ${args.join(" ")}`);
    const result = spawnSync(command, args, {
        cwd,
        env: process.env,
        stdio: "inherit",
    });

    if (result.status !== 0) {
        log(`Command failed with exit code ${result.status}`);
        process.exit(result.status ?? 1);
    }
}

function latestModifiedTime(path) {
    const stat = statSync(path);
    const modifiedAt = stat.mtime.getTime();

    if (!stat.isDirectory()) {
        return modifiedAt;
    }

    return readdirSync(path).reduce((latest, entry) => {
        return Math.max(latest, latestModifiedTime(resolve(path, entry)));
    }, modifiedAt);
}

function isRuntimeCurrent() {
    if (!existsSync(runtimeExe)) {
        return false;
    }

    const runtimeModified = statSync(runtimeExe).mtime.getTime();
    const inputs = [
        resolve(projectRoot, "pyproject.toml"),
        resolve(projectRoot, "uv.lock"),
        envExample,
        backendEntry,
        resolve(backendRoot, "app"),
        resolve(projectRoot, "run.py"),
    ];

    return inputs.every((path) => latestModifiedTime(path) <= runtimeModified);
}

if (process.platform !== "win32") {
    console.log("Skipping backend sidecar build (Windows only).");
    process.exit(0);
}

// Initialize log file early so all paths (including skip) are logged
mkdirSync(buildRoot, {recursive: true});
writeFileSync(buildLog, `=== Backend sidecar build ${new Date().toISOString()} ===\n`);
log(`clean=${shouldClean} force=${shouldForce} forceSync=${shouldSync}`);

if (!shouldClean && !shouldForce && !shouldSync && isRuntimeCurrent()) {
    log("Sidecar is up-to-date — skipping rebuild");
    copyFileSync(envExample, envBundleDest);
    process.exit(0);
}

if (shouldClean) {
    log("Cleaning previous build...");
    rmSync(runtimeExe, {force: true});
    rmSync(envBundleDest, {force: true});
    // Preserve log file during clean — only remove work/spec dirs
    rmSync(specDir, {recursive: true, force: true});
    rmSync(workDir, {recursive: true, force: true});
}
mkdirSync(specDir, {recursive: true});
mkdirSync(workDir, {recursive: true});

if (shouldSync) {
    run("uv", ["sync", "--group", "dev"], projectRoot);
}

const pyinstallerArgs = [
    "--noconfirm",
    "--onefile",
    "--noconsole",
    "--noupx",
    "--name",
    "trading-agent-backend",
    "--distpath",
    srcTauriRoot,
    "--workpath",
    workDir,
    "--specpath",
    specDir,
    "--paths",
    backendRoot,
    "--paths",
    projectRoot,
    "--add-data",
    `${envExample}${pyInstallerDataSeparator}.`,
    "--collect-submodules",
    "app",
    "--collect-all",
    "claude_agent_sdk",
    "--collect-all",
    "sentence_transformers",
    "--collect-all",
    "transformers",
    "--collect-all",
    "tokenizers",
    "--collect-all",
    "safetensors",
    "--collect-submodules",
    "torch",
    "--exclude-module",
    "torch.distributed",
    "--collect-all",
    "fitz",
    "--collect-all",
    "apprise",
    "--collect-submodules",
    "okx",
    "--collect-submodules",
    "uvicorn",
    "--collect-submodules",
    "websockets",
    "--copy-metadata",
    "anthropic",
    "--copy-metadata",
    "apprise",
    "--copy-metadata",
    "claude_agent_sdk",
    "--copy-metadata",
    "python_okx",
    "--copy-metadata",
    "PyYAML",
    "--copy-metadata",
    "sentence_transformers",
    "--copy-metadata",
    "transformers",
    "--copy-metadata",
    "uvicorn",
    "--copy-metadata",
    "websockets",
    backendEntry,
];

if (shouldClean) {
    pyinstallerArgs.splice(1, 0, "--clean");
}

const buildStart = Date.now();
log("Running PyInstaller...");
run(pyInstallerExe, pyinstallerArgs, projectRoot);

if (!existsSync(runtimeExe)) {
    log("ERROR: PyInstaller did not produce trading-agent-backend.exe");
    process.exit(1);
}

const elapsed = ((Date.now() - buildStart) / 1000).toFixed(1);
log(`PyInstaller finished in ${elapsed}s — output: ${runtimeExe}`);

copyFileSync(envExample, envBundleDest);
log(`Build log saved to ${buildLog}`);
