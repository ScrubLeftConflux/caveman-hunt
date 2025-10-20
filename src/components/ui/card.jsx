export function Card({ className = "", ...props }) {
  return (
    <div
      className={`rounded-xl border bg-card text-foreground shadow-sm ${className}`}
      {...props}
    />
  );
}
export function CardHeader({ className = "", ...props }) {
  return <div className={`p-6 border-b border-border/60 ${className}`} {...props} />;
}
export function CardTitle({ className = "", ...props }) {
  return <h3 className={`text-xl font-bold leading-none tracking-tight ${className}`} {...props} />;
}
export function CardDescription({ className = "", ...props }) {
  return <p className={`text-sm text-muted-foreground ${className}`} {...props} />;
}
export function CardContent({ className = "", ...props }) {
  return <div className={`p-6 ${className}`} {...props} />;
}
