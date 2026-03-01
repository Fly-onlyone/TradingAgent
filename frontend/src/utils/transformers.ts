/**
 * Shared API response transform helpers
 */

export function toNumber(value: unknown, fallback = 0): number {
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: Number.NaN;
	return Number.isFinite(parsed) ? parsed : fallback;
}

export function toOptionalNumber(value: unknown): number | undefined {
	if (value === null || value === undefined || value === "") {
		return undefined;
	}
	const parsed =
		typeof value === "number"
			? value
			: typeof value === "string"
				? Number(value)
				: Number.NaN;
	return Number.isFinite(parsed) ? parsed : undefined;
}

export function toTimestamp(value: unknown): number {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string") {
		const parsed = Date.parse(value);
		if (Number.isFinite(parsed)) {
			return parsed;
		}
	}
	return Date.now();
}
