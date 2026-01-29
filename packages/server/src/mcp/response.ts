export type McpTextResult = {
	content: { type: "text"; text: string }[];
	isError?: boolean;
};

export function mcpOk(data: unknown, version: string): McpTextResult {
	return {
		content: [
			{
				type: "text",
				text: JSON.stringify({ data, version }),
			},
		],
	};
}

export function mcpErr(
	code: string,
	message: string,
	details?: unknown,
): McpTextResult {
	return {
		isError: true,
		content: [
			{
				type: "text",
				text: JSON.stringify({
					error: {
						code,
						message,
						...(details !== undefined ? { details } : {}),
					},
				}),
			},
		],
	};
}
