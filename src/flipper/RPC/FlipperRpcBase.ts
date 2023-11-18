import * as $protobuf from 'protobufjs';
import { PB } from '@/flipper/proto-compiled/bootstrap';
import protobuf from 'protobufjs';
import { FlipperRpcSerialPort } from './FlipperRpcSerialPort';
import { PROTOBUF_VERSION_MAP } from '../proto-compiled';
import {
  AllVersionsInRange,
  ParseVersionRange,
  VersionRange,
} from './Commands/Types';

const MAX_ID = 2 ** 32 - 1;

function appendReaderChunk(reader: protobuf.Reader, chunk: Uint8Array) {
  const fullLen = reader.buf.length + chunk.length;
  if (fullLen > 8192 && reader.pos !== 0) {
    const fullChunk = new Uint8Array(
      reader.buf.length + chunk.length - reader.pos,
    );
    fullChunk.set(reader.buf.slice(reader.pos));
    fullChunk.set(chunk, reader.buf.length - reader.pos);
    reader.buf = fullChunk;
    reader.len = fullChunk.length;
    reader.pos = 0;
  } else {
    const fullChunk = new Uint8Array(fullLen);
    fullChunk.set(reader.buf);
    fullChunk.set(chunk, reader.buf.length);
    reader.buf = fullChunk;
    reader.len = fullChunk.length;
  }
}
type AnyMain = InstanceType<
  PROTOBUF_VERSION_MAP[keyof PROTOBUF_VERSION_MAP]['PB']['Main']
>;

type AnyMainCtor =
  PROTOBUF_VERSION_MAP[keyof PROTOBUF_VERSION_MAP]['PB']['Main'];

class FlipperRpcEventEmitter<Main extends AnyMain> extends EventTarget {
  #listeners: [
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
    marker?: symbol,
  ][] = [];
  addEventListener(
    type: 'connect' | 'disconnect',
    listener: EventListenerOrEventListenerObject | null,
    useCapture?: boolean,
  ): void;
  addEventListener(
    type: 'rpcData',
    listener: (this: this, ev: RpcDataEvent<Main>) => any,
    useCapture?: boolean,
  ): void;
  addEventListener(
    type: 'rpcCommandResponse',
    listener: (this: this, ev: RpcCommandResponseEvent<Main>) => any,
    useCapture?: boolean,
  ): void;
  addEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions,
  ): void;
  addEventListener(
    ...args: [
      type: string,
      listener: any,
      options?: boolean | AddEventListenerOptions,
    ]
  ) {
    try {
      return super.addEventListener(...args);
    } finally {
      const marker = Symbol();
      const newArgs: [
        type: string,
        listener: EventListenerOrEventListenerObject | null,
        options?: boolean | AddEventListenerOptions,
        marker?: symbol,
      ] = [...args];
      newArgs[2] = newArgs[2] ?? undefined;
      newArgs[3] = marker;
      this.#listeners.push(newArgs);
      if (typeof args[2] === 'object' && args[2] != null && args[2].signal) {
        args[2].signal.addEventListener('abort', () => {
          this.#listeners = this.#listeners.filter(
            ([, , , curMarker]) => curMarker !== marker,
          );
        });
      }
    }
  }
  removeEventListener(
    type: 'connect' | 'disconnect',
    listener: EventListenerOrEventListenerObject | null,
    useCapture?: boolean,
  ): void;
  removeEventListener(
    type: 'rpcData',
    listener: (this: this, ev: RpcDataEvent<Main>) => any,
    useCapture?: boolean,
  ): void;
  removeEventListener(
    type: 'rpcCommandResponse',
    listener: (this: this, ev: RpcCommandResponseEvent<Main>) => any,
    useCapture?: boolean,
  ): void;
  removeEventListener(
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | EventListenerOptions,
  ): void;
  removeEventListener(
    ...args: [
      type: string,
      listener: any,
      options?: boolean | EventListenerOptions,
    ]
  ) {
    try {
      return super.removeEventListener(...args);
    } finally {
      this.#listeners = this.#listeners.filter(([type, listener, options]) => {
        if (type !== args[0] || listener !== args[1]) {
          return true;
        }
        const isCurCapture =
          options === true ||
          (typeof options === 'object' &&
            options != null &&
            options.capture === true);
        const isArgCapture =
          args[2] === true ||
          (typeof args[2] === 'object' &&
            args[2] != null &&
            args[2].capture === true);
        return isCurCapture !== isArgCapture;
      });
    }
  }

  dispatchEvent(event: Event): boolean {
    try {
      return super.dispatchEvent(event);
    } finally {
      this.#listeners = this.#listeners.filter(([type, listener, options]) => {
        if (type !== event.type) {
          return true;
        }
        return (
          typeof options === 'object' &&
          options != null &&
          options.once === true
        );
      });
    }
  }

  removeAllListeners(type?: string) {
    this.#listeners = this.#listeners.filter(([curType, listener, options]) => {
      if (type != null && type !== curType) return true;
      try {
        if (options != null) {
          super.removeEventListener(curType, listener, options);
        } else {
          super.removeEventListener(curType, listener);
        }
      } catch (err) {
        console.error(err);
        return true;
      }
      return false;
    });
  }
}

