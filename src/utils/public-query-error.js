const PUBLIC_QUERY_ERROR_BODY = "تعذر تحميل المحتوى حاليا.";

function logPublicQueryError(context, error) {
	console.error(`[public-content] ${context}`, error);
}

/**
 * EmDash (via Astro live collections) reports a missing slug as a
 * LiveEntryNotFoundError instead of an empty entry. That is a 404, not a
 * server failure, so routes must check this before treating `error` as fatal.
 */
export function isEntryNotFoundError(error) {
	return (
		typeof error === "object" &&
		error !== null &&
		error.name === "LiveEntryNotFoundError"
	);
}

export function createPublicQueryErrorResponse(context, error) {
	logPublicQueryError(context, error);

	return new Response(PUBLIC_QUERY_ERROR_BODY, {
		status: 500,
		statusText: "Internal Server Error",
		headers: {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "no-store",
		},
	});
}

export function throwPublicQueryError(context, error) {
	logPublicQueryError(context, error);
	throw new Error("Public CMS query failed");
}
