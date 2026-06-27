import { toast } from 'sonner';

export const notify = {
  success: (message: string, description?: string): void => { toast.success(message, { description }); },
  error:   (message: string, description?: string): void => { toast.error(message, { description }); },
  info:    (message: string, description?: string): void => { toast(message, { description }); },
  promise: <T>(
    p: Promise<T>,
    msgs: { loading: string; success: string | ((v: T) => string); error: string | ((e: unknown) => string) },
  ): void => { toast.promise(p, msgs); },
};
