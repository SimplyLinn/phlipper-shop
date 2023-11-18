export default function ensureError(thrown: unknown) {
  if (thrown instanceof Error) {
    return thrown;
  }
  let err: Error;
  if (typeof thrown === 'string') {
    err = new Error(thrown);
  } else if (
    typeof thrown === 'object' &&
    thrown != null &&
    'message' in thrown &&
    typeof thrown.message === 'string' &&
    thrown.message
  ) {
    err = new Error(thrown.message);
  } else {
    err = new Error('Unknown error');
  }
  Error.captureStackTrace(err, ensureError);
  return err;
}
