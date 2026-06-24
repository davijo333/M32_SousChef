"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";

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
      <h1 className="text-2xl font-semibold">Join Sous Chef</h1>
      <p className="mt-1 text-stone-600">Your AI sous chef for menu &amp; inventory.</p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        <div>
          <label className="block text-sm font-medium">Chef name</label>
          <input
            required
            placeholder="Maria"
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            value={chefName}
            onChange={(e) => setChefName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Email</label>
          <input
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-stone-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium">Password</label>
          <div className="relative mt-1">
            <input
              type={showPassword ? "text" : "password"}
              required
              minLength={6}
              className="w-full rounded-lg border border-stone-300 px-3 py-2 pr-11"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="absolute inset-y-0 right-0 flex items-center px-3 text-stone-500 hover:text-stone-700"
            >
              {showPassword ? (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M2 2l20 20" />
                  <path d="M1.5 12C2.8 7.7 6.9 4 12 4c2 0 3.8.6 5.3 1.5" />
                  <path d="M22.5 12c-1.3 4.3-5.4 8-10.5 8-2 0-3.8-.6-5.3-1.5" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1.5 12C2.8 7.7 6.9 4 12 4s9.2 3.7 10.5 8c-1.3 4.3-5.4 8-10.5 8S2.8 16.3 1.5 12z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              )}
            </button>
          </div>
        </div>
        {error && <p className="text-sm text-red-600">{String(error)}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-stone-900 py-2.5 text-white hover:bg-stone-800 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create account"}
        </button>
      </form>

      <p className="mt-3 text-center text-xs text-stone-500">
        You&apos;ll pick a unique kitchen name right after signup.
      </p>

      <p className="mt-4 text-center text-sm text-stone-600">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-stone-900 underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