class RpcDataEvent<Main extends AnyMain> extends Event {
  constructor(readonly data: Main) {
    super('rpcData');
  }
}

class RpcCommandResponseEvent<Main extends AnyMain> extends Event {
  constructor(
    readonly data: Main[],
    readonly commandId: number,
  ) {
    super('rpcCommandResponse');
  }
}

type InFlightCommand<Main extends AnyMain> = readonly [
  cmd: string,
  commandId: number,
  reses: Main[],
  resolve: (data: PromiseLike<Main[]> | Main[]) => void,
  reject: (err: any) => void,
];

interface ProtobufCtor<T, U> {
  /**
   * Constructs a new message.
   * @param [properties] Properties to set
   */
  new (properties?: U): T;

  /**
   * Creates a new message instance using the specified properties.
   * @param [properties] Properties to set
   * @returns message instance
   */
  create(properties?: U): T;

  /**
   * Encodes the specified message. Does not implicitly {@link ProtobufCtor.verify|verify} messages.
   * @param message Message or plain object to encode
   * @param [writer] Writer to encode to
   * @returns Writer
   */
  encode(message: U, writer?: $protobuf.Writer): $protobuf.Writer;

  /**
   * Encodes the specified message, length delimited. Does not implicitly {@link PB.Main.verify|verify} messages.
   * @param message Message or plain object to encode
   * @param [writer] Writer to encode to
   * @returns Writer
   */
  encodeDelimited(message: U, writer?: $protobuf.Writer): $protobuf.Writer;

  /**
   * Decodes a message from the specified reader or buffer.
   * @param reader Reader or buffer to decode from
   * @param [length] Message length if known beforehand
   * @throws {Error} If the payload is not a reader or valid buffer
   * @throws {$protobuf.util.ProtocolError} If required fields are missing
   */
  decode(reader: $protobuf.Reader | Uint8Array, length?: number): T;

  /**
   * Decodes a message from the specified reader or buffer, length delimited.
   * @param reader Reader or buffer to decode from
   * @throws {Error} If the payload is not a reader or valid buffer
   * @throws {$protobuf.util.ProtocolError} If required fields are missing
   */
  decodeDelimited(reader: $protobuf.Reader | Uint8Array): T;

  /**
   * Verifies a message.
   * @param message Plain object to verify
   * @returns `null` if valid, otherwise the reason why it is not
   */
  verify(message: { [k: string]: any }): string | null;

  /**
   * Creates a message from a plain object. Also converts values to their respective internal types.
   * @param object Plain object
   */
  fromObject(object: { [k: string]: any }): T;

