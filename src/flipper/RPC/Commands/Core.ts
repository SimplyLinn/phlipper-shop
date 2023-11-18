import { SUPPORTED_VERSIONS } from './constants';
import { mkFns } from './interfaceBuilder';

const CoreApi = mkFns([
  {
    [SUPPORTED_VERSIONS]: ['0.5', '...'],
    async stopSession(): Promise<unknown> {
      const reses = await this.rawCommand('stopSession', {});
      console.log(reses);
      return reses;
    },
  },
]);

export { CoreApi };
