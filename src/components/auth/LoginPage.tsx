// src/components/auth/LoginPage.tsx
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import logo from "@/assets/Simbol_Web2.png";

export function LoginPage() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (err: any) {
      setError(err.message ?? "Credencials incorrectes");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F7F8]">
      <Card className="w-full max-w-sm p-8 space-y-6 shadow-lg border-0">
        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-16 rounded-full overflow-hidden bg-[#0099A8]/10 flex items-center justify-center">
            <img src={logo} alt="CBT" className="h-14 w-14 object-contain" />
          </div>
          <div className="text-center">
            <div className="text-xs text-muted-foreground uppercase tracking-widest">Consorci Besòs · Tordera</div>
            <h1 className="text-xl font-bold text-[#006E7A]">CBT · TaulaMaster</h1>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-medium">Correu electrònic</label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuari@example.com"
              required
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium">Contrasenya</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            type="submit"
            className="w-full bg-[#0099A8] hover:bg-[#006E7A]"
            disabled={loading}
          >
            {loading ? "Accedint…" : "Accedeix"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
