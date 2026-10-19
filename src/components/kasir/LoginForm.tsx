"use client";

import { useEffect, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { brand } from "@/data/brand";
import { api, RequestError } from "@/lib/order/client";
import { Mascot } from "@/components/ui/Mascot";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sudah masuk? Langsung ke dashboard.
  useEffect(() => {
    api("/api/kasir/me")
      .then(() => router.replace("/kasir"))
      .catch(() => {});
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/kasir/login", { method: "POST", body: { email, password } });
      router.replace("/kasir");
    } catch (failure) {
      setError(failure instanceof RequestError ? (failure.code === "NETWORK" ? "Tidak bisa terhubung ke server. Cek koneksi internet kasir." : failure.message) : "Gagal masuk.");
      setBusy(false);
    }
  }

  return (
    <main id="main" className="kasir-login">
      <form className="kasir-login-card" onSubmit={submit} noValidate>
        <Image src={brand.logo.src} alt={brand.logo.alt} width={brand.logo.width} height={brand.logo.height} sizes="140px" className="kasir-login-logo" preload />
        <Mascot name="girl-head" reveal="now" className="kasir-login-mascot" sizes="90px" />
        <h1 className="kasir-login-title">Tooday Counter</h1>
        <p className="kasir-muted">Masuk dengan akun staf outlet.</p>

        <div className="qo-field">
          <label htmlFor="kasir-email">Email</label>
          <input
            id="kasir-email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-describedby={error ? "kasir-login-error" : undefined}
            aria-invalid={Boolean(error)}
          />
        </div>
        <div className="qo-field">
          <label htmlFor="kasir-password">Password</label>
          <input
            id="kasir-password"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-describedby={error ? "kasir-login-error" : undefined}
            aria-invalid={Boolean(error)}
          />
        </div>
        {error && (
          <p id="kasir-login-error" className="qo-banner qo-banner--closed" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="qo-btn qo-btn--olive qo-btn--block" disabled={busy || !email || !password}>
          {busy ? "Masuk…" : "Masuk"}
        </button>
        <p className="kasir-muted kasir-small">Akun staf dibuat oleh pengelola. Lupa password? Hubungi pengelola outlet.</p>
      </form>
    </main>
  );
}
