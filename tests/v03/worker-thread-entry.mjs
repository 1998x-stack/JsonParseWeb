import {parentPort} from 'node:worker_threads';
import {createWorkerRuntime} from '../../src/worker/runtime.mjs';
const runtime=createWorkerRuntime();
parentPort.on('message',request=>parentPort.postMessage(runtime.dispatch(request)));
