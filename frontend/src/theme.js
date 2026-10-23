// Single theme file: every colour and font used by the app lives here.
// Change a value and the whole app follows (pages, PDF report and Excel export).

export const theme = {
  colors: {
    primary: "#000000", // page background
    secondary: "#e7000b", // red accent
    text: "#ffffff",
    surface: "#0a0a0a",
    surface2: "#111111",
    surface3: "#1a1a1a",
    card: "#0f0f0f",
    track: "#222222", // progress bars, rings
    border: "#2a2a2a",
    borderStrong: "#4a4a4a", // table lines
    muted: "#9a9a9a",
    mutedSoft: "#a8b1bd", // report footer, labels
    success: "#2ecc71",
    link: "#8ab4f8",
  },
  font: {
    name: "Arial", // used by the Excel export
    family: "Arial, Helvetica, sans-serif",
  },
  fontSizes: {
    xxs: "5pt",
    s: "8pt",
    m: "9pt",
    l: "10pt",
    xl: "12pt",
    h3: "14pt",
    h2: "16pt",
    stat: "18pt",
    title: "20pt",
    display: "24pt",
  },
  spacing: {
    xs: "10px",
    sm: "12px",
    md: "16px",
    lg: "24px",
    xl: "32px",
  },
};

// borderStrong -> border-strong
const toKebab = (key) => key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);

// Turns the theme into CSS variables: { "--secondary": "#e7000b", "--fs-m": "9pt", "--spacing-md": "16px", ... }
export function cssVars(t = theme) {
  const vars = {};
  Object.entries(t.colors).forEach(([key, value]) => (vars[`--${toKebab(key)}`] = value));
  Object.entries(t.fontSizes).forEach(([key, value]) => (vars[`--fs-${toKebab(key)}`] = value));
  Object.entries(t.spacing).forEach(([key, value]) => (vars[`--spacing-${key}`] = value));
  vars["--font-family"] = t.font.family;
  return vars;
}

// Writes the variables on the page, so every CSS rule using var(--token) picks them up
export function applyTheme(root = document.documentElement, t = theme) {
  Object.entries(cssVars(t)).forEach(([name, value]) => root.style.setProperty(name, value));
}
