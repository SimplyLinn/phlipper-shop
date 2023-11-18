import { untar } from '../untar/untar';
import pako from 'pako';

type OP = 'read' | 'write' | 'stop reading' | 'connect' | 'disconnect';

interface EventSuccess<D> {
  status: 1;
  data: D;
}

interface EventFailure {
  status: number;
  error: unknown;
}

type Event<D> = EventSuccess<D> | EventFailure;

function isSuccess<D>(event: Event<D>): event is EventSuccess<D> {
  return event.status === 1;
}

class Operation {
  resolve: ((value: unknown) => void) | undefined = undefined;
  reject: ((reason?: unknown) => void) | undefined = undefined;

  create<Res>(worker: Worker, operation: OP): Promise<Res>;
  create<Req, Res>(worker: Worker, operation: OP, data: Req): Promise<Res>;
  create<Req, Res>(worker: Worker, operation: OP, data?: Req) {
    return new Promise<Res>((resolve, reject) => {
      worker.postMessage({ operation: operation, data: data });
      this.resolve = resolve as (value: unknown) => void;
      this.reject = reject;
    });
  }

  terminate(event: Event<unknown>) {
    if (isSuccess(event)) {
      const { resolve } = this;
      if (resolve == null) {
        throw new Error('No pending operation to resolve');
      }
      this.resolve = undefined;
      this.reject = undefined;
      resolve(event.data);
    } else {
      const { reject } = this;
      if (reject == null) {
        throw new Error('No pending operation to reject');
      }
      this.resolve = undefined;
      this.reject = undefined;
      reject(event.error);
    }
  }
}

function unpack(
  buffer?: Iterable<number> | ArrayLike<number> | ArrayBufferLike,
) {
  const ungzipped = pako.ungzip(
    new Uint8Array(buffer as ConstructorParameters<Uint8ArrayConstructor>),
  );
  return untar(ungzipped.buffer);
}

export { Operation, unpack };