  /**
   * Creates a plain object from a message. Also converts values to other types if specified.
   * @param message
   * @param [options] Conversion options
   * @returns Plain object
   */
  toObject(
    message: U,
    options?: $protobuf.IConversionOptions,
  ): { [k: string]: any };

  /**
   * Gets the default type url for the type
   * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
   * @returns The default type url
   */
  getTypeUrl(typeUrlPrefix?: string): string;
}

export type DefaultMainParams<MainCtor extends AnyMainCtor> =
  {} extends NonNullable<ConstructorParameters<MainCtor>[0]>
    ? [
        defaultMainProperties?: {
          [key in keyof Omit<
            NonNullable<ConstructorParameters<MainCtor>[0]>,
            'commandId' | 'hasNext'
          >]: NonNullable<ConstructorParameters<MainCtor>[0]>[key];
        },
      ]
    : [
        defaultMainProperties: {
          [key in keyof Omit<
            NonNullable<ConstructorParameters<MainCtor>[0]>,
            'commandId' | 'hasNext'
          >]: NonNullable<ConstructorParameters<MainCtor>[0]>[key];
        },
      ];

interface PatchedMainCtor<T extends AnyMainCtor> {
  /**
   * Constructs a new Main.
   * @param [properties] Properties to set
   */
  new (...params: ConstructorParameters<T>): InstanceType<T>;

  /**
   * Creates a new Main instance using the specified properties.
   * @param [properties] Properties to set
   * @returns Main instance
   */
  create(properties: NonNullable<ConstructorParameters<T>[0]>): InstanceType<T>;

  /**
   * Encodes the specified Main message. Does not implicitly {@link PB.Main.verify|verify} messages.
   * @param message Main message or plain object to encode
   * @param [writer] Writer to encode to
   * @returns Writer
   */
  encode(
    message: NonNullable<ConstructorParameters<T>[0]>,
    writer?: protobuf.Writer,
  ): protobuf.Writer;

  /**
   * Encodes the specified Main message, length delimited. Does not implicitly {@link PB.Main.verify|verify} messages.
   * @param message Main message or plain object to encode
   * @param [writer] Writer to encode to
   * @returns Writer
   */
  encodeDelimited(
    message: NonNullable<ConstructorParameters<T>[0]>,
    writer?: protobuf.Writer,
  ): protobuf.Writer;

  /**
   * Decodes a Main message from the specified reader or buffer.
   * @param reader Reader or buffer to decode from
   * @param [length] Message length if known beforehand
   * @returns Main
   * @throws {Error} If the payload is not a reader or valid buffer
   * @throws {$protobuf.util.ProtocolError} If required fields are missing
   */
  decode(
    reader: protobuf.Reader | Uint8Array,
    length?: number,
  ): InstanceType<T>;

  /**
   * Decodes a Main message from the specified reader or buffer, length delimited.
   * @param reader Reader or buffer to decode from
   * @returns Main
   * @throws {Error} If the payload is not a reader or valid buffer
   * @throws {$protobuf.util.ProtocolError} If required fields are missing
   */
  decodeDelimited(reader: protobuf.Reader | Uint8Array): InstanceType<T>;

  /**
   * Verifies a Main message.
   * @param message Plain object to verify
   * @returns `null` if valid, otherwise the reason why it is not
   */
  verify(message: { [k: string]: any }): string | null;

  /**
   * Creates a Main message from a plain object. Also converts values to their respective internal types.
   * @param object Plain object
   * @returns Main
   */
  fromObject(object: { [k: string]: any }): InstanceType<T>;

  /**
   * Creates a plain object from a Main message. Also converts values to other types if specified.
   * @param message Main
   * @param [options] Conversion options
   * @returns Plain object
   */
  toObject(
    message: InstanceType<T>,
    options?: $protobuf.IConversionOptions,
  ): { [k: string]: any };

