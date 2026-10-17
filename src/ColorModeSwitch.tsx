import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Monitor, Moon, Sun } from "lucide-react";
import {
  COLOR_MODE_KEY,
  COLOR_SCHEME_QUERY,
  readColorMode,
  resolvedColorMode,
  type ColorMode,
} from "./colorMode";

const modes = [
  ["system", "跟随系统", Monitor],
  ["light", "浅色", Sun],
  ["dark", "深色", Moon],
] as const;

export default function ColorModeSwitch() {
  const [mode, setMode] = useState<ColorMode>(readColorMode);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia(COLOR_SCHEME_QUERY).matches,
  );
  const menu = useRef<HTMLDetailsElement>(null);
  const trigger = useRef<HTMLElement>(null);
  const [, label, Icon] = modes.find(([value]) => value === mode)!;

  useLayoutEffect(() => {
    document.documentElement.dataset.colorMode = mode;
    document.documentElement.dataset.theme = resolvedColorMode(
      mode,
      systemDark,
    );
  }, [mode, systemDark]);

  useEffect(() => {
    const media = matchMedia(COLOR_SCHEME_QUERY);
    const changed = () => setSystemDark(media.matches);
    changed();
    media.addEventListener("change", changed);
    const stored = (event: StorageEvent) => {
      if (
        event.storageArea === localStorage &&
        (event.key === COLOR_MODE_KEY || event.key === null)
      )
        setMode(readColorMode());
    };
    window.addEventListener("storage", stored);
    return () => {
      media.removeEventListener("change", changed);
      window.removeEventListener("storage", stored);
    };
  }, []);

  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (menu.current && !menu.current.contains(event.target as Node))
        menu.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && menu.current?.open) {
        menu.current.open = false;
        trigger.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);

  function select(next: ColorMode) {
    setMode(next);
    try {
      localStorage.setItem(COLOR_MODE_KEY, next);
    } catch {
      // Still allow this page's appearance to change when persistence is denied.
    }
    if (menu.current) menu.current.open = false;
    trigger.current?.focus();
  }

  return (
    <details className="color-mode-switch" ref={menu}>
      <summary
        className="icon-button"
        ref={trigger}
        aria-label={`外观模式：${label}`}
        title={`外观模式：${label}（点击选择）`}
      >
        <Icon size={18} aria-hidden="true" />
      </summary>
      <div className="color-mode-options" role="group" aria-label="外观模式">
        {modes.map(([value, name, ModeIcon]) => (
          <button
            key={value}
            type="button"
            aria-pressed={mode === value}
            onClick={() => select(value)}
          >
            <ModeIcon size={16} aria-hidden="true" />
            <span>{name}</span>
            {mode === value && <Check size={14} aria-hidden="true" />}
          </button>
        ))}
      </div>
    </details>
  );
}
