export function Badge({ className = "", ...props }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border border-border bg-muted/40 px-2 py-1 text-xs 
                  text-muted-foreground ${className}`}
      {...props}
    />
  );
}
