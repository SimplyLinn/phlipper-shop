import {
  LATEST_VERSION,
  PROTOBUF_VERSION,
  PROTOBUF_VERSIONS,
} from '@/flipper/proto-compiled';
import { SUPPORTED_VERSIONS } from './constants';
import {
  VersionMatchesRange,
  VersionRange,
  FunctionDeclaration,
  AllVersionsInRange,
  ParseVersionRange,
} from './Types';
import {
  FlipperRpcBase,
  DefaultMainParams,
  ResolveMainCtor,
} from '../FlipperRpcBase';
import { FlipperRpcSerialPort } from '../FlipperRpcSerialPort';
import { SystemApi } from './System';
import { CoreApi } from './Core';

function mkFns<
  const T extends {
    [key in keyof V]: FunctionDeclaration<V[key]>;
  },
  const V extends readonly [VersionRange, ...VersionRange[]],
>(
  o: T & {
    [key in keyof V]: { readonly [SUPPORTED_VERSIONS]: V[key] } & ThisType<
      FlipperRPCApi<ParseVersionRange<V[key]>>
    >;
  },
): T {
  return o;
}

/**
 * Workaround for
 * > Exported variable 'fns' has or is using name 'SUPPORTED_VERSIONS' from external module "[./Core.ts](./Core.ts)" but cannot be named.
 * > ts(4023)
 *
 * if you can replace the `a(...Api1, ...Api2)` with `[...Api1, ...Api2] as const` you can safely remove this function.
 */
function a<
  T extends readonly { readonly [SUPPORTED_VERSIONS]: VersionRange }[],
>(
  ...args: T
): Readonly<{
  [key in keyof T]: {
    readonly [SUPPORTED_VERSIONS]: T[key][SUPPORTED_VERSIONS];
  } & {
    readonly [key2 in keyof Omit<T[key], SUPPORTED_VERSIONS>]: Omit<
      T[key],
      SUPPORTED_VERSIONS
    >[key2];
  } extends infer U
    ? { readonly [key2 in keyof U]: U[key2] }
    : never;
}> {
  return args as any;
}

const fns = a(...CoreApi, ...SystemApi);

type CleanupInterface<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? {
      [key in Exclude<keyof I, SUPPORTED_VERSIONS>]: I[key];
    }
  : never;

type ApiInterfaceByVersionMap_impl<T extends readonly unknown[]> = {
  [Version in PROTOBUF_VERSION]: CleanupInterface<
    {
      [key in keyof T]: T[key] extends FunctionDeclaration<any>
        ? VersionMatchesRange<Version, T[key][SUPPORTED_VERSIONS], T[key]>
        : never;
    }[number]
  >;
};

export type ApiInterfaceByVersionMap = ApiInterfaceByVersionMap_impl<
  typeof fns
>;

export class FlipperRPCApi<Version extends VersionRange> extends FlipperRpcBase<
  ResolveMainCtor<Version>
> {
  version: AllVersionsInRange<ParseVersionRange<Version>>;

  constructor(
    portId: string,
    version: AllVersionsInRange<ParseVersionRange<Version>>,
    Main: ResolveMainCtor<Version>,
    ...[defaultMainProperties]: DefaultMainParams<ResolveMainCtor<Version>>
  );
  constructor(
    port: FlipperRpcSerialPort,
    version: AllVersionsInRange<ParseVersionRange<Version>>,
    Main: ResolveMainCtor<Version>,
    ...[defaultMainProperties]: DefaultMainParams<ResolveMainCtor<Version>>
  );
  constructor(
    portOrId: FlipperRpcSerialPort | string,
    version: AllVersionsInRange<ParseVersionRange<Version>>,
    Main: ResolveMainCtor<Version>,
    ...[defaultMainProperties]: DefaultMainParams<ResolveMainCtor<Version>>
  );
  constructor(
    portOrId: FlipperRpcSerialPort | string,
    version: AllVersionsInRange<ParseVersionRange<Version>>,
    Main: ResolveMainCtor<Version>,
    ...defaultMainProperties: DefaultMainParams<ResolveMainCtor<Version>>
  ) {
    super(portOrId, Main, ...defaultMainProperties);

    this.version = version;
  }

  get cmds(): {
    [key in keyof ApiInterfaceByVersionMap[AllVersionsInRange<
      ParseVersionRange<Version>
    >]]: ApiInterfaceByVersionMap[AllVersionsInRange<
      ParseVersionRange<Version>
    >][key];
  } {
    if (this === FlipperRPCApi.prototype || !(this instanceof FlipperRPCApi)) {
      throw new TypeError(
        `Method get FlipperRPCApi.prototype.cmds called on incompatible receiver ${String(
          this,
        )}`,
      );
    }
    const { version } = this;
    const cmds = Object.fromEntries(
      fns
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
}
const cmdGetter = Object.getOwnPropertyDescriptor(
  FlipperRPCApi.prototype,
  'cmds',
)!.get!;
Object.defineProperty(cmdGetter, 'name', {
  value: 'cmds',
  writable: false,
  enumerable: false,
  configurable: true,
});
Object.defineProperty(FlipperRPCApi.prototype, Symbol.toStringTag, {
  get(this: FlipperRPCApi<any>) {
    if (this === FlipperRPCApi.prototype || !(this instanceof FlipperRPCApi)) {
      return undefined;
    }
    return FlipperRPCApi.name;
  },
  enumerable: false,
  configurable: true,
});
