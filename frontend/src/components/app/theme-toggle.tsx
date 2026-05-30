"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

export function ThemeToggle({ label }: { label: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const currentTheme = mounted ? theme : "system";
  const nextTheme = currentTheme === "dark" ? "light" : currentTheme === "light" ? "system" : "dark";
  const Icon = currentTheme === "dark" ? Moon : currentTheme === "light" ? Sun : Monitor;

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => setTheme(nextTheme)}
    >
      <Icon className="size-4" />
    </Button>
  );
}
