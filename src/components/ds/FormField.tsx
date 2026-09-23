import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

interface FieldShellProps {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
  htmlFor: string;
  children: ReactNode;
}

const FieldShell = ({ label, hint, error, required, className, htmlFor, children }: FieldShellProps) => (
  <div className={cn("space-y-1.5", className)}>
    {label && (
      <label htmlFor={htmlFor} className="block text-sm font-medium text-foreground">
        {label}
        {required && <span className="text-destructive ml-0.5" aria-hidden>*</span>}
      </label>
    )}
    {children}
    {error ? (
      <p className="text-xs text-destructive" role="alert">{error}</p>
    ) : hint ? (
      <p className="text-xs text-muted-foreground">{hint}</p>
    ) : null}
  </div>
);

type BaseFieldProps = {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  containerClassName?: string;
};

export type TextFieldProps = BaseFieldProps & InputHTMLAttributes<HTMLInputElement>;

/** Campo de texto padrão: rótulo + input 44px (mobile) / 40px + ajuda ou erro. Substitui `input-begin` solto. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hint, error, containerClassName, className, id, required, ...props }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldShell label={label} hint={hint} error={error} required={required} className={containerClassName} htmlFor={fieldId}>
        <input
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn("input-begin", className)}
          {...props}
        />
      </FieldShell>
    );
  },
);
TextField.displayName = "TextField";

export type TextAreaFieldProps = BaseFieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>;

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  ({ label, hint, error, containerClassName, className, id, required, ...props }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldShell label={label} hint={hint} error={error} required={required} className={containerClassName} htmlFor={fieldId}>
        <textarea
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn("input-begin", className)}
          {...props}
        />
      </FieldShell>
    );
  },
);
TextAreaField.displayName = "TextAreaField";

export type SelectFieldProps = BaseFieldProps & SelectHTMLAttributes<HTMLSelectElement>;

/** Select nativo (melhor no mobile) com a mesma casca visual do input. */
export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  ({ label, hint, error, containerClassName, className, id, required, children, ...props }, ref) => {
    const autoId = useId();
    const fieldId = id ?? autoId;
    return (
      <FieldShell label={label} hint={hint} error={error} required={required} className={containerClassName} htmlFor={fieldId}>
        <select
          ref={ref}
          id={fieldId}
          required={required}
          aria-invalid={error ? true : undefined}
          className={cn("input-begin appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%238e8e93%22 stroke-width=%222%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22><polyline points=%226 9 12 15 18 9%22/></svg>')] bg-[length:16px] bg-[right_12px_center] bg-no-repeat pr-9", className)}
          {...props}
        >
          {children}
        </select>
      </FieldShell>
    );
  },
);
SelectField.displayName = "SelectField";
