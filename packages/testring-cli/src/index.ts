import * as process from 'process';
import { LoggerServer, loggerClientLocal } from '@testring/logger';
import { TestRunController } from '@testring/test-run-controller';
import { applyPlugins } from '@testring/plugin-api';
import { TestsFinder } from '@testring/test-finder';
import { TestWorker } from '@testring/test-worker';
import { getConfig } from '@testring/cli-config';
import { transport } from '@testring/transport';
import { browserProxyControllerFactory } from '@testring/browser-proxy';

// CLI entry point, it makes all initialization job and
// handles all errors, that was not cached inside framework

export const runTests = async (argv: typeof process.argv) => {
    const userConfig = await getConfig(argv);

    const loggerServer = new LoggerServer(userConfig, transport, process.stdout);
    const testFinder = new TestsFinder();
    const testWorker = new TestWorker(transport);
    const testRunController = new TestRunController(userConfig, testWorker);
    const browserProxyController = browserProxyControllerFactory(transport);

    applyPlugins({
        logger: loggerServer,
        testFinder: testFinder,
        testWorker: testWorker,
        browserProxy: browserProxyController,
        testRunController: testRunController,
    }, userConfig);

    loggerClientLocal.log(`User config: ${JSON.stringify(userConfig)}`);
    const tests = await testFinder.find(userConfig.tests);
    loggerClientLocal.info(`Found ${tests.length} test(s) to run.`);
    const testRunResult = await testRunController.runQueue(tests);

    if (testRunResult) {
        throw new Error(`Failed ${testRunResult.length}/${tests.length} tests.`);
    }
};

export const runCLI = (argv: typeof process.argv) => {
    runTests(argv).catch((exception) => {
        loggerClientLocal.error(exception);
        process.exit(1);
    });
};
