import { useEffect, useId, useState } from "react";
import { MenuItem } from "@headlessui/react";
import { motion } from "motion/react";
import { SunIcon, MoonIcon, ComputerDesktopIcon } from "@heroicons/react/24/outline";
import { DropdownSection } from "./ui-kit/dropdown";

type Theme = "light" | "system" | "dark";

const themes: { value: Theme; icon: typeof SunIcon; label: string }[] = [
  { value: "system", icon: ComputerDesktopIcon, label: "System" },
  { value: "light", icon: SunIcon, label: "Light" },
  { value: "dark", icon: MoonIcon, label: "Dark" },
];

function storedTheme(): Theme {
  const stored = localStorage.getItem("theme");
  return stored === "light" || stored === "dark" ? stored : "system";
}

function applyTheme(theme: Theme) {
  const isDark =
    theme === "dark" ||
    (theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", isDark);
}

// Keep preference and system listeners mounted while the account menu is closed.
export function useTheme() {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const synchronize = () => {
      const current = storedTheme();
      setTheme(current);
      applyTheme(current);
    };
    synchronize();
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", synchronize);
    window.addEventListener("theme-change", synchronize);
    window.addEventListener("storage", synchronize);
    return () => {
      mediaQuery.removeEventListener("change", synchronize);
      window.removeEventListener("theme-change", synchronize);
      window.removeEventListener("storage", synchronize);
    };
  }, []);

  const selectTheme = (newTheme: Theme) => {
    localStorage.setItem("theme", newTheme);
    window.dispatchEvent(new Event("theme-change"));
  };

  return { theme, selectTheme };
}

export function ThemeToggle({
  theme,
  onSelect,
}: {
  theme: Theme;
  onSelect: (theme: Theme) => void;
}) {
  const id = useId();
  return (
    <DropdownSection aria-label="Theme">
      <div className="col-span-full flex items-center justify-between gap-4 px-3.5 py-2 sm:px-3">
        <span className="text-sm/6 text-zinc-500 dark:text-zinc-400">Theme</span>
        <div className="relative flex w-fit items-center gap-1 rounded-lg bg-zinc-950/5 p-1 dark:bg-white/5">
          {themes.map(({ value, icon: Icon, label }) => (
            <MenuItem
              as="button"
              type="button"
              key={value}
              data-theme-option
              onClick={(event) => {
                event.preventDefault();
                onSelect(value);
              }}
              aria-label={`${label} theme${theme === value ? ", selected" : ""}`}
              title={label}
              className="relative z-10 flex size-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:text-zinc-950 focus:outline-hidden data-focus:text-zinc-950 data-focus:outline-2 data-focus:outline-offset-2 data-focus:outline-blue-500 dark:text-zinc-400 dark:hover:text-white dark:data-focus:text-white"
            >
              {theme === value && (
                <motion.span
                  layoutId={`theme-indicator-${id}`}
                  className="absolute inset-0 rounded-md bg-white shadow-sm ring-1 ring-zinc-950/5 dark:bg-zinc-800 dark:ring-white/10"
                  transition={{ type: "spring", duration: 0.25, bounce: 0.15 }}
                />
              )}
              <Icon data-slot="icon" className="relative size-4" />
            </MenuItem>
          ))}
        </div>
      </div>
    </DropdownSection>
  );
}
