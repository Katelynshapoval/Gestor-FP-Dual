import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Modal from "../ui/Modal.jsx";

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

// Built on the shared Modal: focus trap, Escape, stacking above other dialogs.
function ConfirmDialog({ dialog, onResolve }) {
  const cancelRef = useRef(null);
  const danger = dialog.tone === "danger";

  return (
    <Modal
      open
      onClose={() => onResolve(false)}
      title={dialog.title}
      size="sm"
      initialFocusRef={cancelRef}
      footer={
        <>
          <button ref={cancelRef} type="button" className="btn btn-secondary btn-sm" onClick={() => onResolve(false)}>
            {dialog.cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-sm ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => onResolve(true)}
          >
            {dialog.confirmLabel}
          </button>
        </>
      }
    >
      <p className="text-sm leading-6 text-charcoal-800">{dialog.message}</p>
    </Modal>
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
        role="region"
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
