import { PB } from '@/flipper/proto-compiled/bootstrap';
import { LATEST as LatestPB } from '@/flipper/proto-compiled';

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

export class FlipperRPCError<Main extends PB.Main> extends FlipperError {
  readonly status: NonNullable<Main['commandStatus']> | -1;
  readonly cmd: Main;

  constructor(cmd: Main) {
    const status =
      typeof cmd.commandStatus === 'number' ? cmd.commandStatus : -1;
    const name = `${new.target.name}(${status})`;
    super(
      name,
      `An error occurred during RPC communication: ${
        status in LatestPB.PB.CommandStatus
          ? LatestPB.PB.CommandStatus[status]
          : 'UNKNOWN STATUS'
      }`,
    );

    this.status = status;
    this.cmd = cmd;
    if (new.target === FlipperRPCError && typeof cmd.commandId === 'number') {
      const newCmd = new FlipperRPCCommandError(cmd);
      Object.assign(this, newCmd);
      Object.assign(Object.getPrototypeOf(this), Object.getPrototypeOf(newCmd));
      Object.setPrototypeOf(
        Object.getPrototypeOf(this),
        FlipperRPCCommandError.prototype,
      );
    }
  }
}

export class FlipperRPCCommandError<
  Main extends PB.Main,
> extends FlipperRPCError<Main> {
  readonly commandId: number;

  constructor(cmd: Main) {
    if (typeof cmd.commandId !== 'number') {
      throw new Error('Missing commandId');
    }
    super(cmd);
    this.commandId = cmd.commandId;
  }
}
