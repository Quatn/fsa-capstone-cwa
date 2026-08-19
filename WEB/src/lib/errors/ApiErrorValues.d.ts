export type ServerErrorValues = 'ERR_UNABLE_TO_CONNECT_DB';

export type ValidationErrorValues = 'ERR_VALIDATION_FAILED';

export type ApiControllerErrorValues = 'ERR_RESOURCE_NOT_FOUND';

export type AuthApiErrorValues =
  | 'ERR_INVALID_CREDENTIALS'
  | 'ERR_USER_NOT_FOUND'
  | 'ERR_USER_ALREADY_EXISTS'
  | 'ERR_INVALID_PASSWORD';

export type ApiErrorValues =
  | ServerErrorValues
  | ValidationErrorValues
  | ApiControllerErrorValues
  | AuthApiErrorValues
  | 'ERR_UNKNOWN';
