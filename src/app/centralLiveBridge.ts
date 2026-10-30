export type CentralLiveContext = {
  view: string;
  entityId?: string;
  stepId?: string;
  panel?: string;
};

type BindMessage = {
  type: "central-live:bind";
  version: number;
  roomId: string;
  frameId: string;
  tabId: string;
  role: "controller" | "viewer";
  epoch: number;
  context: CentralLiveContext | null;
};

const CENTRAL_ORIGIN = "https://central-ramos-apps.vercel.app";
let binding: BindMessage | null = null;
let onContext: ((context: CentralLiveContext) => void) | null = null;
let lastCursorAt = 0;
let lastContext = "";
let currentContext: CentralLiveContext | null = null;
let parentOrigin = CENTRAL_ORIGIN;
let lastAppliedContext = "";
const nativeFetch = window.fetch.bind(window);

function acceptedOrigin(origin: string) {
  return origin === CENTRAL_ORIGIN || (import.meta.env.DEV && /^http:\/\/(?:localhost|127\.0\.0\.1):\d+$/.test(origin));
}

function blockViewerEvent(event: Event) {
  if (binding?.role !== "viewer") return;
  if (event.target instanceof Element && event.target.closest("[data-central-live-local]")) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}

function handleMessage(event: MessageEvent) {
  if (event.source !== window.parent || !acceptedOrigin(event.origin)) return;
  const data = event.data as (Partial<Omit<BindMessage, "type">> & { type?: string }) | null;
  if (data?.type === "central-live:unbind" && data.frameId === window.name) {
    binding = null;
    lastAppliedContext = "";
    delete document.documentElement.dataset.centralLiveRole;
    return;
  }
  if (!data || data.type !== "central-live:bind" || data.version !== 1 ||
      data.frameId !== window.name || !data.roomId ||
      (data.role !== "viewer" && data.role !== "controller")) return;
  const newControl = binding?.roomId !== data.roomId || binding?.epoch !== data.epoch || binding?.role !== data.role;
  if (newControl) { lastContext = ""; lastAppliedContext = ""; }
  binding = data as BindMessage;
  parentOrigin = event.origin;
  document.documentElement.dataset.centralLiveRole = binding.role;
  window.parent.postMessage({ type: "central-live:capabilities", version: 1,
    roomId: binding.roomId, frameId: binding.frameId, tabId: binding.tabId, epoch: binding.epoch,
    features: ["context", "cursor", "viewer-lock"] }, parentOrigin);
  const incoming = binding.context ? JSON.stringify(binding.context) : "";
  if (binding.context && onContext && incoming !== lastAppliedContext &&
      (binding.role === "viewer" || newControl)) {
    lastAppliedContext = incoming;
    onContext(binding.context);
  }
  if (binding.role === "controller" && currentContext && !binding.context) publishCentralLiveContext(currentContext);
}

function handlePointer(event: PointerEvent) {
  if (binding?.role !== "controller" || Date.now() - lastCursorAt < 180) return;
  lastCursorAt = Date.now();
  window.parent.postMessage({ type: "central-live:cursor", frameId: binding.frameId, tabId: binding.tabId,
    x: Math.max(0, Math.min(1, event.clientX / window.innerWidth)),
    y: Math.max(0, Math.min(1, event.clientY / window.innerHeight)) }, parentOrigin);
}

export function connectCentralLive(apply: (context: CentralLiveContext) => void) {
  onContext = apply;
  if (window.parent === window) return () => { onContext = null; };
  window.addEventListener("message", handleMessage);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (binding?.role === "viewer" && method !== "GET" && method !== "HEAD") {
      return Promise.reject(new Error("Modo Ao Vivo: somente leitura para espectadores."));
    }
    return nativeFetch(input, init);
  };
  window.addEventListener("pointermove", handlePointer, { passive: true });
  for (const name of ["click", "dblclick", "keydown", "keypress", "keyup", "input", "change", "submit", "pointerdown", "pointerup"] as const) {
    document.addEventListener(name, blockViewerEvent, true);
  }
  return () => {
    onContext = null;
    binding = null;
    lastAppliedContext = "";
    delete document.documentElement.dataset.centralLiveRole;
    window.removeEventListener("message", handleMessage);
    window.fetch = nativeFetch;
    window.removeEventListener("pointermove", handlePointer);
    for (const name of ["click", "dblclick", "keydown", "keypress", "keyup", "input", "change", "submit", "pointerdown", "pointerup"] as const) {
      document.removeEventListener(name, blockViewerEvent, true);
    }
  };
}

export function publishCentralLiveContext(context: CentralLiveContext) {
  currentContext = context;
  if (binding?.role !== "controller") return;
  const signature = JSON.stringify(context);
  if (signature === lastContext) return;
  lastContext = signature;
  window.parent.postMessage({ type: "central-live:context", frameId: binding.frameId, tabId: binding.tabId, context }, parentOrigin);
}

export function isCentralLiveViewer() { return binding?.role === "viewer"; }
