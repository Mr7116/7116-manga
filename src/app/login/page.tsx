import LoginForm from "./LoginForm";

export const metadata = { title: "เข้าสู่ระบบผู้ดูแล | 7116-MANGA" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  // Only allow same-site relative redirects
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/watchlist";

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <LoginForm next={safeNext} />
    </main>
  );
}
