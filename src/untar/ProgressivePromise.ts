/**
Returns a Promise decorated with a progress() event.
*/
export class ProgressivePromise<T, P = T extends ReadonlyArray<infer Q> ? Q : unknown> extends Promise<T> {
  private readonly progressCallbacks: ((value: P) => void)[] = [];
  private readonly progressHistory: P[] = [];

  constructor(
    fn: (
      resolve: (value: T | PromiseLike<T>) => void,
      reject: (reason?: unknown) => void,
      doProgress: (value: P) => void,
    ) => void,
  ) {
    const doProgress = (value: P) => {
      for (let i = 0, l = this.progressCallbacks.length; i < l; ++i) {
        this.progressCallbacks[i](value);
      }

      this.progressHistory.push(value);
    };
    super((resolve, reject) => fn(resolve, reject, doProgress));
  }

  progress(cb: (value: P) => void): this {
    if (typeof cb !== 'function') {
      throw new Error('cb is not a function.');
    }

    // Report the previous progress history
    for (let i = 0, l = this.progressHistory.length; i < l; ++i) {
      cb(this.progressHistory[i]);
    }

    this.progressCallbacks.push(cb);
    return this;
  }

  then<TResult1, TResult2>(
    onSuccess?:
      | ((value: any) => TResult1 | PromiseLike<TResult1>)
      | null
      | undefined,
    onFail?: (reason: any) => TResult2 | PromiseLike<TResult2>,
    onProgress?: (value: P) => void,
  ): ProgressivePromise<TResult1 | TResult2, P> {
    const next = super.then(onSuccess, onFail) as ProgressivePromise<
      TResult1 | TResult2,
      P
    >;
    Object.setPrototypeOf(next, ProgressivePromise.prototype);
    Object.assign(next, {
      progressHistory: this.progressHistory,
      progressCallbacks: this.progressCallbacks,
    });
    if (onProgress) {
      next.progress(onProgress);
    }
    return next;
  }
}
