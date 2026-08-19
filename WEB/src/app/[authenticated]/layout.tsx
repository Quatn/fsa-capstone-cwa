import { AuthProvider } from "@/context/auth-context-provider";

export default function AuthenticatedLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}
