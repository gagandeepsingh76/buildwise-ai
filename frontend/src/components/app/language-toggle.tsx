"use client";

import { Languages } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { Language } from "@/lib/types";

export function LanguageToggle({
  language,
  onChange,
  label,
}: {
  language: Language;
  onChange: (language: Language) => void;
  label: string;
}) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      aria-label={label}
      title={label}
      onClick={() => onChange(language === "en" ? "hi" : "en")}
    >
      <Languages className="size-4" />
      {language === "en" ? "हिंदी" : "EN"}
    </Button>
  );
}
