import type { LATEST_VERSION, PROTOBUF_VERSION } from '../proto-compiled';
import type { ResolveOptions, VersionRangeToTuple } from './_internal/types';

export type VersionRange = ParsedVersionRange | [PROTOBUF_VERSION, '...'];

export type ParsedVersionRange =
  | readonly PROTOBUF_VERSION[]
  | readonly [PROTOBUF_VERSION, '...', PROTOBUF_VERSION]
  | PROTOBUF_VERSION;

export type ParseVersionRange<T extends VersionRange> =
  T extends ParsedVersionRange
    ? T
    : T extends [PROTOBUF_VERSION, '...']
    ? [T[0], '...', LATEST_VERSION]
    : never;

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

export type DefaultMainParams<Version extends VersionRange> =
  {} extends ResolveOptions<Version>
    ? [
        defaultMainProperties?: {
          [key in keyof Omit<
            ResolveOptions<Version>,
            'commandId' | 'hasNext'
          >]: ResolveOptions<Version>[key];
        },
      ]
    : [
        defaultMainProperties: {
          [key in keyof Omit<
            ResolveOptions<Version>,
            'commandId' | 'hasNext'
          >]: ResolveOptions<Version>[key];
        },
      ];
