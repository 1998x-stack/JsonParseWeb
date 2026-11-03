import {createWorkerRuntime} from './runtime.mjs';
const runtime = createWorkerRuntime();
self.addEventListener('message', event => {
  const response = runtime.dispatch(event.data);
  self.postMessage(response);
});
