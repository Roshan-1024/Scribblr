export function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || '?') + (parts[1]?.[0] || '')).toUpperCase();
}

export default function Avatar({ name, color, size = 32, title, admin = false }: { name: string; color: string; size?: number; title?: string; admin?: boolean }) {
  return (
    <div
      className={`avatar${admin ? ' admin' : ''}`}
      title={title ?? name}
      style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}
    >
      {initials(name)}
    </div>
  );
}
