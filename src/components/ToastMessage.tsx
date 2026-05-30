type ToastMessageProps = {
  message: string;
  type?: "success" | "error";
  onClose?: () => void;
};

export default function ToastMessage({ message, type = "success", onClose }: ToastMessageProps) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 max-w-sm rounded-3xl border px-5 py-4 shadow-xl transition-all ${
      type === "success"
        ? "border-emerald-200 bg-emerald-50 text-emerald-900"
        : "border-rose-200 bg-rose-50 text-rose-900"
    }`} role="status">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm leading-6">{message}</p>
        {onClose ? (
          <button type="button" onClick={onClose} className="text-sm font-semibold opacity-80 transition hover:opacity-100">
            닫기
          </button>
        ) : null}
      </div>
    </div>
  );
}
