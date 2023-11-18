import { FlipperRpcSerialPort, SerialState } from './FlipperRpcSerialPort';

const startRpcSession = new Uint8Array([
  115, 116, 97, 114, 116, 95, 114, 112, 99, 95, 115, 101, 115, 115, 105, 111,
  110, 13, 10,
]);

export class FlipperRpcUsbSerialPort extends FlipperRpcSerialPort {
  static byId(id: string): FlipperRpcUsbSerialPort | null;
  static byId<T extends FlipperRpcUsbSerialPort>(
    id: string,
    ctor: { new (...args: never[]): T },
  ): T | null;
  static byId<T extends FlipperRpcUsbSerialPort>(
    id: string,
    ctor: { new (...args: never[]): T },
  ): T | FlipperRpcSerialPort | null;
  static byId(
    id: string,
    ctor: {
      new (...args: never[]): FlipperRpcUsbSerialPort;
    } = FlipperRpcUsbSerialPort,
  ): FlipperRpcUsbSerialPort | null {
    const o = super.byId<FlipperRpcUsbSerialPort>(id, ctor) ?? null;
    if (ctor == null) {
      return o;
    }
    if (o == null || o instanceof ctor) {
      return o;
    }
    return null;
  }

  constructor(base: SerialPort) {
    super(base);
  }

  makeInitDataStream() {
    return new Promise((resolve, reject) => {
      let prevChunk = new Uint8Array(0);
      let isClosed = false;
      if (this.readable != null) {
        const transformStream = new TransformStream<Uint8Array>({
          transform: (chunk, controller) => {
            if (isClosed) {
              controller.enqueue(chunk);
              return;
            }
            const fullChunk = new Uint8Array(prevChunk.length + chunk.length);
            fullChunk.set(prevChunk);
            fullChunk.set(chunk, prevChunk.length);
            for (let i = 0, needleIndex = 0; i < fullChunk.length; i++) {
              if (fullChunk[i] === startRpcSession[needleIndex]) {
                needleIndex++;
              } else {
                needleIndex = 0;
              }
              if (needleIndex === startRpcSession.length) {
                isClosed = true;
                if (fullChunk.length > i + 1) {
                  controller.enqueue(fullChunk.slice(i + 1));
                }
                return;
              }
            }
            prevChunk = new Uint8Array(
              Math.min(startRpcSession.length, fullChunk.length),
            );
            prevChunk.set(fullChunk.slice(fullChunk.length - prevChunk.length));
          },
        });
        if (this.writer == null) {
          if (this.writable == null) {
            return;
          }
          this.writer = this.writable.getWriter();
        }
        this.writer
          .write(startRpcSession.slice(0, -1))
          .then(() => {
            this.makeDataStream(transformStream);
          })
          .then(resolve, reject);
      } else {
        reject(new Error('No readable stream'));
      }
    });
  }

  /**
   * @override
   */
  protected async doOpen(): Promise<void> {
    this._state = SerialState.Connecting;
    try {
      await this.base.open({
        baudRate: 1,
      });
    } catch (err) {
      this._state = SerialState.Disconnected;
      throw err;
    }
    try {
      await this.makeInitDataStream();
    } catch (err) {
      await this.base
        .close()
        .catch((err) => console.error('ERROR WHILE CLOSING', err));
      this._state = SerialState.Disconnected;
      throw err;
    }
    this._state = SerialState.Connected;
    this.dispatchEvent(new Event('connect'));
  }

  /**
   * @override
   */
  protected async doClose(): Promise<void> {
    this._state = SerialState.Disconnecting;
    try {
      this.removeDataStream();
      if (this.writer) {
        const writer = this.writer;
        this.writer = null;
        await writer.close();
      }
      await this.base.close();
    } finally {
      this._state = SerialState.Disconnected;
      this.dispatchEvent(new Event('disconnect'));
    }
  }
}