  /**
   * Gets the default type url for Main
   * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
   * @returns The default type url
   */
  getTypeUrl(typeUrlPrefix?: string): string;
}

export type ResolveMainCtor<ProtoVersion extends VersionRange> =
  PROTOBUF_VERSION_MAP[AllVersionsInRange<
    ParseVersionRange<ProtoVersion>
  >]['PB']['Main'];

export interface IFlipperRpcBase<MainCtor extends AnyMainCtor>
  extends FlipperRpcEventEmitter<InstanceType<MainCtor>> {
  readonly port: FlipperRpcSerialPort;
  get isReady(): boolean;
  rawCommandExt<
    const CMD extends NonNullable<InstanceType<MainCtor>['content']> &
      keyof NonNullable<ConstructorParameters<MainCtor>[0]>,
  >(
    command: CMD,
    mainProperties: Omit<
      NonNullable<ConstructorParameters<MainCtor>[0]>,
      'commandId' | 'hasNext'
    > | null,
    properties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >,
  ): Promise<InstanceType<MainCtor>[]>;
  rawCommandExt<
    const CMD extends NonNullable<InstanceType<MainCtor>['content']> &
      keyof NonNullable<ConstructorParameters<MainCtor>[0]>,
  >(
    command: CMD,
    mainProperties: Omit<
      NonNullable<ConstructorParameters<MainCtor>[0]>,
      'commandId' | 'hasNext'
    > | null,

    properties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >,
    ...extraProperties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >[]
  ): Promise<InstanceType<MainCtor>[]>;

  rawCommand<
    const CMD extends NonNullable<InstanceType<MainCtor>['content']> &
      keyof NonNullable<ConstructorParameters<MainCtor>[0]>,
  >(
    command: CMD,
    properties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >,
  ): Promise<InstanceType<MainCtor>[]>;
  rawCommand<
    const CMD extends NonNullable<InstanceType<MainCtor>['content']> &
      keyof NonNullable<ConstructorParameters<MainCtor>[0]>,
  >(
    command: CMD,
    properties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >,
    ...extraProperties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >[]
  ): Promise<InstanceType<MainCtor>[]>;

  connect(): Promise<this>;
}

export interface FlipperRpcVersion<Version extends VersionRange>
  extends IFlipperRpcBase<ResolveMainCtor<Version>> {
  version: AllVersionsInRange<ParseVersionRange<Version>>;
}

