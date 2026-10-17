export class AppError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export function invariant(value: unknown, status: number, code: string, message: string): asserts value {
  if (!value) throw new AppError(status, code, message);
}
