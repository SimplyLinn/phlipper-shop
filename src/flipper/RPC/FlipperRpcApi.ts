import protobuf from 'protobufjs';
import {
  PROTOBUF_VERSIONS,
  LATEST_VERSION,
  FIRST_VERSION,
  PROTOBUF_VERSION,
} from '../proto-compiled';
import {
  VersionRange,
  AllVersionsInRange,
  ParseVersionRange,
  DefaultMainParams,
} from './Types';
import { ApiInterfaceByVersionMap, apiDefs } from './Commands';
import { SUPPORTED_VERSIONS } from './_internal/constants';
import { FlipperRpcSerialPort } from './Serial/FlipperRpcSerialPort';
import {
  FlipperRpcEventEmitter,
  RpcCommandResponseEvent,
  RpcDataEvent,
} from './RpcEventEmitter';
import {
  CreateArgs,
  InFlightCommand,
  PatchedMainCtor,
  ResolveMainCtor,
} from './_internal/types';
import { matchProtobufVersion } from './_internal/matchProtobufVersion';
import { appendReaderChunk } from './_internal/utils';

const MAX_ID = 2 ** 32 - 1;

export class FlipperRpcApi<
  Version extends VersionRange,
> extends FlipperRpcEventEmitter<Version> {
  #Main: PatchedMainCtor<Version>;
  static readonly serialFilters = [
    { usbVendorId: 0x0483, usbProductId: 0x5740 },
  ];
  readonly port: FlipperRpcSerialPort;
  static startRpcSession = new Uint8Array([
    115, 116, 97, 114, 116, 95, 114, 112, 99, 95, 115, 101, 115, 115, 105, 111,
    110, 13, 10,
  ]);
  #reader = new protobuf.Reader(new Uint8Array(0));
  #inFlightCommands: InFlightCommand<Version>[] = [];
  #id = 1;
  #connected = false;
  #defaultMainProperties: Omit<
    NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
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

  private constructor(
    portId: string,
    version: AllVersionsInRange<ParseVersionRange<Version>>,
    Main: ResolveMainCtor<Version>,
    ...[defaultMainProperties]: DefaultMainParams<Version>
  );
  private constructor(
    port: FlipperRpcSerialPort,
    version: AllVersionsInRange<ParseVersionRange<Version>>,
    Main: ResolveMainCtor<Version>,
    ...[defaultMainProperties]: DefaultMainParams<Version>
  );
  private constructor(
    portOrId: FlipperRpcSerialPort | string,
    version: AllVersionsInRange<ParseVersionRange<Version>>,
    Main: ResolveMainCtor<Version>,
    ...[defaultMainProperties]: DefaultMainParams<Version>
  );
  private constructor(
    portOrId: FlipperRpcSerialPort | string,
    readonly version: AllVersionsInRange<ParseVersionRange<Version>>,
    Main: ResolveMainCtor<Version>,
    ...[defaultMainProperties]: DefaultMainParams<Version>
  ) {
    super();
    this.#defaultMainProperties = (defaultMainProperties ?? {}) as Omit<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
      'commandId' | 'hasNext'
    >;
    this.#Main = Main as PatchedMainCtor<Version>;
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

  private enqueue<
    const CMD extends NonNullable<
      InstanceType<ResolveMainCtor<Version>>['content']
    > &
      keyof NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
  >(
    command: CMD,
    properties: NonNullable<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>[CMD]
    >[],
    mainProperties: Omit<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
      'commandId' | 'hasNext'
    >,
  ) {
    return new Promise<InstanceType<ResolveMainCtor<Version>>[]>(
      (resolve, reject) => {
        const lastProps = properties.pop();
        const commandId = this.#nextId();
        this.#inFlightCommands.push([command, commandId, [], resolve, reject]);
        const rootProps: NonNullable<
          ConstructorParameters<ResolveMainCtor<Version>>[0]
        > = {
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
      },
    );
  }

  rawCommandExt<
    const CMD extends NonNullable<
      InstanceType<ResolveMainCtor<Version>>['content']
    > &
      keyof NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
  >(
    command: CMD,
    mainProperties: Omit<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
      'commandId' | 'hasNext'
    > | null,
    properties: NonNullable<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>[CMD]
    >,
  ): Promise<InstanceType<ResolveMainCtor<Version>>[]>;
  rawCommandExt<
    const CMD extends NonNullable<
      InstanceType<ResolveMainCtor<Version>>['content']
    > &
      keyof NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
  >(
    command: CMD,
    mainProperties: Omit<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
      'commandId' | 'hasNext'
    > | null,

    properties: NonNullable<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>[CMD]
    >,
    ...extraProperties: NonNullable<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>[CMD]
    >[]
  ): Promise<InstanceType<ResolveMainCtor<Version>>[]>;
  rawCommandExt<
    const CMD extends NonNullable<
      InstanceType<ResolveMainCtor<Version>>['content']
    > &
      keyof NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
  >(
    command: CMD,
    mainProperties: Omit<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
      'commandId' | 'hasNext'
    > | null,
    ...properties: NonNullable<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>[CMD]
    >[]
  ): Promise<InstanceType<ResolveMainCtor<Version>>[]> {
    return this.enqueue(
      command,
      properties,
      mainProperties ?? this.#defaultMainProperties,
    );
  }

  rawCommand<
    const CMD extends NonNullable<
      InstanceType<ResolveMainCtor<Version>>['content']
    > &
      keyof NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
  >(
    command: CMD,
    properties: NonNullable<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>[CMD]
    >,
  ): Promise<InstanceType<ResolveMainCtor<Version>>[]>;
  rawCommand<
    const CMD extends NonNullable<
      InstanceType<ResolveMainCtor<Version>>['content']
    > &
      keyof NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
  >(
    command: CMD,
    properties: NonNullable<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>[CMD]
    >,
    ...extraProperties: NonNullable<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>[CMD]
    >[]
  ): Promise<InstanceType<ResolveMainCtor<Version>>[]>;
  rawCommand<
    const CMD extends NonNullable<
      InstanceType<ResolveMainCtor<Version>>['content']
    > &
      keyof NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>,
  >(
    command: CMD,
    ...properties: NonNullable<
      NonNullable<ConstructorParameters<ResolveMainCtor<Version>>[0]>[CMD]
    >[]
  ): Promise<InstanceType<ResolveMainCtor<Version>>[]> {
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

  get cmds(): {
    [key in keyof ApiInterfaceByVersionMap[AllVersionsInRange<
      ParseVersionRange<Version>
    >]]: ApiInterfaceByVersionMap[AllVersionsInRange<
      ParseVersionRange<Version>
    >][key];
  } {
    if (this === FlipperRpcApi.prototype || !(this instanceof FlipperRpcApi)) {
      throw new TypeError(
        `Method get FlipperRPCApi.prototype.cmds called on incompatible receiver ${String(
          this,
        )}`,
      );
    }
    const { version } = this;
    const cmds = Object.fromEntries(
      apiDefs
        .filter((f) => {
          const versionRange = f[SUPPORTED_VERSIONS] as VersionRange;
          if (typeof versionRange === 'string') {
            return versionRange === version;
          }
          const targetIndex = PROTOBUF_VERSIONS.indexOf(version);
          if (targetIndex < 0) {
            return false;
          }
          const minIndex = PROTOBUF_VERSIONS.indexOf(versionRange[0]);
          const maxIndex = PROTOBUF_VERSIONS.indexOf(
            versionRange[2] ?? LATEST_VERSION,
          );
          if (minIndex < 0 || maxIndex < 0) {
            return false;
          }
          return targetIndex >= minIndex && targetIndex <= maxIndex;
        })
        .flatMap((f) =>
          Object.entries(f).map(([key, val]) => [key, val.bind(this)] as const),
        ),
    ) as ApiInterfaceByVersionMap[AllVersionsInRange<
      ParseVersionRange<Version>
    >];
    Object.defineProperty(this, 'cmds', {
      value: cmds,
      writable: true,
      enumerable: false,
      configurable: true,
    });
    return cmds;
  }

  static async create(
    port: FlipperRpcSerialPort,
    ...[options, defaultMainProperties]: CreateArgs<
      [FIRST_VERSION, '...', LATEST_VERSION],
      null | undefined
    >
  ): Promise<FlipperRpcApi<[FIRST_VERSION, '...', LATEST_VERSION]>>;
  static async create<const Version extends PROTOBUF_VERSION>(
    port: FlipperRpcSerialPort,
    ...[options, defaultMainProperties]: CreateArgs<
      Version,
      | { version: Version; force?: boolean }
      | { version: Version; requireExactMatch?: boolean }
    >
  ): Promise<FlipperRpcApi<Version>>;
  static async create<const MinV extends PROTOBUF_VERSION>(
    port: FlipperRpcSerialPort,
    ...[options, defaultMainProperties]: CreateArgs<
      [MinV, '...', LATEST_VERSION],
      | { minVersion: MinV; requireExactMatch?: boolean }
      | {
          minVersion: MinV;
          fallbackVersion?: AllVersionsInRange<[MinV, '...', LATEST_VERSION]>;
        }
    >
  ): Promise<FlipperRpcApi<[MinV, '...', LATEST_VERSION]>>;
  static async create<const MaxV extends PROTOBUF_VERSION>(
    port: FlipperRpcSerialPort,
    ...[options, defaultMainProperties]: CreateArgs<
      [FIRST_VERSION, '...', MaxV],
      | { maxVersion: MaxV; requireExactMatch?: boolean }
      | {
          maxVersion: MaxV;
          fallbackVersion?: AllVersionsInRange<[FIRST_VERSION, '...', MaxV]>;
        }
    >
  ): Promise<FlipperRpcApi<[FIRST_VERSION, '...', MaxV]>>;
  static async create<
    const MinV extends PROTOBUF_VERSION,
    const MaxV extends PROTOBUF_VERSION,
  >(
    port: FlipperRpcSerialPort,
    ...[options, defaultMainProperties]: CreateArgs<
      [MinV, '...', MaxV],
      | { minVersion: MinV; maxVersion: MaxV; requireExactMatch?: boolean }
      | {
          maxVersion: MaxV;
          fallbackVersion?: AllVersionsInRange<[MinV, '...', MaxV]>;
        }
    >
  ): Promise<FlipperRpcApi<[MinV, '...', MaxV]>>;
  static async create(
    port: FlipperRpcSerialPort,
    ...[options, ...defaultMainProperties]: CreateArgs<
      [FIRST_VERSION, '...', LATEST_VERSION],
      | {
          requireExactMatch?: boolean;
          fallbackVersion?: PROTOBUF_VERSION;
        }
      | null
      | undefined
    >
  ): Promise<FlipperRpcApi<[FIRST_VERSION, '...', LATEST_VERSION]>>;
  static async create(
    port: FlipperRpcSerialPort,
    ...[options, ...defaultMainProperties]: CreateArgs<
      [FIRST_VERSION, '...', LATEST_VERSION],
      | { version: PROTOBUF_VERSION; force?: boolean }
      | { version: PROTOBUF_VERSION; requireExactMatch?: boolean }
      | {
          minVersion?: PROTOBUF_VERSION;
          maxVersion?: PROTOBUF_VERSION;
          requireExactMatch?: boolean;
          fallbackVersion?: PROTOBUF_VERSION;
        }
      | null
      | undefined
    >
  ): Promise<FlipperRpcApi<[FIRST_VERSION, '...', LATEST_VERSION]>> {
    const { version, protobuf, matchMode } = await matchProtobufVersion(
      port,
      options,
    );
    return new FlipperRpcApi<[FIRST_VERSION, '...', LATEST_VERSION]>(
      port,
      version,
      protobuf.PB.Main,
      ...defaultMainProperties,
    );
  }
}
const cmdGetter = Object.getOwnPropertyDescriptor(
  FlipperRpcApi.prototype,
  'cmds',
)!.get!;
Object.defineProperty(cmdGetter, 'name', {
  value: 'cmds',
  writable: false,
  enumerable: false,
  configurable: true,
});
Object.defineProperty(FlipperRpcApi.prototype, Symbol.toStringTag, {
  get(this: FlipperRpcApi<any>) {
    if (this === FlipperRpcApi.prototype || !(this instanceof FlipperRpcApi)) {
      return undefined;
    }
    return FlipperRpcApi.name;
  },
  enumerable: false,
  configurable: true,
});
