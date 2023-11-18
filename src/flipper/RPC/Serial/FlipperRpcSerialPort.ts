import type { FlipperRpcUsbSerialPort } from './FlipperRpcUsbSerialPort';

const portById = new Map<string, FlipperRpcSerialPort>();

let FlipperRpcUsbSerialPortCtor: typeof FlipperRpcUsbSerialPort | null = null;

import('./FlipperRpcUsbSerialPort').then((m) => {
  FlipperRpcUsbSerialPortCtor = m.FlipperRpcUsbSerialPort;
});

function generateId() {
  let id: string;
  do {
    id = Math.random().toString(36).slice(2, 13).padEnd(11, '0');
  } while (portById.has(id));
  return id;
}

export enum SerialState {
  Disconnecting = 'DISCONNECTING',
  Disconnected = 'DISCONNECTED',
  Connecting = 'CONNECTING',
  Connected = 'CONNECTED',
}

export abstract class FlipperRpcSerialPort implements SerialPort {
  static byId(id: string): FlipperRpcSerialPort | null;
  static byId<T extends FlipperRpcSerialPort>(
    id: string,
    ctor: { new (...args: never[]): T },
  ): T | null;
  static byId<T extends FlipperRpcSerialPort>(
    id: string,
    ctor?: { new (...args: never[]): T },
  ): T | FlipperRpcSerialPort | null;
  static byId(
    id: string,
    ctor?: { new (...args: never[]): FlipperRpcSerialPort },
  ) {
    const o = portById.get(id) ?? null;
    if (ctor == null) {
      return o;
    }
    if (o == null || o instanceof ctor) {
      return o;
    }
    return null;
  }
  static prune<T extends FlipperRpcSerialPort>(
    ctor: { new (): T },
    instances: T[],
  ) {
    for (const port of portById.values()) {
      if (port instanceof ctor && !instances.includes(port as T)) {
        portById.delete(port.id);
      }
    }
  }
  static resolve(basePort: SerialPort) {
    for (const port of portById.values()) {
      if (port.base === basePort) {
        return port;
      }
    }
    if (basePort instanceof SerialPort) {
      if (FlipperRpcUsbSerialPortCtor == null) {
        throw new Error('FlipperRpcUsbSerialPort not loaded');
      }
      return new FlipperRpcUsbSerialPortCtor(basePort);
    }
    throw new Error('Invalid port');
  }

  name?: string;
  readonly id: string = generateId();
  protected _state: SerialState = SerialState.Disconnected;
  protected connectionPromise: Promise<void> = Promise.resolve();
  protected writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  protected dstStream: WritableStream<Uint8Array> | null = null;
  protected base: SerialPort;
  private buffer: Uint8Array[] = [];
  private dataConsumer?: {
    consumer(chunk: Uint8Array): void | Promise<void>;
    onDetach?(): void;
  } | null = null;
  private isFlushingBuffer = false;

  protected constructor(base: SerialPort) {
    this.base = base;
    portById.set(this.id, this);
  }

  get onconnect(): ((ev: Event) => any) | null {
    return this.base.onconnect as any;
  }
  set onconnect(value) {
    this.base.onconnect = value as any;
  }
  get ondisconnect(): ((ev: Event) => any) | null {
    return this.base.ondisconnect as any;
  }
  set ondisconnect(value) {
    this.base.ondisconnect = value as any;
  }
  get readable(): ReadableStream<Uint8Array> | null {
    return this.base.readable;
  }
  get writable(): WritableStream<Uint8Array> | null {
    return this.base.writable;
  }

  setSignals(signals: SerialOutputSignals): Promise<void> {
    return this.base.setSignals(signals);
  }
  getSignals(): Promise<SerialInputSignals> {
    return this.base.getSignals();
  }
  getInfo(): SerialPortInfo {
    return this.base.getInfo();
  }
  forget(): Promise<void> {
    return this.base.forget();
  }
  dispatchEvent(event: Event): boolean {
    return this.base.dispatchEvent(event);
  }

  get isConnected() {
    return this._state === SerialState.Connected;
  }

  get state() {
    return this._state;
  }

