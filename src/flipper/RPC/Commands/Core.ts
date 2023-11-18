import { SUPPORTED_VERSIONS } from '../_internal/constants';
import { mkFns } from '../_internal/utils';

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
