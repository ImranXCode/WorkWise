import { useTheme } from "../lib/ThemeContext";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isLight = theme === "light";

  return (
    <button
      onClick={toggleTheme}
      aria-label={isLight ? "Switch to dark mode" : "Switch to light mode"}
      title={isLight ? "Switch to dark mode" : "Switch to light mode"}
      className="shrink-0 w-9 h-9 rounded-xl border border-base-700/30 bg-base-800/30 hover:bg-base-700/50 flex items-center justify-center text-ink-500 hover:text-ink-200 transition-all duration-300 hover:border-base-600/40 group active:scale-90"
    >
      <div className="relative w-[18px] h-[18px]">
        {/* Sun icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className={`absolute inset-0 transition-all duration-400 ${
            isLight
              ? "opacity-0 rotate-90 scale-50"
              : "opacity-100 rotate-0 scale-100"
          }`}
        >
          <circle cx="12" cy="12" r="4.2" stroke="currentColor" strokeWidth="1.7" />
          <path
            d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
        {/* Moon icon */}
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          className={`absolute inset-0 transition-all duration-400 ${
            isLight
              ? "opacity-100 rotate-0 scale-100"
              : "opacity-0 -rotate-90 scale-50"
          }`}
        >
          <path
            d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </button>
  );
}
