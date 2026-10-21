import { useId } from "react";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from "react";

type FieldMeta = {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
};

function FieldFrame({
  id,
  label,
  hint,
  error,
  required,
  children,
}: FieldMeta & {
  id: string;
  required?: boolean | undefined;
  children: ReactNode;
}) {
  return (
    <div className="ui-field">
      <label className="ui-field__label" htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {children}
      {hint && (
        <p className="ui-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="ui-field__error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  );
}

function descriptionIds(
  id: string,
  hint?: string,
  error?: string,
  external?: string,
) {
  return (
    [external, hint ? `${id}-hint` : "", error ? `${id}-error` : ""]
      .filter(Boolean)
      .join(" ") || undefined
  );
}

export function TextField({
  label,
  hint,
  error,
  id,
  required,
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & FieldMeta) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <input
        {...props}
        id={fieldId}
        required={required}
        className={`ui-control ${className}`}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={descriptionIds(
          fieldId,
          hint,
          error,
          props["aria-describedby"],
        )}
      />
    </FieldFrame>
  );
}

export function SelectField({
  label,
  hint,
  error,
  id,
  required,
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & FieldMeta) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <select
        {...props}
        id={fieldId}
        required={required}
        className={`ui-control ui-control--select ${className}`}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={descriptionIds(
          fieldId,
          hint,
          error,
          props["aria-describedby"],
        )}
      >
        {children}
      </select>
    </FieldFrame>
  );
}

export function TextareaField({
  label,
  hint,
  error,
  id,
  required,
  className = "",
  rows = 3,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & FieldMeta) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  return (
    <FieldFrame
      id={fieldId}
      label={label}
      hint={hint}
      error={error}
      required={required}
    >
      <textarea
        {...props}
        id={fieldId}
        required={required}
        rows={rows}
        className={`ui-control ui-control--textarea ${className}`}
        aria-invalid={error ? true : props["aria-invalid"]}
        aria-describedby={descriptionIds(
          fieldId,
          hint,
          error,
          props["aria-describedby"],
        )}
      />
    </FieldFrame>
  );
}
