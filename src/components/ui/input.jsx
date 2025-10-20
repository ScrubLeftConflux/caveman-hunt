export function Input({ className = "", ...props }) {
  return (
    <input
      className={`w-full rounded-lg bg-background border border-input px-3 py-2 text-sm outline-none
                  placeholder:text-muted-foreground/60 focus:ring-2 focus:ring-ring/60 ${className}`}
      {...props}
    />
  );
}
