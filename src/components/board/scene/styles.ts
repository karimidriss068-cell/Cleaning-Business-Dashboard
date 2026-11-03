export const STYLES = [
  { key: "a", name: "Holo command deck" },
  { key: "b", name: "Signal chamber" },
  { key: "c", name: "Glass orbit" },
] as const;
export type SceneStyle = (typeof STYLES)[number]["key"];
