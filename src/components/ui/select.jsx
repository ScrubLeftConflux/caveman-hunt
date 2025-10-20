export function Select({ value, onValueChange, children, className = "" }) {
  return (
    <select
      value={value}
      onChange={(e) => onValueChange?.(e.target.value)}
      className={`w-full rounded-lg bg-background border border-input px-3 py-2 text-sm
                  text-foreground/90 focus:ring-2 focus:ring-ring/60 ${className}`}
    >
      {children}
    </select>
  );
}
export function SelectTrigger({ className = "", ...props }) { return <div className={className} {...props} />; }
export function SelectContent({ className = "", ...props }) { return <div className={className} {...props} />; }
export function SelectItem({ value, children }) { return <option value={value}>{children}</option>; }
export function SelectValue({ placeholder }) { return null; }
