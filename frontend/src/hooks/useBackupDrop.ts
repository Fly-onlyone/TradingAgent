/**
 * Bridge Tauri webview drag-drop events and HTML5 drop events so a single
 * drop zone accepts both. Returns drag state + handlers to spread onto the
 * zone. Tauri intercepts native file drops for the whole webview, so in
 * desktop mode we subscribe globally; in browser mode we rely on HTML5
 * dataTransfer.
 */

import { useCallback, useEffect, useState } from "react";
import { isTauri } from "@/utils/tauriEnv";

type OnFile = (file: File) => void;

export interface BackupDropHandlers {
	onDragOver: (e: React.DragEvent) => void;
	onDragLeave: (e: React.DragEvent) => void;
	onDrop: (e: React.DragEvent) => void;
}

export interface UseBackupDropResult {
	isDragging: boolean;
	dndHandlers: BackupDropHandlers;
}

function isJsonFilename(name: string): boolean {
	return name.toLowerCase().endsWith(".json");
}

function basename(p: string): string {
	return p.split(/[\\/]/).pop() ?? "backup.json";
}

export function useBackupDrop(onFile: OnFile): UseBackupDropResult {
	const [isDragging, setIsDragging] = useState(false);

	// HTML5 DnD (browser mode + fallback). In Tauri these events never fire
	// because the webview intercepts file drops, but they are harmless.
	const onDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(true);
	}, []);

	const onDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
		setIsDragging(false);
	}, []);

	const onDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();
			setIsDragging(false);
			const file = e.dataTransfer.files?.[0];
			if (file && isJsonFilename(file.name)) {
				onFile(file);
			}
		},
		[onFile],
	);

	useEffect(() => {
		if (!isTauri()) return;

		let cancelled = false;
		let unlistenFn: (() => void) | null = null;

		(async () => {
			const [{ getCurrentWebview }, { readFile }] = await Promise.all([
				import("@tauri-apps/api/webview"),
				import("@tauri-apps/plugin-fs"),
			]);
			const unlisten = await getCurrentWebview().onDragDropEvent(
				async (event) => {
					const t = event.payload.type;
					if (t === "enter" || t === "over") {
						setIsDragging(true);
						return;
					}
					if (t === "leave") {
						setIsDragging(false);
						return;
					}
					if (t === "drop") {
						setIsDragging(false);
						const paths = event.payload.paths ?? [];
						const path = paths.find((p) => isJsonFilename(p));
						if (!path) return;
						try {
							const bytes = await readFile(path);
							const ab = new ArrayBuffer(bytes.byteLength);
							new Uint8Array(ab).set(bytes);
							const file = new File([ab], basename(path), {
								type: "application/json",
							});
							onFile(file);
						} catch {
							// Ignore — user will see nothing happen; surfacing a toast
							// here would require wiring a notifier. The button path
							// still works.
						}
					}
				},
			);
			if (cancelled) {
				unlisten();
			} else {
				unlistenFn = unlisten;
			}
		})();

		return () => {
			cancelled = true;
			if (unlistenFn) unlistenFn();
		};
	}, [onFile]);

	return {
		isDragging,
		dndHandlers: { onDragOver, onDragLeave, onDrop },
	};
}
