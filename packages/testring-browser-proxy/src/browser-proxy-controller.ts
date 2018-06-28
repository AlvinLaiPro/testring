import { ChildProcess } from 'child_process';

import {
    ITransport,
    IBrowserProxyController,
    IBrowserProxyCommand,
    IBrowserProxyCommandResponse,
    IBrowserProxyPendingCommand,
    BrowserProxyMessageTypes,
    BrowserProxyPlugins
} from '@testring/types';
import { PluggableModule } from '@testring/pluggable-module';

const nanoid = require('nanoid');

export class BrowserProxyController extends PluggableModule implements IBrowserProxyController {
    constructor(
        private transportInstance: ITransport,
        private workerCreator: (onActionPluginPath: string, config: any) => ChildProcess,
    ) {
        super([
            BrowserProxyPlugins.getPlugin,
        ]);

        this.registerResponseListener();
    }

    private worker: ChildProcess;

    private workerId: string;

    private pendingCommandsQueue: Set<IBrowserProxyPendingCommand> = new Set();

    private pendingCommandsPool: Map<string, IBrowserProxyPendingCommand> = new Map();

    private registerResponseListener() {
        this.transportInstance.on(
            BrowserProxyMessageTypes.response,
            (response) => this.onCommandResponse(response),
        );
    }

    private onCommandResponse(response: IBrowserProxyCommandResponse): void {
        const { uid, exception } = response;
        const item = this.pendingCommandsPool.get(uid);

        if (item) {
            const { resolve, reject } = item;

            this.pendingCommandsPool.delete(uid);

            if (exception) {
                return reject(exception);
            }

            return resolve();
        } else {
            throw new ReferenceError(`Cannot find command with uid ${uid}`);
        }
    }

    private onProxyConnect(): void {
        this.pendingCommandsQueue.forEach((item) => this.send(item));
        this.pendingCommandsQueue.clear();
    }

    private onProxyDisconnect(): void {
        this.pendingCommandsPool.forEach((item) => this.pendingCommandsQueue.add(item));
        this.pendingCommandsPool.clear();
    }

    private onExit = (): void => {
        delete this.workerId;

        this.onProxyDisconnect();
        this.spawn();
    };

    private send(item: IBrowserProxyPendingCommand): void {
        const { command } = item;
        const uid = nanoid();

        this.pendingCommandsPool.set(uid, item);

        this.transportInstance.send(
            this.workerId,
            BrowserProxyMessageTypes.execute,
            {
                uid,
                command,
            },
        );
    }

    public async spawn(): Promise<number> {
        this.kill();

        if (typeof this.workerCreator === 'function') {
            // TODO add types to browser proxy plugin config
            const externalPlugin = await this.callHook(BrowserProxyPlugins.getPlugin, 'default');

            this.worker = this.workerCreator(externalPlugin.plugin, externalPlugin.config);
        } else {
            throw new Error(`Unsupported worker type "${typeof this.workerCreator}"`);
        }

        this.workerId = `proxy-${this.worker.pid}`;

        this.transportInstance.registerChildProcess(this.workerId, this.worker);
        this.worker.on('exit', this.onExit);
        this.onProxyConnect();

        return this.worker.pid;
    }

    public execute(command: IBrowserProxyCommand): Promise<void> {
        return new Promise((resolve, reject) => {
            const item: IBrowserProxyPendingCommand = {
                resolve,
                reject,
                command,
            };

            if (this.worker && this.worker.connected) {
                this.send(item);
            } else {
                this.pendingCommandsQueue.add(item);
            }
        });
    }

    public kill(): void {
        if (this.worker && this.worker.connected) {
            this.worker.removeListener('exit', this.onExit);
            this.worker.kill();
        }
    }
}
