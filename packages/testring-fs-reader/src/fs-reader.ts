import { IFSReader, IFile, FSReaderPlugins } from '@testring/types';
import { PluggableModule } from '@testring/pluggable-module';
import { locateFiles } from './file-locator';
import { resolveFile } from './file-resolver';
import { loggerClientLocal } from '@testring/logger';


export class FSReader extends PluggableModule implements IFSReader {

    constructor() {
        super([
            FSReaderPlugins.beforeResolve,
            FSReaderPlugins.afterResolve
        ]);
    }

    public async find(pattern: string): Promise<IFile[]> {
        const tests = await locateFiles(pattern);
        const testsAfterPlugin = await this.callHook(FSReaderPlugins.beforeResolve, tests);

        if (!testsAfterPlugin || testsAfterPlugin.length === 0) {
            loggerClientLocal.error(`No test files found by pattern: ${pattern}`);
            throw new Error(`No test files found by pattern: ${pattern}`);
        }

        const resolverTests = await resolveFile(testsAfterPlugin);

        return await this.callHook(
            FSReaderPlugins.afterResolve,
            resolverTests
        );
    }
}
