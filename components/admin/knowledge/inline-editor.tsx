"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface InlineEditorProps {
  value: string;
  onChange: (next: string) => void;
  multiline?: boolean;
  placeholder?: string;
  label?: string;
  rows?: number;
  disabled?: boolean;
  id?: string;
}

export function InlineEditor({
  value,
  onChange,
  multiline = false,
  placeholder,
  label,
  rows = 4,
  disabled = false,
  id,
}: InlineEditorProps) {
  const fieldId = id ?? (label ? `inline-${label}` : undefined);

  const sharedClass =
    "border-border/60 transition-colors focus:border-primary focus-visible:ring-1 focus-visible:ring-primary";

  return (
    <div className="space-y-2">
      {label && <Label htmlFor={fieldId}>{label}</Label>}
      {multiline ? (
        <Textarea
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled}
          className={sharedClass}
        />
      ) : (
        <Input
          id={fieldId}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          className={sharedClass}
        />
      )}
    </div>
  );
}
