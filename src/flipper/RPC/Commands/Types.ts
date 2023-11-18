import type {
  PROTOBUF_VERSION,
  PROTOBUF_VERSIONS,
} from '@/flipper/proto-compiled';
import { SUPPORTED_VERSIONS } from './constants';

export type ParsedVersionRange =
  | readonly PROTOBUF_VERSION[]
  | readonly [PROTOBUF_VERSION, '...', PROTOBUF_VERSION]
  | PROTOBUF_VERSION;

export type VersionRange = ParsedVersionRange | [PROTOBUF_VERSION, '...'];

export type ParseVersionRange<T extends VersionRange> =
  T extends ParsedVersionRange
    ? T
    : T extends [PROTOBUF_VERSION, '...']
    ? [T[0], '...', LATEST_VERSION]
    : never;

type Fn<This> = (this: This, ...args: any[]) => any;

export type FunctionDeclaration<V extends VersionRange> = {
  readonly [SUPPORTED_VERSIONS]: V;
  readonly [key: string]: Function;
};

type PROTOBUF_VERSIONS = typeof PROTOBUF_VERSIONS;

type LATEST_VERSION = PROTOBUF_VERSIONS extends readonly [...any[], infer Q]
  ? Q
  : never;

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
  Remaining extends readonly PROTOBUF_VERSION[] = PROTOBUF_VERSIONS,
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

type VersionRangeToTuple<
  T extends PROTOBUF_VERSION,
  U extends PROTOBUF_VERSION = LATEST_VERSION,
> = VersionRangeSkipRecursive<T, U>;

export type AllVersionsInRange<Range extends ParsedVersionRange> =
  ParsedVersionRange extends Range
    ? PROTOBUF_VERSION
    : Range extends PROTOBUF_VERSION[]
    ? Range[number]
    : Range extends PROTOBUF_VERSION
    ? Range
    : Range extends [PROTOBUF_VERSION, '...']
    ? VersionRangeToTuple<Range[0]>[number]
    : Range extends [PROTOBUF_VERSION, '...', PROTOBUF_VERSION]
    ? VersionRangeToTuple<Range[0], Range[2]>[number]
    : never;

export type VersionMatchesRange<
  T extends PROTOBUF_VERSION,
  Range extends ParsedVersionRange,
  True = unknown,
  False = never,
> = T extends AllVersionsInRange<Range> ? True : False;
