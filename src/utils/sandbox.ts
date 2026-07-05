import { BROWSER_SANDBOX_LIMITS } from "../config/limits";

type SandboxReadyMessage = { runId: string; ready: true };
type SandboxResultMessage = {
  runId: string;
  success: boolean;
  output?: string;
  error?: string;
};
type SandboxMessage = SandboxReadyMessage | SandboxResultMessage;

function createSandboxRunId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `sandbox-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getParentMessageOrigin(): string {
  const origin = window.location.origin;
  return origin && origin !== "null" ? origin : "*";
}

function isSandboxMessage(
  value: unknown,
  runId: string,
): value is SandboxMessage {
  if (!value || typeof value !== "object") return false;
  const data = value as Record<string, unknown>;
  return (
    data.runId === runId &&
    (data.ready === true || typeof data.success === "boolean")
  );
}

function isSandboxReadyMessage(
  message: SandboxMessage,
): message is SandboxReadyMessage {
  return "ready" in message && message.ready === true;
}

function createSandboxWorkerScript(): string {
  return `
    const NETWORK_DISABLED_ERROR = 'Network access is disabled in the browser sandbox.';
    const stringifyValue = (value) => {
      if (typeof value !== 'object' || value === null) return String(value);
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };
    const blockNetwork = () => {
      throw new Error(NETWORK_DISABLED_ERROR);
    };
    const installBlockedGlobal = (name, value) => {
      try {
        Object.defineProperty(self, name, {
          configurable: false,
          writable: false,
          value,
        });
      } catch {
        try {
          self[name] = value;
        } catch {}
      }
    };

    installBlockedGlobal('fetch', blockNetwork);
    installBlockedGlobal('importScripts', blockNetwork);
    installBlockedGlobal('Worker', class Worker {
      constructor() {
        blockNetwork();
      }
    });
    installBlockedGlobal('SharedWorker', class SharedWorker {
      constructor() {
        blockNetwork();
      }
    });
    installBlockedGlobal('XMLHttpRequest', class XMLHttpRequest {
      constructor() {
        blockNetwork();
      }
    });
    installBlockedGlobal('WebSocket', class WebSocket {
      constructor() {
        blockNetwork();
      }
    });
    installBlockedGlobal('EventSource', class EventSource {
      constructor() {
        blockNetwork();
      }
    });

    self.addEventListener('message', (event) => {
      const data = event.data || {};
      if (typeof data.runId !== 'string' || typeof data.code !== 'string') return;

      const MAX_LOGS = 200;
      const MAX_OUTPUT_LENGTH = Number(data.maxOutputChars) || ${BROWSER_SANDBOX_LIMITS.maxOutputChars};
      let outputLength = 0;
      const logs = [];
      const pushLog = (value) => {
        const text = String(value);
        outputLength += text.length;
        if (logs.length < MAX_LOGS && outputLength <= MAX_OUTPUT_LENGTH) {
          logs.push(text);
        }
      };
      const formatArgs = (args) => args.map(stringifyValue).join(' ');
      const safeConsole = {
        log: (...args) => pushLog(formatArgs(args)),
        warn: (...args) => pushLog('WARN: ' + formatArgs(args)),
        error: (...args) => pushLog('ERROR: ' + formatArgs(args)),
        info: (...args) => pushLog('INFO: ' + formatArgs(args)),
      };

      try {
        const fn = new Function('console', data.code);
        const result = fn(safeConsole);

        if (result !== undefined) {
          pushLog(stringifyValue(result));
        }

        self.postMessage({
          runId: data.runId,
          success: true,
          output: logs.join('\\n'),
        });
      } catch (err) {
        self.postMessage({
          runId: data.runId,
          success: false,
          error: String(err),
          output: logs.join('\\n'),
        });
      }
    });
  `;
}

export function createSandboxHtml(runId: string, parentOrigin: string): string {
  const serializedRunId = JSON.stringify(runId);
  const serializedParentOrigin = JSON.stringify(parentOrigin);
  const serializedWorkerScript = JSON.stringify(createSandboxWorkerScript());

  return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' blob:; connect-src 'none'; img-src 'none'; media-src 'none'; worker-src blob:; frame-src 'none'; object-src 'none'; form-action 'none'; base-uri 'none'">
        <script>
          const RUN_ID = ${serializedRunId};
          const PARENT_ORIGIN = ${serializedParentOrigin};
          const WORKER_SCRIPT = ${serializedWorkerScript};
          const EXECUTION_TIMEOUT_MS = ${BROWSER_SANDBOX_LIMITS.executionTimeoutMs};
          const MAX_OUTPUT_CHARS = ${BROWSER_SANDBOX_LIMITS.maxOutputChars};
          let activeWorker = null;

          const stopActiveWorker = () => {
            if (activeWorker) {
              activeWorker.terminate();
              activeWorker = null;
            }
          };

          window.addEventListener('message', (e) => {
            const data = e.data || {};
            if (data.runId !== RUN_ID || typeof data.code !== 'string') return;

            stopActiveWorker();
            let workerUrl = '';
            try {
              const workerBlob = new Blob([WORKER_SCRIPT], { type: 'text/javascript' });
              workerUrl = URL.createObjectURL(workerBlob);
              const worker = new Worker(workerUrl);
              activeWorker = worker;
              let settled = false;
              let timeoutId = 0;

              const finish = (payload) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timeoutId);
                worker.terminate();
                if (activeWorker === worker) {
                  activeWorker = null;
                }
                if (workerUrl) {
                  URL.revokeObjectURL(workerUrl);
                }
                parent.postMessage({ runId: RUN_ID, ...payload }, PARENT_ORIGIN);
              };

              worker.onmessage = (event) => {
                const result = event.data || {};
                if (result.runId !== RUN_ID) return;
                finish({
                  success: result.success === true,
                  output: typeof result.output === 'string' ? result.output : '',
                  error: typeof result.error === 'string' ? result.error : undefined,
                });
              };
              worker.onerror = (event) => {
                event.preventDefault();
                finish({
                  success: false,
                  error: event.message || 'Worker execution failed.',
                  output: '',
                });
              };
              timeoutId = window.setTimeout(() => {
                finish({
                  success: false,
                  error: 'JavaScript execution timed out.',
                  output: '',
                });
              }, EXECUTION_TIMEOUT_MS);
              worker.postMessage({
                runId: RUN_ID,
                code: data.code,
                maxOutputChars: MAX_OUTPUT_CHARS,
              });
            } catch (err) {
              if (workerUrl) {
                URL.revokeObjectURL(workerUrl);
              }
              parent.postMessage({
                runId: RUN_ID,
                success: false,
                error: String(err),
                output: '',
              }, PARENT_ORIGIN);
            }
          });
          
          parent.postMessage({ runId: RUN_ID, ready: true }, PARENT_ORIGIN);
        </script>
      </head>
      <body></body>
      </html>
    `;
}

