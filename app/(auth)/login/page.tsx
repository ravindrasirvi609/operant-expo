import Link from "next/link";

export default function LoginPage() {
  return <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-6"><form action="/api/auth/login" method="post" className="w-full space-y-5 rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm"><div><p className="text-sm font-medium text-indigo-600">Operant Expo</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome back</h1><p className="mt-2 text-sm text-zinc-500">Sign in to manage your exhibitions.</p></div><label className="block text-sm font-medium">Email<input name="email" type="email" required className="mt-2 w-full rounded-lg border p-3" /></label><label className="block text-sm font-medium">Password<input name="password" type="password" required minLength={8} className="mt-2 w-full rounded-lg border p-3" /></label><button className="w-full rounded-lg bg-indigo-600 p-3 font-medium text-white">Sign in</button><p className="text-sm text-zinc-500">New here? <Link className="text-indigo-600" href="/register">Create an account</Link></p></form></main>;
}

