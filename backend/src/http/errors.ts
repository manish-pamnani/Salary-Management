/**
 * An error the API reports to the client as-is. Anything else becomes a 500
 * with a generic message, so internals (SQL, stack traces) never leak.
 */
export class ApiError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const notFound = (what: string) => new ApiError(404, "not_found", `${what} not found`);
