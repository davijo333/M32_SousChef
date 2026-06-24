"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [chefName, setChefName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const res = await fetch("/api/auth/signup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, chefName }),
    });

    if (!res.ok) {
      setLoading(false);
      const data = await res.json();
      setError(data.error ?? "Signup failed");
      return;
    }

    const signInRes = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);
    if (signInRes?.error) {
      router.push("/login");
      return;
    }

    router.push("/dashboard");
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-4">
      <div className="sc-card p-8">
        <h1 className="sc-page-title text-2xl">Join Sous Chef</h1>
        <p className="sc-page-lead">Your AI sous chef for menu and inventory.</p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="sc-label" htmlFor="chefName">
              Chef name
            </label>
            <input
              id="chefName"
              required
              placeholder="Maria"
              className="sc-input mt-0"
              value={chefName}
              onChange={(e) => setChefName(e.target.value)}
            />
          </div>
          <div>
            <label className="sc-label" htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              className="sc-input mt-0"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="sc-label" htmlFor="password">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                required
                minLength={6}
                className="sc-input mt-0 pr-11"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((prev) => !prev)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="sc-icon-btn absolute inset-y-0 right-1 my-auto"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" aria-hidden />
                ) : (
                  <Eye className="h-4 w-4" aria-hidden />
                )}
              </button>
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{String(error)}</p>}
          <button type="submit" disabled={loading} className="sc-btn-primary w-full">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Creating…
              </>
            ) : (
              "Create account"
            )}
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-chef-text-muted">
          You&apos;ll pick a unique kitchen name right after signup.
        </p>

        <p className="mt-4 text-center text-sm text-chef-text-muted">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-chef-sage underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
