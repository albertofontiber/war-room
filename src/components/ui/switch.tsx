"use client"

function Switch({
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={`
        relative inline-flex h-[22px] w-[40px] shrink-0 items-center rounded-full
        transition-colors duration-200 outline-none
        ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}
        ${checked ? "bg-emerald-500" : "bg-red-500/80"}
        ${className ?? ""}
      `}
    >
      <span
        className={`
          pointer-events-none block h-[16px] w-[16px] rounded-full bg-white shadow-sm
          transition-transform duration-200
          ${checked ? "translate-x-[20px]" : "translate-x-[3px]"}
        `}
      />
    </button>
  );
}

export { Switch }
