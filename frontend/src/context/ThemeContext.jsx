/**
 * Light / dark / system theme.
 *
 * The choice is stored in localStorage (so it works before login) and the
 * "dark" class is put on <html>, which switches every colour token in
 * index.css. Saving the choice to the user's account is done by
 * ThemeToggle, so it follows the user to other devices.
 */
import { createContext, useCallback, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "ov_theme";
const ThemeContext = createContext(null);

function systemPrefersDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }) {
  const [theme, setThemeState] = useState(() => localStorage.getItem(STORAGE_KEY) || "system");
  const [systemDark, setSystemDark] = useState(systemPrefersDark);

  // Follow the OS setting live while the theme is "system".
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const resolvedTheme = theme === "system" ? (systemDark ? "dark" : "light") : theme;

  useEffect(() => {
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");
  }, [resolvedTheme]);

  const setTheme = useCallback((value) => {
    localStorage.setItem(STORAGE_KEY, value);
    setThemeState(value);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme }}>{children}</ThemeContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  return useContext(ThemeContext);
}
