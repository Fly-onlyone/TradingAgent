/**
 * Hook for polling a login status check after opening a browser/terminal flow.
 * Starts polling when `startPolling()` is called, stops on success or timeout.
 */

import { useEffect, useState } from "react";

interface UsePollingLoginOptions {
	/** Async function called each poll tick. Return true to signal success. */
	pollFn: () => Promise<boolean>;
	/** Called once when pollFn returns true. */
	onSuccess: () => void;
	/** Called when the timeout elapses without success. */
	onTimeout?: () => void;
	/** Poll interval in ms. Default: 4000 */
	interval?: number;
	/** Timeout in ms before giving up. Default: 120_000 */
	timeout?: number;
}

interface UsePollingLoginResult {
	isPolling: boolean;
	startPolling: () => void;
	stopPolling: () => void;
}

export function usePollingLogin({
	pollFn,
	onSuccess,
	onTimeout,
	interval = 4000,
	timeout = 120_000,
}: UsePollingLoginOptions): UsePollingLoginResult {
	const [isPolling, setIsPolling] = useState(false);

	useEffect(() => {
		if (!isPolling) return;

		const intervalId = setInterval(async () => {
			try {
				const succeeded = await pollFn();
				if (succeeded) {
					setIsPolling(false);
					onSuccess();
				}
			} catch {
				/* ignore poll errors */
			}
		}, interval);

		const timeoutId = setTimeout(() => {
			setIsPolling(false);
			onTimeout?.();
		}, timeout);

		return () => {
			clearInterval(intervalId);
			clearTimeout(timeoutId);
		};
	}, [isPolling, pollFn, onSuccess, onTimeout, interval, timeout]);

	return {
		isPolling,
		startPolling: () => setIsPolling(true),
		stopPolling: () => setIsPolling(false),
	};
}
