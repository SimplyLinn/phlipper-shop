import { PB } from '@/flipper/proto-compiled/bootstrap';
import { VersionRange } from '.';
import { ResolveMain, ResolveVersion } from './_internal/types';
export class FlipperError extends Error {
  constructor(
    name?: string | null,
    ...args: [message?: string, options?: ErrorOptions]
  ) {
    super(...args);
    const newProto = Object.create(Object.getPrototypeOf(this));
    newProto.name = name || new.target.name;
    Object.setPrototypeOf(this, newProto);
  }
}

export class FlipperRPCError<
  Version extends VersionRange,
> extends FlipperError {
  readonly status: NonNullable<ResolveMain<Version>['commandStatus']> | -1;

  constructor(
    readonly cmd: ResolveMain<Version>,
    CommandStatus: ResolveVersion<Version>['PB']['CommandStatus'],
  ) {
    const status =
      typeof cmd.commandStatus === 'number' ? cmd.commandStatus : -1;
    const name = `${new.target.name}(${status})`;
    super(
      name,
      `An error occurred during RPC communication: ${
        status in CommandStatus ? CommandStatus[status] : 'UNKNOWN STATUS'
      }`,
    );

    this.status = status;
    this.cmd = cmd;
    if (new.target === FlipperRPCError && typeof cmd.commandId === 'number') {
      const newCmd = new FlipperRPCCommandError(cmd, CommandStatus);
      Object.assign(newCmd, this);
      return newCmd;
    }
  }
}

export class FlipperRPCCommandError<
  Version extends VersionRange,
> extends FlipperRPCError<Version> {
  readonly commandId: number;

  constructor(
    cmd: ResolveMain<Version>,
    CommandStatus: ResolveVersion<Version>['PB']['CommandStatus'],
  ) {
    if (typeof cmd.commandId !== 'number') {
      throw new Error('Missing commandId');
    }
    super(cmd, CommandStatus);
    this.commandId = cmd.commandId;
  }
}
