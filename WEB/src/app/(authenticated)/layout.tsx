import AuthLayout from "@/components/layout/AuthLayout";
import Header from "@/components/layout/header/Header";

export default function AuthenticatedLayout({ children }: LayoutProps<"/">) {
  return (
    <AuthLayout>
      <div><Header /> </div>
      <div className="grow">
        {children}
      </div>
    </AuthLayout>
  );
}
