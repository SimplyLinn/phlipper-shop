import type protobuf from 'protobufjs';
import type {
  LATEST_VERSION,
  PROTOBUF_VERSION,
  PROTOBUF_VERSIONS,
  PROTOBUF_VERSION_MAP,
} from '../../proto-compiled';
import type {
  VersionRange,
  AllVersionsInRange,
  ParseVersionRange,
  ParsedVersionRange,
} from '../Types';
import { SUPPORTED_VERSIONS } from './constants';

export type FunctionDeclaration<V extends VersionRange> = {
  readonly [SUPPORTED_VERSIONS]: V;
  readonly [key: string]: Function;
};

export type InFlightCommand<Version extends VersionRange> = readonly [
  cmd: string,
  commandId: number,
  reses: ResolveMain<Version>[],
  resolve: (
    data: PromiseLike<ResolveMain<Version>[]> | ResolveMain<Version>[],
  ) => void,
  reject: (err: any) => void,
];

export type ResolveVersion<Version extends VersionRange> =
  PROTOBUF_VERSION_MAP[AllVersionsInRange<ParseVersionRange<Version>>];

export type ResolveMainCtor<Version extends VersionRange> =
  ResolveVersion<Version>['PB']['Main'];

export type ResolveMain<Version extends VersionRange> = InstanceType<
  ResolveVersion<Version>['PB']['Main']
>;

export type ResolveParameters<Version extends VersionRange> =
  ConstructorParameters<ResolveMainCtor<Version>>;

export type ResolveOptions<Version extends VersionRange> = NonNullable<
  ResolveParameters<Version>[0]
>;

export type CreateArgs<
  Version extends VersionRange,
  Options,
> = {} extends ResolveOptions<Version>
  ? Options extends undefined
    ? [
        options?: Options,
        defaultMainProperties?: {
          [key in keyof Omit<
            ResolveOptions<Version>,
            'commandId' | 'hasNext'
          >]: ResolveOptions<Version>[key];
        },
      ]
    : [
        options: Options,
        defaultMainProperties?: {
          [key in keyof Omit<
            ResolveOptions<Version>,
            'commandId' | 'hasNext'
          >]: ResolveOptions<Version>[key];
        },
      ]
  : [
      options: Options,
      defaultMainProperties: {
        [key in keyof Omit<
          ResolveOptions<Version>,
          'commandId' | 'hasNext'
        >]: ResolveOptions<Version>[key];
      },
    ];

type VersionRangeCollectRecursive<
  T extends PROTOBUF_VERSION,
  Remaining extends readonly PROTOBUF_VERSION[],
  Collected extends readonly PROTOBUF_VERSION[] = [],
> = Remaining extends readonly [
  infer Q extends PROTOBUF_VERSION,
  ...infer R extends readonly PROTOBUF_VERSION[],
]
  ? Q extends T
    ? readonly [...Collected, Q]
    : VersionRangeCollectRecursive<T, R, readonly [...Collected, Q]>
  : // We reached the end of the list, so presumably we had an invalid
    // range ['0.5', '...', '0.3'].
    // This should be an empty tuple.
    [];

type VersionRangeSkipRecursive<
  T extends PROTOBUF_VERSION,
  U extends PROTOBUF_VERSION,
  Remaining extends readonly PROTOBUF_VERSION[] = typeof PROTOBUF_VERSIONS,
> = Remaining extends readonly [
  infer Q,
  ...infer R extends readonly PROTOBUF_VERSION[],
]
  ? Q extends T
    ? // We don't want to include the latest version in the range
      // so we exclude it from the result.
      // Wrap U in Exclude to prevent unions to be exploded, generating unions of tuple ranges.
      Exclude<U, never> extends LATEST_VERSION
      ? readonly [Q, ...R]
      : VersionRangeCollectRecursive<U, Remaining>
    : VersionRangeSkipRecursive<T, U, R>
  : [];

export type VersionRangeToTuple<
  T extends PROTOBUF_VERSION,
  U extends PROTOBUF_VERSION = LATEST_VERSION,
> = VersionRangeSkipRecursive<T, U>;

export type VersionMatchesRange<
  T extends PROTOBUF_VERSION,
  Range extends ParsedVersionRange,
  True = unknown,
  False = never,
> = T extends AllVersionsInRange<Range> ? True : False;

export interface PatchedMainCtor<Version extends VersionRange> {
  /**
   * Constructs a new Main.
   * @param [properties] Properties to set
   */
  new (...params: ResolveParameters<Version>): ResolveMain<Version>;

  /**
   * Creates a new Main instance using the specified properties.
   * @param [properties] Properties to set
   * @returns Main instance
   */
  create(properties?: ResolveOptions<Version>): ResolveMain<Version>;

  /**
   * Encodes the specified Main message. Does not implicitly {@link PB.Main.verify|verify} messages.
   * @param message Main message or plain object to encode
   * @param [writer] Writer to encode to
   * @returns Writer
   */
  encode(
    message: ResolveOptions<Version>,
    writer?: protobuf.Writer,
  ): protobuf.Writer;

  /**
   * Encodes the specified Main message, length delimited. Does not implicitly {@link PB.Main.verify|verify} messages.
   * @param message Main message or plain object to encode
   * @param [writer] Writer to encode to
   * @returns Writer
   */
  encodeDelimited(
    message: ResolveOptions<Version>,
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
  ): ResolveMain<Version>;

  /**
   * Decodes a Main message from the specified reader or buffer, length delimited.
   * @param reader Reader or buffer to decode from
   * @returns Main
   * @throws {Error} If the payload is not a reader or valid buffer
   * @throws {$protobuf.util.ProtocolError} If required fields are missing
   */
  decodeDelimited(reader: protobuf.Reader | Uint8Array): ResolveMain<Version>;

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
  fromObject(object: { [k: string]: any }): ResolveMain<Version>;

  /**
   * Creates a plain object from a Main message. Also converts values to other types if specified.
   * @param message Main
   * @param [options] Conversion options
   * @returns Plain object
   */
  toObject(
    message: ResolveMain<Version>,
    options?: protobuf.IConversionOptions,
  ): { [k: string]: any };

  /**
   * Gets the default type url for Main
   * @param [typeUrlPrefix] your custom typeUrlPrefix(default "type.googleapis.com")
   * @returns The default type url
   */
  getTypeUrl(typeUrlPrefix?: string): string;
}
