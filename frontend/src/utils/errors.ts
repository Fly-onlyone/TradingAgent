/**
 * Shared error message extraction utility
 */

export function getErrorMessage(
	error: unknown,
	fallback = "Request failed",
): string {
	if (error && typeof error === "object") {
		if ("detail" in error) {
			const detail = (error as { detail?: unknown }).detail;
			if (typeof detail === "string" && detail.trim()) {
				return detail;
			}
		}
		if (
			"message" in error &&
			typeof (error as { message?: unknown }).message === "string"
		) {
			const msg = (error as { message: string }).message;
			if (msg.trim()) return msg;
		}
	}
	return fallback;
}
