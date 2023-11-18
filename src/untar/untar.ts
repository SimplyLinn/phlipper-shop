import { ProgressivePromise } from './ProgressivePromise';

interface Message<T extends string = string, D = unknown> {
  type: T;
  data: D;
}

type MessageMap = {
  log: {
    level: 'log' | 'info' | 'warn' | 'error';
    msg: string;
  };
  extract: UndecorateFile;
  complete: undefined;
  error: {
    message: string;
  };
};

type KnownMessage = {
  [K in keyof MessageMap]: Message<K, MessageMap[K]>;
}[keyof MessageMap];

/**
Returns a ProgressivePromise.
*/
export function untar(arrayBuffer: ArrayBuffer) {
  if (!(arrayBuffer instanceof ArrayBuffer)) {
    throw new TypeError('arrayBuffer is not an instance of ArrayBuffer.');
  }

  if (!globalThis.Worker) {
    throw new Error(
      'Worker implementation is not available in this environment.',
    );
  }

  return new ProgressivePromise<DecoratedFile[]>(function (
    resolve,
    reject,
    progress,
  ) {
    const worker = new Worker(new URL('./untar-worker.ts', import.meta.url));

    const files: DecoratedFile[] = [];

    worker.onerror = function (err) {
      reject(err);
    };

    worker.onmessage = function ({
      data: message,
    }: MessageEvent<KnownMessage>) {
      let file;
      switch (message.type) {
        case 'log':
          console[message.data.level]('Worker: ' + message.data.msg);
          break;
        case 'extract':
          file = decorateExtractedFile(message.data);
          if (file.name.endsWith('\x00')) {
            file.name = file.name.slice(0, -1);
          }
          files.push(file);
          progress(file);
          break;
        case 'complete':
          worker.terminate();
          resolve(files);
          break;
        case 'error':
          worker.terminate();
          reject(new Error(message.data.message));
          break;
        default:
          worker.terminate();
          reject(
            new Error(
              'Unknown message from worker: ' + (message as Message).type,
            ),
          );
          break;
      }
    };

    // console.info("Sending arraybuffer to worker for extraction.");
    worker.postMessage({ type: 'extract', buffer: arrayBuffer }, [arrayBuffer]);
  });
}

interface FileDecorations {
  readonly blob: Blob;
  getBlobUrl(): string;
  readAsString(): string;
  readAsJSON(): object;
}

interface UndecorateFile {
  buffer: string;
  name: string;
}

export interface DecoratedFile extends FileDecorations, UndecorateFile {}

const decoratedFileProps: {
  [K in keyof FileDecorations]: TypedPropertyDescriptor<FileDecorations[K]>;
} = {
  blob: {
    get(this: { _blob?: Blob; buffer: ArrayBuffer }) {
      return this._blob || (this._blob = new Blob([this.buffer]));
    },
  },
  getBlobUrl: {
    value(this: { _blobUrl?: string; blob: Blob }) {
      return this._blobUrl || (this._blobUrl = URL.createObjectURL(this.blob));
    },
  },
  readAsString: {
    value(this: { _string?: string; buffer: ArrayBuffer }) {
      const buffer = this.buffer;
      const charCount = buffer.byteLength;
      const charSize = 1;
      const bufferView = new DataView(buffer);

      const charCodes = [];

      for (let i = 0; i < charCount; ++i) {
        const charCode = bufferView.getUint8(i * charSize);
        charCodes.push(charCode);
      }

      return (this._string = String.fromCharCode.apply(null, charCodes));
    },
  },
  readAsJSON: {
    value(this: { readAsString: () => string }) {
      return JSON.parse(this.readAsString());
    },
  },
};

function decorateExtractedFile(file: UndecorateFile): DecoratedFile {
  Object.defineProperties(file, decoratedFileProps);
  return file as DecoratedFile;
}