export async function runInSandbox(code: string): Promise<string> {
  if (code.length > BROWSER_SANDBOX_LIMITS.maxCodeChars) {
    return `Error: JavaScript code is too large to run in the browser sandbox.`;
  }

  return new Promise((resolve) => {
    const iframe = document.createElement("iframe");
    const runId = createSandboxRunId();
    const parentOrigin = getParentMessageOrigin();
    let timeoutId = 0;

    iframe.style.display = "none";
    iframe.setAttribute("sandbox", "allow-scripts");
    document.body.appendChild(iframe);

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("message", messageHandler);
      iframe.remove();
    };

    const messageHandler = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      if (!isSandboxMessage(event.data, runId)) return;

      if (isSandboxReadyMessage(event.data)) {
        // The sandbox has an opaque origin because it intentionally omits allow-same-origin.
        iframe.contentWindow?.postMessage({ runId, code }, "*");
        return;
      }

      cleanup();
      if (event.data.success) {
        resolve(event.data.output || "undefined");
        return;
      }

      const errorMsg = event.data.output
        ? `${event.data.output}\nError: ${event.data.error}`
        : `Error: ${event.data.error}`;
      resolve(errorMsg);
    };

    window.addEventListener("message", messageHandler);
    timeoutId = window.setTimeout(() => {
      cleanup();
      resolve("Error: JavaScript execution timed out.");
    }, BROWSER_SANDBOX_LIMITS.executionTimeoutMs);
    iframe.srcdoc = createSandboxHtml(runId, parentOrigin);
  });
}
