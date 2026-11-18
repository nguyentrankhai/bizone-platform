"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoginError } from "@/lib/auth-client";
import { oidc } from "@/lib/session-client";

// One exchange per `state`, even when React runs the effect twice (dev Strict Mode):
// the code and the PKCE verifier are single-use.
const exchanges = new Map<string, Promise<string>>();

/** Keycloak redirects here after sign-in (P6.7): swap the code for tokens, go back. */
export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const key = params.get("state") ?? params.get("error") ?? "";
    let job = exchanges.get(key);
    if (!job) {
      job = oidc.completeLogin(params);
      exchanges.set(key, job);
    }
    job.then(
      (returnTo) => router.replace(returnTo),
      (e: unknown) =>
        setError(e instanceof LoginError ? e.message : "Không đăng nhập được — vui lòng thử lại."),
    );
  }, [router]);

  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center bg-gray-50 p-6 text-center">
      <div className="text-2xl font-black tracking-tight text-primary">
        Biz<span className="text-gray-800">One</span>
      </div>
      {error ? (
        <>
          <p role="alert" className="mt-3 max-w-md text-sm text-red-600">
            {error}
          </p>
          <button
            type="button"
            onClick={() => void oidc.login("/")}
            className="mt-4 h-11 rounded-lg bg-primary px-5 text-sm font-medium text-white"
          >
            Đăng nhập lại
          </button>
        </>
      ) : (
        <p role="status" className="mt-3 text-sm text-gray-500">
          Đang hoàn tất đăng nhập...
        </p>
      )}
    </div>
  );
}
