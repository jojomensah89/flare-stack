import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from "@repo/ui";
import {
  AlertCircle,
  CheckCircle2,
  Lock,
  LogIn,
  LogOut,
  ShieldCheck,
  UserPlus,
} from "lucide-react";
import * as React from "react";
import { signIn, signOut, signUp, useSession } from "../lib/auth-client";

interface AuthFeedbackProps {
  error: string | null;
  success: string | null;
}

function AuthFeedback({ error, success }: AuthFeedbackProps) {
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>{error}</span>
      </div>
    );
  }
  if (success) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-primary/20 bg-primary/10 p-3 text-sm text-primary">
        <CheckCircle2 className="h-4 w-4 shrink-0" />
        <span>{success}</span>
      </div>
    );
  }
  return null;
}

interface ActiveSessionViewProps {
  session: {
    user: {
      id: string;
      name: string;
      email: string;
    };
    session?: {
      expiresAt?: Date | string;
    };
  };
  submitting: boolean;
  onSignOut: () => void;
}

function ActiveSessionView({ session, submitting, onSignOut }: ActiveSessionViewProps) {
  const expiresText = session.session?.expiresAt
    ? new Date(session.session.expiresAt).toISOString()
    : "Active";

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <h4 className="text-sm font-semibold mb-2">Active Session Details</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
          <div>
            <span className="text-muted-foreground font-mono">User: </span>
            <span className="font-medium">{session.user.name}</span>
          </div>
          <div>
            <span className="text-muted-foreground font-mono">Email: </span>
            <span className="font-medium">{session.user.email}</span>
          </div>
          <div>
            <span className="text-muted-foreground font-mono">User ID: </span>
            <span className="font-mono text-xs truncate">{session.user.id}</span>
          </div>
          <div>
            <span className="text-muted-foreground font-mono">Expires: </span>
            <span className="font-mono text-xs">{expiresText}</span>
          </div>
        </div>
      </div>

      <Button variant="destructive" onClick={onSignOut} disabled={submitting} className="w-full">
        <span className="flex items-center justify-center gap-2">
          <LogOut className="h-4 w-4" />
          {submitting ? "Signing out..." : "Sign Out"}
        </span>
      </Button>
    </div>
  );
}

interface AuthFormViewProps {
  mode: "signin" | "signup";
  setMode: (mode: "signin" | "signup") => void;
  name: string;
  setName: (name: string) => void;
  email: string;
  setEmail: (email: string) => void;
  password: string;
  setPassword: (password: string) => void;
  submitting: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onClearErrors: () => void;
}

function AuthFormView({
  mode,
  setMode,
  name,
  setName,
  email,
  setEmail,
  password,
  setPassword,
  submitting,
  onSubmit,
  onClearErrors,
}: AuthFormViewProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="flex rounded-lg border border-border bg-muted/40 p-1">
        <button
          type="button"
          onClick={() => {
            setMode("signin");
            onClearErrors();
          }}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
            mode === "signin"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Sign In
        </button>
        <button
          type="button"
          onClick={() => {
            setMode("signup");
            onClearErrors();
          }}
          className={`flex-1 rounded-md py-1.5 text-xs font-medium transition-all ${
            mode === "signup"
              ? "bg-background text-foreground shadow-xs"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Sign Up
        </button>
      </div>

      {mode === "signup" && (
        <div className="space-y-1.5">
          <Label htmlFor="auth-name">Full Name</Label>
          <Input
            id="auth-name"
            type="text"
            placeholder="Jane Doe"
            value={name}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setName(e.target.value)}
            disabled={submitting}
            required
          />
        </div>
      )}

      <div className="space-y-1.5">
        <Label htmlFor="auth-email">Email Address</Label>
        <Input
          id="auth-email"
          type="email"
          placeholder="name@example.com"
          value={email}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
          disabled={submitting}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="auth-password">Password</Label>
        <Input
          id="auth-password"
          type="password"
          placeholder="••••••••"
          value={password}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
          disabled={submitting}
          required
          minLength={8}
        />
      </div>

      <Button type="submit" disabled={submitting} className="w-full">
        <span className="flex items-center justify-center gap-2">
          {mode === "signup" ? (
            <>
              <UserPlus className="h-4 w-4" />
              {submitting ? "Creating account..." : "Create Account"}
            </>
          ) : (
            <>
              <LogIn className="h-4 w-4" />
              {submitting ? "Signing in..." : "Sign In"}
            </>
          )}
        </span>
      </Button>
    </form>
  );
}

export function AuthCard() {
  const { data: session, isPending } = useSession();
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authSuccess, setAuthSuccess] = React.useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthSuccess(null);
    setSubmitting(true);

    try {
      if (mode === "signup") {
        const { error } = await signUp.email({
          email,
          password,
          name: name.trim() || (email.split("@")[0] ?? "User"),
        });
        if (error) {
          setAuthError(error.message || "Failed to sign up");
        } else {
          setAuthSuccess("Account created successfully!");
          setPassword("");
        }
      } else {
        const { error } = await signIn.email({
          email,
          password,
        });
        if (error) {
          setAuthError(error.message || "Invalid credentials");
        } else {
          setAuthSuccess("Signed in successfully!");
          setPassword("");
        }
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "An unexpected error occurred");
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setSubmitting(true);
    setAuthError(null);
    setAuthSuccess(null);
    try {
      await signOut();
      setAuthSuccess("Signed out successfully");
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : "Failed to sign out");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-primary" />
            <CardTitle>Authentication (Better Auth + D1)</CardTitle>
          </div>
          {session?.user && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              Authenticated
            </span>
          )}
        </div>
        <CardDescription>
          Production-grade Better Auth with D1 database rate limiting and dynamic base URL allowlist
        </CardDescription>
      </CardHeader>

      <CardContent>
        <div className="space-y-4">
          <AuthFeedback error={authError} success={authSuccess} />

          {isPending ? (
            <div className="flex items-center justify-center p-6 text-sm text-muted-foreground">
              Loading session status...
            </div>
          ) : session?.user ? (
            <ActiveSessionView
              session={session}
              submitting={submitting}
              onSignOut={() => void handleSignOut()}
            />
          ) : (
            <AuthFormView
              mode={mode}
              setMode={setMode}
              name={name}
              setName={setName}
              email={email}
              setEmail={setEmail}
              password={password}
              setPassword={setPassword}
              submitting={submitting}
              onSubmit={(e) => void handleSubmit(e)}
              onClearErrors={() => setAuthError(null)}
            />
          )}
        </div>
      </CardContent>

      <CardFooter>
        <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>Storage: Cloudflare D1 with database rate-limit counters</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            <span>Origin: Dynamic allowlist with explicit protocol</span>
          </div>
        </div>
      </CardFooter>
    </Card>
  );
}
