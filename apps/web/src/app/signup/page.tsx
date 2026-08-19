import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SignUpForm } from "@/domains/auth/components/signup-form";

export const metadata: Metadata = { title: "Create your workspace — AI-F" };

export default function SignUpPage() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Create your workspace</CardTitle>
          <CardDescription>Set up your business&apos;s AI assistant.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Suspense>
            <SignUpForm />
          </Suspense>
          <p className="text-center text-sm text-muted-foreground">
            Already have a workspace?{" "}
            <Link href="/login" className="underline underline-offset-4">
              Sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
