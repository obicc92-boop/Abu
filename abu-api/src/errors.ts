/** An error with an HTTP status and a message that's safe to show the person. */
export class AppError extends Error {
  readonly status: 400 | 401 | 403 | 404 | 409;

  constructor(status: 400 | 401 | 403 | 404 | 409, message: string) {
    super(message);
    this.name = 'AppError';
    this.status = status;
  }
}

export const badRequest = (message: string) => new AppError(400, message);
export const forbidden = (message: string) => new AppError(403, message);
export const notFound = (message: string) => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);

/** Turns D1 constraint failures into messages people can act on. */
export function friendly(e: unknown, inUse = 'This is still in use, so it can’t be removed.'): Error {
  const message = e instanceof Error ? e.message : String(e);
  if (message.includes('at least one leader')) return conflict('A group needs at least one leader. Make someone else a leader first.');
  if (message.includes('FOREIGN KEY constraint failed')) return conflict(inUse);
  if (message.includes('UNIQUE constraint failed')) return conflict('That already exists.');
  if (message.includes('CHECK constraint failed')) return badRequest('Some of the details aren’t valid.');
  return e instanceof Error ? e : new Error(message);
}
