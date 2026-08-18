import Link from "next/link";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "@/domains/auth/components/login-form";

export const metadata: Metadata = { title: "Sign in — AI-F" };

export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>Welcome back to your workspace.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <LoginForm />
          <p className="text-center text-sm text-muted-foreground">
            Don&apos;t have a workspace?{" "}
            <Link href="/signup" className="underline underline-offset-4">
              Create one
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
