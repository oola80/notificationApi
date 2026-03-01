"use client";

import { SWRConfig } from "swr";
import { toast } from "sonner";
import { SidebarProvider } from "@/components/layout/sidebar-provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SWRConfig
      value={{
        onError: (error) => {
          toast.error(error?.message || "An unexpected error occurred");
        },
        revalidateOnFocus: false,
      }}
    >
      <SidebarProvider>{children}</SidebarProvider>
    </SWRConfig>
  );
}
