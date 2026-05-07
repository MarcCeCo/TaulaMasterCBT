// src/components/auth/LoginPage.tsx
// Pàgina de login

import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Loader2, LogIn, AlertCircle } from "lucide-react";
import logo from "@/assets/Simbol_Web2.png";

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: any) {
      setError(
        err.message === "Invalid login credentials"
          ? "Correu o contrasenya incorrectes"
          : err.message ?? "Error inesperat"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7F8]">
      <div className="w-full max-w-sm px-4">
        {/* Header */}
        <div className="flex flex-col items-center mb-8">
          <div
            className="h-16 w-16 rounded-full flex items-center justify-center mb-4 shadow-md"
            style={{ background: "linear-gradient(135deg, #006E7A 0%, #0099A8 100%)" }}
          >
            <img src={logo} alt="CBT" className="h-12 w-12 object-contain rounded-full" />
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-widest font-medium">Consorci Besòs · Tordera</div>
            <h1 className="text-2xl font-bold text-[#006E7A] mt-1">CBT · TaulaMaster</h1>
            <p className="text-sm text-muted-foreground mt-1">Accedeix al teu compte</p>
          </div>
        </div>

        {/* Form */}
        <Card className="p-6 border-0 shadow-lg bg-white">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Correu electrònic</Label>
              <Input
                id="email"
                type="email"
                placeholder="nom@exemple.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="h-10"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Contrasenya</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="current-password"
                className="h-10"
              />
            </div>

            {error && (
              <Alert variant="destructive" className="py-2.5 text-sm flex gap-2 items-center">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </Alert>
            )}

            <Button
              type="submit"
              className="w-full h-10 gap-2"
              style={{ background: "linear-gradient(135deg, #006E7A 0%, #0099A8 100%)" }}
              disabled={loading}
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {loading ? "Accedint…" : "Accedir"}
            </Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
