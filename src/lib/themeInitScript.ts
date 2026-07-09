export const LIGHT_THEME_COLOR = "#ffffff";
export const DARK_THEME_COLOR = "#09090b";

export const THEME_INIT_SCRIPT = `
try {
  var stored = window.localStorage.getItem("neo-chat-core-settings");
  var parsed = stored ? JSON.parse(stored) : null;
  var theme = parsed && parsed.state && parsed.state.theme ? parsed.state.theme : "system";
  var prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
  var isDark = theme === "dark" || (theme === "system" && prefersDark);
  document.documentElement.classList.toggle("dark", isDark);
  var meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDark ? "${DARK_THEME_COLOR}" : "${LIGHT_THEME_COLOR}");
} catch (_) {}
`;
