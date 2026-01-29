export class AppError extends Error {
	constructor(
		message: string,
		public status: number,
		public details?: unknown,
	) {
		super(message);
		this.name = "AppError";
	}
}

export class NotFoundError extends AppError {
	constructor(entity: string, id: string) {
		super(`${entity} not found: ${id}`, 404);
		this.name = "NotFoundError";
	}
}

export class ConflictError extends AppError {
	constructor(message: string, details?: unknown) {
		super(message, 409, details);
		this.name = "ConflictError";
	}
}

export class InUseError extends AppError {
	constructor(entity: string, id: string) {
		super(`${entity} ${id} is still in use`, 409);
		this.name = "InUseError";
	}
}
