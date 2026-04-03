import {invoke} from "@tauri-apps/api/core";
import {listen} from "@tauri-apps/api/event";
import {useCallback, useEffect, useRef, useState} from "react";
import type {
    BuildCompleteEvent,
    BuildOptions,
    BuildOutputEvent,
    BuildProgressEvent,
    BuildStatus,
    LogEntry,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function classifyLine(line: string, stream: string): LogEntry["type"] {
    const lower = line.toLowerCase();
    if (
        lower.includes("error") ||
        lower.includes("failed") ||
        lower.startsWith("error")
    ) {
        return "error";
    }
    if (lower.includes("warning") || lower.includes("warn")) {
        return "warning";
    }
    if (
        lower.includes("finished") ||
        lower.includes("success") ||
        lower.includes("completed") ||
        lower.startsWith("done")
    ) {
        return "success";
    }
    if (stream === "stderr") {
        // Cargo writes normal compilation info to stderr; don't mark all as error
        if (lower.includes("compiling") || lower.includes("downloading")) {
            return "info";
        }
    }
    return "info";
}

function formatElapsed(secs: number): string {
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

let logIdCounter = 0;

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
    // Version
    const [version, setVersion] = useState("");
    const [versionInput, setVersionInput] = useState("");
    const [versionStatus, setVersionStatus] = useState<{
        ok: boolean;
        msg: string;
    } | null>(null);
    const [syncing, setSyncing] = useState(false);

    // Build options
    const [options, setOptions] = useState<BuildOptions>({
        release: true,
        wixInstaller: true,
        stripSymbols: true,
        forceSidecar: false,
        autoRunInstaller: false,
    });

    // Build state
    const [status, setStatus] = useState<BuildStatus>("idle");
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [progress, setProgress] = useState<BuildProgressEvent | null>(null);
    const [elapsed, setElapsed] = useState(0);

    const logEndRef = useRef<HTMLDivElement>(null);
    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const optionsRef = useRef(options);
    optionsRef.current = options;

    // -----------------------------------------------------------------------
    // Load version on mount
    // -----------------------------------------------------------------------

    useEffect(() => {
        invoke<string>("read_version")
            .then((v) => {
                setVersion(v);
                setVersionInput(v);
            })
            .catch((e) => {
                setVersionStatus({ok: false, msg: String(e)});
            });
    }, []);

    // -----------------------------------------------------------------------
    // Event listeners
    // -----------------------------------------------------------------------

    useEffect(() => {
        const unlistenOutput = listen<BuildOutputEvent>("build-output", (e) => {
            const entry: LogEntry = {
                id: ++logIdCounter,
                line: e.payload.line,
                stream: e.payload.stream,
                timestamp: Date.now(),
                type: classifyLine(e.payload.line, e.payload.stream),
            };
            setLogs((prev) => [...prev, entry]);
        });

        const unlistenProgress = listen<BuildProgressEvent>(
            "build-progress",
            (e) => {
                setProgress(e.payload);
            },
        );

        const unlistenComplete = listen<BuildCompleteEvent>(
            "build-complete",
            (e) => {
                const {success, message, elapsedSecs} = e.payload;
                setStatus(success ? "success" : "error");
                setElapsed(elapsedSecs);

                // Stop timer
                if (timerRef.current) {
                    clearInterval(timerRef.current);
                    timerRef.current = null;
                }

                // Add final log entry
                const entry: LogEntry = {
                    id: ++logIdCounter,
                    line: `\n${success ? "[OK]" : "[FAIL]"} ${message} (${formatElapsed(elapsedSecs)})`,
                    stream: success ? "stdout" : "stderr",
                    timestamp: Date.now(),
                    type: success ? "success" : "error",
                };
                setLogs((prev) => [...prev, entry]);

                // Auto-run installer on successful build
                if (success && optionsRef.current.autoRunInstaller) {
                    invoke<string>("run_installer")
                        .then((path) => {
                            setLogs((prev) => [
                                ...prev,
                                {
                                    id: ++logIdCounter,
                                    line: `Launching installer: ${path}`,
                                    stream: "stdout",
                                    timestamp: Date.now(),
                                    type: "success",
                                },
                            ]);
                        })
                        .catch((err) => {
                            setLogs((prev) => [
                                ...prev,
                                {
                                    id: ++logIdCounter,
                                    line: `Auto-run installer failed: ${String(err)}`,
                                    stream: "stderr",
                                    timestamp: Date.now(),
                                    type: "error",
                                },
                            ]);
                        });
                }
            },
        );

        return () => {
            unlistenOutput.then((fn) => fn());
            unlistenProgress.then((fn) => fn());
            unlistenComplete.then((fn) => fn());
        };
    }, []);

    // -----------------------------------------------------------------------
    // Auto-scroll log
    // -----------------------------------------------------------------------

    useEffect(() => {
        logEndRef.current?.scrollIntoView({behavior: "smooth"});
    }, [logs]);

    // -----------------------------------------------------------------------
    // Actions
    // -----------------------------------------------------------------------

    const handleBumpVersion = useCallback(
        (part: "patch" | "minor" | "major") => {
            const match = versionInput.match(/^(\d+)\.(\d+)\.(\d+)/);
            if (!match) return;
            let [, major, minor, patch] = match.map(Number);
            if (part === "major") {
                major++;
                minor = 0;
                patch = 0;
            } else if (part === "minor") {
                minor++;
                patch = 0;
            } else {
                patch++;
            }
            setVersionInput(`${major}.${minor}.${patch}`);
            setVersionStatus(null);
        },
        [versionInput],
    );

    const handleSyncVersions = useCallback(async () => {
        setSyncing(true);
        setVersionStatus(null);
        try {
            await invoke("sync_versions", {version: versionInput});
            setVersion(versionInput);
            setVersionStatus({ok: true, msg: "Synced!"});
        } catch (e) {
            setVersionStatus({ok: false, msg: String(e)});
        } finally {
            setSyncing(false);
        }
    }, [versionInput]);

    const handleStartBuild = useCallback(async () => {
        setStatus("building");
        setLogs([]);
        setProgress(null);
        setElapsed(0);
        logIdCounter = 0;

        // Start elapsed timer
        const startTime = Date.now();
        timerRef.current = setInterval(() => {
            setElapsed((Date.now() - startTime) / 1000);
        }, 200);

        try {
            await invoke("start_build", {options});
        } catch (e) {
            setStatus("error");
            if (timerRef.current) {
                clearInterval(timerRef.current);
                timerRef.current = null;
            }
            const entry: LogEntry = {
                id: ++logIdCounter,
                line: `Failed to start build: ${String(e)}`,
                stream: "stderr",
                timestamp: Date.now(),
                type: "error",
            };
            setLogs((prev) => [...prev, entry]);
        }
    }, [options]);

    const handleCancelBuild = useCallback(async () => {
        try {
            await invoke("cancel_build");
            setStatus("cancelled");
        } catch (e) {
            console.error("Cancel failed:", e);
        }
        if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    const handleClearLogs = useCallback(() => {
        setLogs([]);
    }, []);

    const isBuilding = status === "building";

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------

    return (
        <div className="app">
            {/* Header */}
            <div className="app-header">
                <span className="icon">&#x2692;</span>
                <h1>Trading agent Build Tool</h1>
            </div>

            {/* Version Sync */}
            <div className="section">
                <div className="section-title">Version</div>
                <div className="version-row">
                    <input
                        className="version-input"
                        type="text"
                        value={versionInput}
                        onChange={(e) => {
                            setVersionInput(e.target.value);
                            setVersionStatus(null);
                        }}
                        placeholder="0.0.0"
                        disabled={isBuilding}
                    />
                    <div className="bump-group">
                        <button
                            className="btn btn-bump"
                            onClick={() => handleBumpVersion("patch")}
                            disabled={isBuilding}
                            title="Bump patch (0.0.X)"
                        >
                            Patch &#x2191;
                        </button>
                        <button
                            className="btn btn-bump"
                            onClick={() => handleBumpVersion("minor")}
                            disabled={isBuilding}
                            title="Bump minor (0.X.0)"
                        >
                            Minor &#x2191;
                        </button>
                        <button
                            className="btn btn-bump"
                            onClick={() => handleBumpVersion("major")}
                            disabled={isBuilding}
                            title="Bump major (X.0.0)"
                        >
                            Major &#x2191;
                        </button>
                    </div>
                    <button
                        className="btn"
                        onClick={handleSyncVersions}
                        disabled={
                            isBuilding ||
                            syncing ||
                            !versionInput.trim() ||
                            versionInput === version
                        }
                    >
                        {syncing ? <span className="spinner"/> : null}
                        Sync All Versions
                    </button>
                    {versionStatus && (
                        <span
                            className={`version-status ${versionStatus.ok ? "ok" : "err"}`}
                        >
							{versionStatus.msg}
						</span>
                    )}
                </div>
            </div>

            {/* Build Options */}
            <div className="section">
                <div className="section-title">Build Options</div>
                <div className="options-grid">
                    <label className="option-item">
                        <input
                            type="checkbox"
                            checked={options.release}
                            onChange={(e) =>
                                setOptions((o) => ({...o, release: e.target.checked}))
                            }
                            disabled={isBuilding}
                        />
                        <span className="option-label">Release build</span>
                    </label>
                    <label className="option-item">
                        <input
                            type="checkbox"
                            checked={!options.release}
                            onChange={(e) =>
                                setOptions((o) => ({...o, release: !e.target.checked}))
                            }
                            disabled={isBuilding}
                        />
                        <span className="option-label">Debug build</span>
                    </label>
                    <label className="option-item">
                        <input
                            type="checkbox"
                            checked={options.wixInstaller}
                            onChange={(e) =>
                                setOptions((o) => ({...o, wixInstaller: e.target.checked}))
                            }
                            disabled={isBuilding}
                        />
                        <span className="option-label">WiX installer</span>
                    </label>
                    <label className="option-item">
                        <input
                            type="checkbox"
                            checked={!options.wixInstaller}
                            onChange={(e) =>
                                setOptions((o) => ({...o, wixInstaller: !e.target.checked}))
                            }
                            disabled={isBuilding}
                        />
                        <span className="option-label">Skip installer</span>
                    </label>
                    <label className="option-item">
                        <input
                            type="checkbox"
                            checked={options.stripSymbols}
                            onChange={(e) =>
                                setOptions((o) => ({...o, stripSymbols: e.target.checked}))
                            }
                            disabled={isBuilding}
                        />
                        <span className="option-label">Strip symbols</span>
                    </label>
                    <label className="option-item">
                        <input
                            type="checkbox"
                            checked={!options.stripSymbols}
                            onChange={(e) =>
                                setOptions((o) => ({...o, stripSymbols: !e.target.checked}))
                            }
                            disabled={isBuilding}
                        />
                        <span className="option-label">Keep debug info</span>
                    </label>
                    <label className="option-item">
                        <input
                            type="checkbox"
                            checked={options.forceSidecar}
                            onChange={(e) =>
                                setOptions((o) => ({...o, forceSidecar: e.target.checked}))
                            }
                            disabled={isBuilding}
                        />
                        <span className="option-label">Force sidecar rebuild</span>
                    </label>
                    <label className="option-item">
                        <input
                            type="checkbox"
                            checked={options.autoRunInstaller}
                            onChange={(e) =>
                                setOptions((o) => ({...o, autoRunInstaller: e.target.checked}))
                            }
                            disabled={isBuilding}
                        />
                        <span className="option-label">Auto-run installer after build</span>
                    </label>
                </div>
            </div>

            {/* Build Actions + Progress */}
            <div className="section">
                <div className="build-actions">
                    {!isBuilding ? (
                        <button
                            className="btn btn-primary btn-build"
                            onClick={handleStartBuild}
                        >
                            &#x25B6; Start Build
                        </button>
                    ) : (
                        <button
                            className="btn btn-danger btn-build"
                            onClick={handleCancelBuild}
                        >
                            &#x25A0; Cancel Build
                        </button>
                    )}
                    {(isBuilding || status === "success" || status === "error") && (
                        <span className="build-elapsed">{formatElapsed(elapsed)}</span>
                    )}
                </div>

                {/* Progress bar */}
                {(isBuilding || status === "success" || status === "error") && (
                    <div className="progress-section" style={{marginTop: 12}}>
                        <div className="progress-bar-track">
                            <div
                                className={`progress-bar-fill ${status === "success" ? "success" : status === "error" ? "error" : ""}`}
                                style={{width: `${progress?.percent ?? 0}%`}}
                            />
                        </div>
                        <div className="progress-info">
							<span className="progress-label">
								{progress
                                    ? `Step ${progress.step}/${progress.totalSteps}: ${progress.label}`
                                    : isBuilding
                                        ? "Initializing..."
                                        : status === "success"
                                            ? "Build complete!"
                                            : "Build failed"}
							</span>
                            <span
                                className={`progress-percent ${status === "success" ? "success" : status === "error" ? "error" : ""}`}
                            >
								{progress?.percent ?? 0}%
							</span>
                        </div>
                    </div>
                )}
            </div>

            {/* Build Log */}
            <div className="section log-panel">
                <div className="log-header">
					<span className="section-title" style={{margin: 0}}>
						Build Log
					</span>
                    <button
                        className="btn"
                        onClick={handleClearLogs}
                        disabled={isBuilding}
                        style={{padding: "4px 10px", fontSize: 12}}
                    >
                        Clear
                    </button>
                </div>
                <div className="log-scroll">
                    {logs.length === 0 ? (
                        <div className="log-empty">
                            No build output yet. Click "Start Build" to begin.
                        </div>
                    ) : (
                        logs.map((entry) => (
                            <div key={entry.id} className={`log-line ${entry.type}`}>
                                {entry.line}
                            </div>
                        ))
                    )}
                    <div ref={logEndRef}/>
                </div>
            </div>
        </div>
    );
}
