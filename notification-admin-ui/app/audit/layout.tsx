import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Audit Trail",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
