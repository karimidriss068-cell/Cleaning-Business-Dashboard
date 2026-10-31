// A fresh copy of this wrapper mounts on every navigation, which replays the
// short page transition (under 250ms; off under reduced motion).
export default function AppTemplate({ children }: { children: React.ReactNode }) {
  return <div className="kc-page">{children}</div>;
}
