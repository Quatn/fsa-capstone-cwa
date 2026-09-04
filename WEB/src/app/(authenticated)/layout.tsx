import Header from "@/components/layout/header/Header";
import { AuthProvider } from "@/context/auth-context-provider";

export default function AuthenticatedLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthProvider>
      <div><Header /> </div>
      <div className="grow">
        {children}
      </div>
    </AuthProvider>
  );
}
