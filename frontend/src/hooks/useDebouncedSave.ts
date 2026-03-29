/**
 * Debounced auto-save hook — triggers a mutation after a delay,
 * tracking status through idle -> pending -> saving -> saved -> idle.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type SaveStatus = "idle" | "pending" | "saving" | "saved" | "error";

interface UseDebouncedSaveOptions<T> {
	/** The mutation function to call with the pending payload. */
	mutationFn: (value: T) => Promise<unknown>;
	/** Debounce delay in ms before triggering the save. Default 1500. */
	delay?: number;
	/** Duration in ms to show "saved" before resetting to idle. Default 2000. */
	savedDuration?: number;
}

interface UseDebouncedSaveReturn<T> {
	/** Call this whenever the value changes to schedule a save. */
	triggerSave: (value: T) => void;
	/** Current save lifecycle status. */
	saveStatus: SaveStatus;
	/** Cancel any pending debounce timer without saving. */
	cancel: () => void;
}

export function useDebouncedSave<T>({
	mutationFn,
	delay = 1500,
	savedDuration = 2000,
}: UseDebouncedSaveOptions<T>): UseDebouncedSaveReturn<T> {
	const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const mutationFnRef = useRef(mutationFn);
	mutationFnRef.current = mutationFn;

	const cancel = useCallback(() => {
		if (timerRef.current) {
			clearTimeout(timerRef.current);
			timerRef.current = null;
		}
		if (savedTimerRef.current) {
			clearTimeout(savedTimerRef.current);
			savedTimerRef.current = null;
		}
	}, []);

	const triggerSave = useCallback(
		(value: T) => {
			// Clear any existing timers
			if (timerRef.current) {
				clearTimeout(timerRef.current);
			}
			if (savedTimerRef.current) {
				clearTimeout(savedTimerRef.current);
				savedTimerRef.current = null;
			}

			setSaveStatus("pending");

			timerRef.current = setTimeout(async () => {
				timerRef.current = null;
				setSaveStatus("saving");
				try {
					await mutationFnRef.current(value);
					setSaveStatus("saved");
					savedTimerRef.current = setTimeout(() => {
						savedTimerRef.current = null;
						setSaveStatus("idle");
					}, savedDuration);
				} catch {
					setSaveStatus("error");
					savedTimerRef.current = setTimeout(() => {
						savedTimerRef.current = null;
						setSaveStatus("idle");
					}, savedDuration);
				}
			}, delay);
		},
		[delay, savedDuration],
	);

	// Cleanup on unmount
	useEffect(() => {
		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
			if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
		};
	}, []);

	return { triggerSave, saveStatus, cancel };
}
