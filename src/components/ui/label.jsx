export function Label({ className = "", ...props }) {
  return <label className={`text-sm text-muted-foreground ${className}`} {...props} />;
}
