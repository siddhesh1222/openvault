import { Monitor, Moon, Sun } from "lucide-react";

import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { api } from "@/lib/api";

export const THEMES = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
];

/** Change the theme and, when logged in, save it on the account (so it follows the user). */
export function useSaveTheme() {
  const { setTheme } = useTheme();
  const { user } = useAuth();
  return (value) => {
    setTheme(value);
    if (user) api.patch("/users/me", { theme: value }).catch(() => {});
  };
}
