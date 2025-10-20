export function Button({ className = "", variant = "secondary", ...props }) {
  // simple variants; extend if you use more
  const base =
    "inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm font-medium transition-colors border focus:outline-none focus:ring-2 focus:ring-ring/60";
  const variants = {
    primary:  "bg-primary text-primary-foreground border-transparent hover:brightness-110",
    secondary:"bg-secondary text-foreground/90 border-border hover:brightness-110",
    ghost:    "bg-transparent text-foreground/90 border-transparent hover:bg-muted/40",
    destructive: "bg-destructive text-destructive-foreground border-transparent hover:brightness-110",
  };
  return <button className={`${base} ${variants[variant] || variants.secondary} ${className}`} {...props} />;
}
