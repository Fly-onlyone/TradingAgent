export interface BuildOptions {
    release: boolean;
    wixInstaller: boolean;
    stripSymbols: boolean;
    forceSidecar: boolean;
    autoRunInstaller: boolean;
}

export interface BuildOutputEvent {
    line: string;
    stream: "stdout" | "stderr";
}

export interface BuildProgressEvent {
    step: number;
    totalSteps: number;
    label: string;
    percent: number;
    elapsedSecs: number;
}

export interface BuildCompleteEvent {
    success: boolean;
    message: string;
    elapsedSecs: number;
}

export type BuildStatus = "idle" | "building" | "success" | "error" | "cancelled";

export interface LogEntry {
    id: number;
    line: string;
    stream: "stdout" | "stderr";
    timestamp: number;
    type: "info" | "success" | "error" | "warning";
}
