export class DomainError extends Error {
  constructor(status, code, message = code.replaceAll('_', ' ')) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export function requireRule(condition, code = 'INVALID_TRANSITION', status = 409) {
  if (!condition) throw new DomainError(status, code);
}
