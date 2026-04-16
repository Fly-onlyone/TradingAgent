import { useEffect, useRef } from "react";
import { useUIStore } from "@/store/uiStore";

type RecoverableQueryLike = {
	data?: unknown;
	isError: boolean;
	isFetching: boolean;
	isPending: boolean;
	refetch: () => Promise<unknown>;
};

interface RecoverableQueryStateOptions {
	hasData?: boolean;
	retryOnReconnect?: boolean;
}

/**
 * Suppress transient query errors while the backend is still recovering.
 */
export function useRecoverableQueryState(
	query: RecoverableQueryLike,
	options: RecoverableQueryStateOptions = {},
) {
	const backendStatus = useUIStore((s) => s.backendStatus);
	const hasData = options.hasData ?? query.data !== undefined;
	const previousBackendStatusRef = useRef(backendStatus);

	useEffect(() => {
		const cameOnline =
			previousBackendStatusRef.current !== "online" &&
			backendStatus === "online";
		previousBackendStatusRef.current = backendStatus;

		if (!cameOnline || options.retryOnReconnect === false || !query.isError) {
			return;
		}

		void query.refetch();
	}, [backendStatus, options.retryOnReconnect, query.isError, query.refetch]);

	const isRecovering =
		query.isError && (backendStatus !== "online" || query.isFetching);
	const isLoading = query.isPending || (!hasData && isRecovering);
	const showError =
		query.isError &&
		backendStatus === "online" &&
		!query.isFetching &&
		!hasData;

	return {
		isLoading,
		isRecovering,
		showError,
	};
}
