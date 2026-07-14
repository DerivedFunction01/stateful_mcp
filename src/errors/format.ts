import { McpError, ErrorCode } from "./types";

export function formatErrorResponse(err: unknown) {
  if (err instanceof McpError) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: {
              code: err.code,
              message: err.message,
              details: err.details,
            },
          }),
        },
      ],
      isError: true,
    };
  }

  const message = err instanceof Error ? err.message : String(err);
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          error: {
            code: ErrorCode.INTERNAL_ERROR,
            message: message,
          },
        }),
      },
    ],
    isError: true,
  };
}
