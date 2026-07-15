export class AppError extends Error {
  public constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function unauthorized(message = "认证已失效"): AppError {
  return new AppError(401, "UNAUTHORIZED", message);
}

export function forbidden(message = "没有执行此操作的权限"): AppError {
  return new AppError(403, "FORBIDDEN", message);
}

export function notFound(message = "资源不存在"): AppError {
  return new AppError(404, "NOT_FOUND", message);
}

export function conflict(
  code: string,
  message: string,
  details?: unknown,
): AppError {
  return new AppError(409, code, message, details);
}
