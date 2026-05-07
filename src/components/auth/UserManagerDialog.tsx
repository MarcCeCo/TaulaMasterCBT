// src/components/auth/UserManagerDialog.tsx
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/lib/supabase";
import { useAuth, type UserRole, type UserProfile } from "@/lib/auth";
import { Pencil, Trash2, UserPlus, RefreshCw, Mail } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (b: boolean) => void;
}

const ROLE_LABELS: Record<UserRole, string> = {
  viewer: "Visualitzador",
  editor: "Editor",
  admin: "Administrador",
};

const ROLE_COLORS: Record<UserRole, string> = {
  viewer: "bg-slate-100 text-slate-700",
  editor: "bg-blue-100 text-blue-700",
  admin: "bg-violet-100 text-violet-700",
};

export function UserManagerDialog({ open, onOpenChange }: Props) {
  const { profile: myProfile } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(false);

  // Formulari nou usuari
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("viewer");
  const [submitting, setSubmitting] = useState(false);

  // Edició rol
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>("viewer");

  const fetchUsers = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("user_profiles")
      .select("id, email, full_name, role")
      .order("email");
    if (!error && data) setUsers(data as UserProfile[]);
    setLoading(false);
  };

  useEffect(() => {
    if (open) fetchUsers();
  }, [open]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password.trim()) return toast.error("Correu i contrasenya obligatoris");
    setSubmitting(true);
    try {
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token ?? ""}`,
        },
        body: JSON.stringify({ email: email.trim(), password, full_name: fullName.trim(), role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error creant usuari");
      toast.success(`Usuari ${email} creat correctament`);
      setEmail(""); setFullName(""); setPassword(""); setRole("viewer");
      await fetchUsers();
    } catch (err: any) {
      toast.error(err.message ?? "Error desconegut");
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateRole = async (userId: string) => {
    const { error } = await supabase
      .from("user_profiles")
      .update({ role: editRole })
      .eq("id", userId);
    if (error) return toast.error("Error actualitzant rol");
    toast.success("Rol actualitzat");
    setEditingId(null);
    await fetchUsers();
  };

  const handleDelete = async (userId: string, userEmail: string) => {
    // Només actualitzem el rol a viewer (no podem esborrar usuaris des del client anon)
    // Per esborrar caldria l'API admin. Marquem com a viewer i notifiquem.
    const { error } = await supabase
      .from("user_profiles")
      .update({ role: "viewer" })
      .eq("id", userId);
    if (error) return toast.error("Error desactivant usuari");
    toast.success(`${userEmail} degradat a visualitzador`);
    await fetchUsers();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5 text-[#0099A8]" />
            Gestió d'usuaris i permisos
          </DialogTitle>
        </DialogHeader>

        {/* Formulari invitació */}
        <div className="border rounded-md p-4 bg-muted/30 space-y-3">
          <p className="text-sm font-medium text-[#006E7A]">Convidar nou usuari</p>
          <form onSubmit={handleInvite} className="flex flex-wrap gap-2 items-end">
            <div className="space-y-1 flex-1 min-w-[180px]">
              <label className="text-xs font-medium">Correu *</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuari@example.com"
                required
              />
            </div>
            <div className="space-y-1 flex-1 min-w-[140px]">
              <label className="text-xs font-medium">Nom complet</label>
              <Input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Nom i cognoms"
              />
            </div>
            <div className="space-y-1 min-w-[160px]">
              <label className="text-xs font-medium">Contrasenya inicial *</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="mínim 6 caràcters"
                required
                minLength={6}
              />
            </div>
            <div className="space-y-1 w-40">
              <label className="text-xs font-medium">Rol</label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viewer">Visualitzador</SelectItem>
                  <SelectItem value="editor">Editor</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={submitting} className="bg-[#0099A8] hover:bg-[#006E7A] gap-1.5">
              <Mail className="h-4 w-4" />
              {submitting ? "Creant…" : "Crea usuari"}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">
            <strong>Visualitzador:</strong> només pot consultar dades. &nbsp;
            <strong>Editor:</strong> pot crear, editar i esborrar registres. &nbsp;
            <strong>Administrador:</strong> accés complet incloent gestió d'usuaris.
          </p>
        </div>

        {/* Llista d'usuaris */}
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{users.length} usuari{users.length !== 1 ? "s" : ""}</p>
          <Button variant="ghost" size="sm" onClick={fetchUsers} disabled={loading} className="gap-1.5">
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
            Actualitza
          </Button>
        </div>

        <div className="border rounded-md flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted border-b">
              <tr className="text-left">
                <th className="p-2 text-xs font-semibold">Correu</th>
                <th className="p-2 text-xs font-semibold">Nom</th>
                <th className="p-2 text-xs font-semibold">Rol</th>
                <th className="p-2 w-32 text-xs font-semibold">Accions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const isMe = u.id === myProfile?.id;
                const isEditing = editingId === u.id;
                return (
                  <tr key={u.id} className={cn("border-t hover:bg-muted/30", isMe && "bg-[#0099A8]/5")}>
                    <td className="p-2 font-mono text-xs">
                      {u.email}
                      {isMe && <Badge className="ml-2 text-[10px] px-1.5 py-0 bg-[#0099A8]">Jo</Badge>}
                    </td>
                    <td className="p-2 text-xs">{u.full_name ?? "—"}</td>
                    <td className="p-2">
                      {isEditing ? (
                        <Select value={editRole} onValueChange={(v) => setEditRole(v as UserRole)}>
                          <SelectTrigger className="h-7 text-xs w-36">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="viewer">Visualitzador</SelectItem>
                            <SelectItem value="editor">Editor</SelectItem>
                            <SelectItem value="admin">Administrador</SelectItem>
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge className={cn("text-xs font-normal border-0", ROLE_COLORS[u.role as UserRole])}>
                          {ROLE_LABELS[u.role as UserRole] ?? u.role}
                        </Badge>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex gap-1">
                        {isEditing ? (
                          <>
                            <Button size="sm" className="h-7 text-xs bg-[#0099A8] hover:bg-[#006E7A]" onClick={() => handleUpdateRole(u.id)}>
                              Desa
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingId(null)}>
                              Cancel·la
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button
                              size="icon" variant="ghost" className="h-7 w-7"
                              disabled={isMe}
                              onClick={() => { setEditingId(u.id); setEditRole(u.role as UserRole); }}
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {!isMe && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive">
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Degradar usuari?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      {u.email} perdrà els permisos actuals i passarà a ser visualitzador. Per eliminar-lo completament cal accedir al panell de Supabase.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel·la</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => handleDelete(u.id, u.email)}>
                                      Degrada a visualitzador
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {users.length === 0 && !loading && (
                <tr><td colSpan={4} className="p-8 text-center text-muted-foreground">Cap usuari trobat</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}
