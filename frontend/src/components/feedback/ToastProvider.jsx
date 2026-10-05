import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";

const FeedbackContext = createContext(null);

const DURATION = {
  success: 5000,
  info: 5000,
  warning: 7000,
  error: 7000,
};

const TOAST_CLASS = {
  success: "border-green-200 bg-green-50 text-green-800",
  error: "border-red-200 bg-red-50 text-red-800",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-surface-200 bg-white text-charcoal-900",
};

function ToastCard({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return undefined;
    const timer = setTimeout(() => onDismiss(toast.id), toast.duration);
    return () => clearTimeout(timer);
  }, [paused, toast.id, toast.duration, onDismiss]);

  const assertive = toast.type === "error" || toast.type === "warning";

  return (
    <div
      role={assertive ? "alert" : "status"}
      className={`pointer-events-auto flex items-start gap-3 rounded-lg border px-4 py-3 text-sm shadow-card animate-slide-in ${TOAST_CLASS[toast.type] || TOAST_CLASS.info}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <p className="min-w-0 flex-1 leading-5">{toast.message}</p>
      <button
        type="button"
        className="shrink-0 rounded px-1 text-base leading-none opacity-60 outline-none hover:opacity-100 focus-visible:ring-2 focus-visible:ring-brand-500/30"
        onClick={() => onDismiss(toast.id)}
        aria-label="Cerrar aviso"
      >
        ×
      </button>
    </div>
  );
}

function ConfirmDialog({ dialog, onResolve }) {
  const titleId = useId();
  const cancelRef = useRef(null);
  const danger = dialog.tone === "danger";

  useEffect(() => {
    cancelRef.current?.focus();
    const onKey = (event) => {
      if (event.key === "Escape") onResolve(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [dialog, onResolve]);

  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      onClick={() => onResolve(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-md space-y-4 rounded-xl2 bg-white p-6 shadow-xl"
        onClick={(event) => event.stopPropagation()}
      >
        <h3 id={titleId} className="font-semibold text-gray-900">
          {dialog.title}
        </h3>
        <p className="text-sm leading-6 text-gray-600">{dialog.message}</p>
        <div className="flex justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => onResolve(false)}
          >
            {dialog.cancelLabel}
          </button>
          <button
            type="button"
            className={
              danger
                ? "rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                : "btn btn-primary btn-sm shadow-none"
            }
            onClick={() => onResolve(true)}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const [dialog, setDialog] = useState(null);
  const idRef = useRef(0);
  const dialogRef = useRef(null);
  const queueRef = useRef([]);

  const dismiss = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback((type, message) => {
    const text = String(message || "").trim();
    if (!text) return;
    setToasts((prev) => {
      if (prev.some((toast) => toast.type === type && toast.message === text)) return prev;
      const next = [
        ...prev,
        {
          id: ++idRef.current,
          type,
          message: text,
          duration: DURATION[type] || 5000,
        },
      ];
      return next.slice(-4);
    });
  }, []);

  const toast = useMemo(
    () => ({
      success: (message) => push("success", message),
      error: (message) => push("error", message),
      warning: (message) => push("warning", message),
      info: (message) => push("info", message),
    }),
    [push],
  );

  const showNextDialog = useCallback(() => {
    const next = queueRef.current.shift() || null;
    dialogRef.current = next;
    setDialog(next);
  }, []);

  const confirm = useCallback(
    (options) =>
      new Promise((resolve) => {
        queueRef.current.push({
          title: options?.title || "Confirmar",
          message: options?.message || "",
          confirmLabel: options?.confirmLabel || "Confirmar",
          cancelLabel: options?.cancelLabel || "Cancelar",
          tone: options?.tone || "danger",
          resolve,
        });
        if (!dialogRef.current) showNextDialog();
      }),
    [showNextDialog],
  );

  const resolveDialog = useCallback(
    (accepted) => {
      const current = dialogRef.current;
      if (current) current.resolve(accepted);
      dialogRef.current = null;
      showNextDialog();
    },
    [showNextDialog],
  );

  return (
    <FeedbackContext.Provider value={{ toast, confirm }}>
      {children}
      <div
        className="pointer-events-none fixed top-20 left-1/2 z-[300] flex w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-2"
        aria-label="Notificaciones"
      >
        {toasts.map((item) => (
          <ToastCard key={item.id} toast={item} onDismiss={dismiss} />
        ))}
      </div>
      {dialog && <ConfirmDialog dialog={dialog} onResolve={resolveDialog} />}
    </FeedbackContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useToast debe usarse dentro de ToastProvider");
  return ctx.toast;
}

export function useConfirm() {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useConfirm debe usarse dentro de ToastProvider");
  return ctx.confirm;
}
