/**
 * Derives a SaveStatus from a TanStack Query mutation's state,
 * with an auto-clear timer for the "saved"/"error" states.
 */

import { useEffect, useRef, useState } from "react";
import type { SaveStatus } from "./useDebouncedSave";

export function useMutationSaveStatus(
	mutation: { isPending: boolean; isSuccess: boolean; isError: boolean },
	clearDelay = 2000,
): SaveStatus {
	const [status, setStatus] = useState<SaveStatus>("idle");
	const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	useEffect(() => {
		if (timerRef.current) clearTimeout(timerRef.current);

		if (mutation.isPending) {
			setStatus("saving");
		} else if (mutation.isSuccess) {
			setStatus("saved");
			timerRef.current = setTimeout(() => setStatus("idle"), clearDelay);
		} else if (mutation.isError) {
			setStatus("error");
			timerRef.current = setTimeout(() => setStatus("idle"), clearDelay);
		}

		return () => {
			if (timerRef.current) clearTimeout(timerRef.current);
		};
	}, [mutation.isPending, mutation.isSuccess, mutation.isError, clearDelay]);

	return status;
}
