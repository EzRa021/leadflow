import { useToast } from "@/lib/use-toast";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";
import { CheckCircle2, AlertCircle, Info, AlertTriangle } from "lucide-react";

const ICONS = {
  success: <CheckCircle2 className="h-4 w-4 text-teal shrink-0 mt-0.5" />,
  destructive: <AlertCircle className="h-4 w-4 text-rose shrink-0 mt-0.5" />,
  warning: <AlertTriangle className="h-4 w-4 text-amber shrink-0 mt-0.5" />,
  default: <Info className="h-4 w-4 text-indigo shrink-0 mt-0.5" />,
};

export function Toaster() {
  const { toasts } = useToast();
  return (
    <ToastProvider>
      {toasts.map(({ id, title, description, action, variant, ...props }) => (
        <Toast key={id} variant={variant} {...props}>
          <div className="flex gap-3 w-full">
            {ICONS[variant] || ICONS.default}
            <div className="grid gap-1 flex-1 min-w-0">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
          </div>
          {action}
          <ToastClose />
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