  write(...args: Parameters<WritableStreamDefaultWriter<Uint8Array>['write']>) {
    if (!this.isConnected) {
      throw new Error('Port not open');
    }
    if (this.writer == null) {
      if (this.writable == null) {
        throw new Error('Unable to open writer stream');
      }
      this.writer = this.writable.getWriter();
    }
    this.writer.write(...args);
  }

  private maybeFlushBuffer() {
    if (this.isFlushingBuffer || this.dataConsumer == null) {
      return;
    }
    this.isFlushingBuffer = true;
    (async () => {
      while (this.buffer.length > 0 && this.dataConsumer != null) {
        const chunk = this.buffer.shift()!;
        await this.dataConsumer.consumer(chunk);
      }
    })().finally(() => {
      this.isFlushingBuffer = false;
    });
  }

  protected async makeDataStream(
    transformer?: TransformStream<Uint8Array, Uint8Array>,
  ) {
    if (this.dstStream == null && this.readable != null) {
      const dstStream = (this.dstStream = new WritableStream<Uint8Array>({
        write: (chunk) => {
          this.buffer.push(chunk);
          this.maybeFlushBuffer();
        },
      }));
      if (transformer) {
        this.readable.pipeThrough(transformer).pipeTo(dstStream);
      } else {
        this.readable.pipeTo(dstStream);
      }
    } else {
      throw new Error('No readable stream');
    }
  }

  protected async removeDataStream() {
    if (this.dstStream != null) {
      const dstStream = this.dstStream;
      this.dstStream = null;
      return dstStream.close();
    }
  }

  addEventListener(
    type: 'connect' | 'disconnect',
    listener: (ev: Event) => any,
    useCapture?: boolean,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    type: string,
    listener: any,
    options?: boolean | AddEventListenerOptions,
  ): void {
    this.base.addEventListener(type, listener, options);
  }

  removeEventListener(
    type: 'connect' | 'disconnect',
    listener: (ev: Event) => any,
    useCapture?: boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    type: string,
    listener: any,
    options?: boolean | EventListenerOptions,
  ): void {
    this.base.removeEventListener(type, listener, options);
  }

  unshiftData(chunk: Uint8Array) {
    this.buffer.unshift(chunk);
    this.maybeFlushBuffer();
  }

  detachConsumer(consumer?: (chunk: Uint8Array) => void): boolean {
    if (this.dataConsumer == null) return false;
    if (consumer && this.dataConsumer.consumer !== consumer) return false;
    const oldConsumer = this.dataConsumer;
    this.dataConsumer = null;
    oldConsumer.onDetach?.();
    return true;
  }

  attachConsumer(
    output: ((chunk: Uint8Array) => void) | WritableStream<Uint8Array>,
    onDetach?: () => void,
  ) {
    if (typeof output === 'function') {
      const oldConsumer = this.dataConsumer;
      this.dataConsumer = {
        consumer: output,
        onDetach,
      };
      oldConsumer?.onDetach?.();
    } else {
      const writer = output.getWriter();
      const oldConsumer = this.dataConsumer;
      this.dataConsumer = {
        consumer: (chunk) => writer.write(chunk),
        onDetach: () => {
          writer.close();
          onDetach?.();
        },
      };
      oldConsumer?.onDetach?.();
    }
  }

  protected abstract doOpen(): Promise<void>;

  async open(): Promise<void> {
    if (this._state === SerialState.Connected) {
      return;
    }
    if (this._state === SerialState.Connecting) {
      await this.connectionPromise;
      return;
    }
    if (this._state === SerialState.Disconnecting) {
      await this.connectionPromise;
      return this.open();
    }
    if (this._state !== SerialState.Disconnected) {
      throw new Error('Invalid state');
    }
    await (this.connectionPromise = this.doOpen());
  }

  protected abstract doClose(): Promise<void>;

  async close(): Promise<void> {
    if (this._state === SerialState.Disconnected) {
      return;
    }
    if (this._state === SerialState.Disconnecting) {
      await this.connectionPromise;
      return;
    }
    if (this._state !== SerialState.Connected) {
      await this.connectionPromise;
      return this.close();
    }
    await (this.connectionPromise = this.doClose());
  }
}
