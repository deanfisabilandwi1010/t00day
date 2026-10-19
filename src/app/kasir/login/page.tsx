import type { Metadata } from "next";
import { LoginForm } from "@/components/kasir/LoginForm";
import "@/styles/order-system.css";

export const metadata: Metadata = {
  title: "Masuk · Tooday Counter",
  robots: { index: false, follow: false },
};

export default function KasirLoginPage() {
  return <LoginForm />;
}
