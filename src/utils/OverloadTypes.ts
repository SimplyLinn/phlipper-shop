type OverloadProps<TOverload> = Pick<TOverload, keyof TOverload>;
type OverloadUnionRecursive<
  TOverload,
  TPartialOverload = unknown,
> = TOverload extends (this: infer TThis, ...args: infer TArgs) => infer TReturn
  ? // Prevent infinite recursion by stopping recursion when TPartialOverload
    // has accumulated all of the TOverload signatures.
    TPartialOverload extends TOverload
    ? never
    :
        | OverloadUnionRecursive<
            ((this: TThis, ...args: TArgs) => TReturn) &
              OverloadProps<TOverload> &
              TOverload,
            TPartialOverload &
              ((this: TThis, ...args: TArgs) => TReturn) &
              OverloadProps<TOverload>
          >
        | ((this: TThis, ...args: TArgs) => TReturn)
  : never;

export type OverloadUnion<TOverload extends (...args: any[]) => any> = Exclude<
  OverloadUnionRecursive<
    // The "() => never" signature must be hoisted to the "front" of the
    // intersection, for two reasons: a) because recursion stops when it is
    // encountered, and b) it seems to prevent the collapse of subsequent
    // "compatible" signatures (eg. "() => void" into "(a?: 1) => void"),
    // which gives a direct conversion to a union.
    (() => never) & TOverload
  >,
  TOverload extends () => never ? never : () => never
>;

type UnionToIntersection<U> = (U extends any ? (k: U) => void : never) extends (
  k: infer I,
) => void
  ? I
  : never;
type IsUnion<T, True = unknown, False = never> = [T] extends [
  UnionToIntersection<T>,
]
  ? False
  : True;

export type HasOverloads<
  T extends (...args: never[]) => unknown,
  True = unknown,
  False = never,
> = IsUnion<OverloadUnion<T>, True, False>;

type A = OverloadTuple<{ (): number; (a: 43): string }>;
type Test = HasOverloads<{ (): number }, true, false>;

type OverloadTupleRecursive<
  TOverload,
  TPartialOverload = unknown,
> = TOverload extends (...args: infer TArgs) => infer TReturn
  ? // Prevent infinite recursion by stopping recursion when TPartialOverload
    // has accumulated all of the TOverload signatures.
    TPartialOverload extends TOverload
    ? []
    : [
        ...OverloadTupleRecursive<
          TPartialOverload & TOverload,
          TPartialOverload &
            ((...args: TArgs) => TReturn) &
            OverloadProps<TOverload>
        >,
        (...args: TArgs) => TReturn,
      ]
  : [];

export type OverloadTuple<TOverload extends (...args: any[]) => any> =
  TOverload extends () => never
    ? OverloadTupleRecursive<
        // The "() => never" signature must be hoisted to the "front" of the
        // intersection, for two reasons: a) because recursion stops when it is
        // encountered, and b) it seems to prevent the collapse of subsequent
        // "compatible" signatures (eg. "() => void" into "(a?: 1) => void"),
        // which gives a direct conversion to a union.
        (() => never) & TOverload
      >
    : OverloadTupleRecursive<
        // The "() => never" signature must be hoisted to the "front" of the
        // intersection, for two reasons: a) because recursion stops when it is
        // encountered, and b) it seems to prevent the collapse of subsequent
        // "compatible" signatures (eg. "() => void" into "(a?: 1) => void"),
        // which gives a direct conversion to a union.
        (() => never) & TOverload
      > extends [() => never, ...infer T]
    ? T
    : never;

// Inferring a union of parameter tuples or return types is now possible.
export type OverloadParameters<T extends (...args: any[]) => any> =
  OverloadUnion<T> extends infer Q extends (...args: any[]) => any
    ? Parameters<Q>
    : never;
export type OverloadReturnType<T extends (...args: any[]) => any> =
  OverloadUnion<T> extends infer Q extends (...args: any[]) => any
    ? ReturnType<Q>
    : never;