export class FlipperRpcBase<MainCtor extends AnyMainCtor>
  extends FlipperRpcEventEmitter<InstanceType<MainCtor>>
  implements IFlipperRpcBase<MainCtor>
{
  #Main: PatchedMainCtor<MainCtor>;
  static readonly serialFilters = [
    { usbVendorId: 0x0483, usbProductId: 0x5740 },
  ];
  readonly port: FlipperRpcSerialPort;
  static startRpcSession = new Uint8Array([
    115, 116, 97, 114, 116, 95, 114, 112, 99, 95, 115, 101, 115, 115, 105, 111,
    110, 13, 10,
  ]);
  #reader = new protobuf.Reader(new Uint8Array(0));
  #inFlightCommands: InFlightCommand<InstanceType<MainCtor>>[] = [];
  #id = 1;
  #connected = false;
  #defaultMainProperties: Omit<
    NonNullable<ConstructorParameters<MainCtor>[0]>,
    'commandId' | 'hasNext'
  >;

  #nextId() {
    if (this.#id === MAX_ID) {
      this.#id = 1;
    }
    return this.#id++;
  }

  get isReady() {
    return this.port.isConnected;
  }

  constructor(
    portId: string,
    Main: MainCtor,
    ...[defaultMainProperties]: DefaultMainParams<MainCtor>
  );
  constructor(
    port: FlipperRpcSerialPort,
    Main: MainCtor,
    ...[defaultMainProperties]: DefaultMainParams<MainCtor>
  );
  constructor(
    portOrId: FlipperRpcSerialPort | string,
    Main: MainCtor,
    ...[defaultMainProperties]: DefaultMainParams<MainCtor>
  );
  constructor(
    portOrId: FlipperRpcSerialPort | string,
    Main: MainCtor,
    ...[defaultMainProperties]: DefaultMainParams<MainCtor>
  ) {
    super();
    this.#defaultMainProperties = (defaultMainProperties ?? {}) as Omit<
      NonNullable<ConstructorParameters<MainCtor>[0]>,
      'commandId' | 'hasNext'
    >;
    this.#Main = Main as PatchedMainCtor<MainCtor>;
    if (portOrId instanceof FlipperRpcSerialPort) {
      this.port = portOrId;
    } else {
      const port = FlipperRpcSerialPort.byId(portOrId);
      if (!port) {
        throw new Error(`No port with id "${portOrId}"`);
      }
      this.port = port;
    }
    this.onData = this.onData.bind(this);
  }

  async #closeAndReset() {
    try {
      await this.port.close();
    } finally {
      this.port.detachConsumer(this.onData);
      this.#reader = new protobuf.Reader(new Uint8Array(0));
      if (this.#connected) {
        this.#connected = false;
        this.dispatchEvent(new Event('disconnect'));
      }
      const oldCommands = this.#inFlightCommands;
      this.#inFlightCommands = [];
      for (const [, , , , reject] of oldCommands) {
        reject(new Error('Port closed'));
      }
    }
  }

  async #detachAndDispose() {
    Object.assign(this, {
      port: null,
    });
    this.#reader = null as any;
    if (this.#connected) {
      this.#connected = false;
      this.dispatchEvent(new Event('disconnect'));
    }
    this.removeAllListeners();
  }

  private onData(chunk: Uint8Array) {
    appendReaderChunk(this.#reader, chunk);
    let shouldBreak = false;
    while (this.#reader.pos < this.#reader.len && !shouldBreak) {
      try {
        const res = (() => {
          const oldPos = this.#reader.pos;
          try {
            return this.#Main.decodeDelimited(this.#reader);
          } catch (err) {
            shouldBreak = true;
            this.#reader.pos = oldPos;
            throw err;
          }
        })();
        this.dispatchEvent(new RpcDataEvent(res));
        if (res.commandId != null && res.commandId > 0) {
          const inFlightIndex = this.#inFlightCommands.findIndex(
            ([, commandId]) => {
              return commandId === res.commandId;
            },
          );
          if (inFlightIndex >= 0) {
            const [, commandId, reses, resolve] = !res.hasNext
              ? this.#inFlightCommands.splice(inFlightIndex, 1)[0]
              : this.#inFlightCommands[inFlightIndex];
            if (res.hasNext) {
              reses.push(res);
              return;
            } else {
              reses.push(res);
              this.dispatchEvent(new RpcCommandResponseEvent(reses, commandId));
              resolve(reses);
            }
          } else {
            console.warn('No in flight command for response', res);
          }
        } else {
          console.log('Received unsolicited message', res);
        }
      } catch (err) {
        if (
          err instanceof RangeError &&
          err.message.startsWith('index out of range: ') &&
          this.#reader.len < 16384
        ) {
          return;
        }
        const toConsume = this.#reader.buf.slice(this.#reader.pos);
        console.log(
          'onData',
          `[0x${[...toConsume]
            .map((n) => n.toString(16).padStart(2, '0'))
            .join(',0x')}]`,
          String.fromCharCode(...toConsume),
        );
        throw err;
      }
    }
  }

  protected enqueue<
    const CMD extends NonNullable<InstanceType<MainCtor>['content']> &
      keyof NonNullable<ConstructorParameters<MainCtor>[0]>,
  >(
    command: CMD,
    properties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >[],
    mainProperties: Omit<
      NonNullable<ConstructorParameters<MainCtor>[0]>,
      'commandId' | 'hasNext'
    >,
  ) {
    return new Promise<InstanceType<MainCtor>[]>((resolve, reject) => {
      const lastProps = properties.pop();
      const commandId = this.#nextId();
      this.#inFlightCommands.push([command, commandId, [], resolve, reject]);
      const rootProps: NonNullable<ConstructorParameters<MainCtor>[0]> = {
        ...mainProperties,
        commandId,
      } as any;
      const toWrite = properties.map((props) => {
        return this.#Main
          .encodeDelimited(
            this.#Main.create({
              ...rootProps,
              hasNext: true,
              [command]: props,
            }),
          )
          .finish();
      });
      toWrite.push(
        this.#Main
          .encodeDelimited(
            this.#Main.create({
              ...rootProps,
              hasNext: true,
              [command]: lastProps,
            }),
          )
          .finish(),
      );
      toWrite.forEach((chunk) => {
        this.port.write(chunk);
      });
    });
  }

  rawCommandExt<
    const CMD extends NonNullable<InstanceType<MainCtor>['content']> &
      keyof NonNullable<ConstructorParameters<MainCtor>[0]>,
  >(
    command: CMD,
    mainProperties: Omit<
      NonNullable<ConstructorParameters<MainCtor>[0]>,
      'commandId' | 'hasNext'
    > | null,
    properties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >,
  ): Promise<InstanceType<MainCtor>[]>;
  rawCommandExt<
    const CMD extends NonNullable<InstanceType<MainCtor>['content']> &
      keyof NonNullable<ConstructorParameters<MainCtor>[0]>,
  >(
    command: CMD,
    mainProperties: Omit<
      NonNullable<ConstructorParameters<MainCtor>[0]>,
      'commandId' | 'hasNext'
    > | null,

    properties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >,
    ...extraProperties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >[]
  ): Promise<InstanceType<MainCtor>[]>;
  rawCommandExt<
    const CMD extends NonNullable<InstanceType<MainCtor>['content']> &
      keyof NonNullable<ConstructorParameters<MainCtor>[0]>,
  >(
    command: CMD,
    mainProperties: Omit<
      NonNullable<ConstructorParameters<MainCtor>[0]>,
      'commandId' | 'hasNext'
    > | null,
    ...properties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >[]
  ): Promise<InstanceType<MainCtor>[]> {
    return this.enqueue(
      command,
      properties,
      mainProperties ?? this.#defaultMainProperties,
    );
  }

  rawCommand<
    const CMD extends NonNullable<InstanceType<MainCtor>['content']> &
      keyof NonNullable<ConstructorParameters<MainCtor>[0]>,
  >(
    command: CMD,
    properties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >,
  ): Promise<InstanceType<MainCtor>[]>;
  rawCommand<
    const CMD extends NonNullable<InstanceType<MainCtor>['content']> &
      keyof NonNullable<ConstructorParameters<MainCtor>[0]>,
  >(
    command: CMD,
    properties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >,
    ...extraProperties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >[]
  ): Promise<InstanceType<MainCtor>[]>;
  rawCommand<
    const CMD extends NonNullable<InstanceType<MainCtor>['content']> &
      keyof NonNullable<ConstructorParameters<MainCtor>[0]>,
  >(
    command: CMD,
    ...properties: NonNullable<
      NonNullable<ConstructorParameters<MainCtor>[0]>[CMD]
    >[]
  ): Promise<InstanceType<MainCtor>[]> {
    return this.enqueue(command, properties, this.#defaultMainProperties);
  }

  async connect() {
    this.port.attachConsumer(this.onData);
    try {
      await this.port.open();
      this.#connected = true;
      this.dispatchEvent(new Event('connect'));
      return this;
    } catch (err) {
      await this.#closeAndReset();
      throw err;
    }
  }
}
