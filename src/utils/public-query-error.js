const PUBLIC_QUERY_ERROR_BODY = "تعذر تحميل المحتوى حاليا.";

function logPublicQueryError(context, error) {
	console.error(`[public-content] ${context}`, error);
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
