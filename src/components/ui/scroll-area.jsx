export function ScrollArea({ className = "", ...props }) {
  return <div className={`overflow-auto [scrollbar-color:var(--ring)_transparent] ${className}`} {...props} />;
}
