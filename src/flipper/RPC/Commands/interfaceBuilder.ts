import { SUPPORTED_VERSIONS } from './constants';
import {
  VersionRange,
  FunctionDeclaration,
  AllVersionsInRange,
  ParseVersionRange,
  ParsedVersionRange,
} from './Types';
import type { FlipperRpcVersion } from '../FlipperRpcBase';
import type { ApiInterfaceByVersionMap } from './buildInterface';

export function mkFns<
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

interface FlipperRPCApi<V extends ParsedVersionRange>
  extends FlipperRpcVersion<V> {
  cmds: {
    [key in keyof ApiInterfaceByVersionMap[AllVersionsInRange<V>]]: ApiInterfaceByVersionMap[AllVersionsInRange<V>][key];
  };
}
