import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { ArrowLeft, Shield, Users, FileText, UserCheck, Search, Save, RefreshCw } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import TrustScoreBadge from "@/components/TrustScoreBadge";

interface UserProfile {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  trust_score: number | null;
  is_admin: boolean;
  created_at: string;
}

interface Exchange {
  id: string;
  creator_id: string;
  counterparty_id: string;
  title: string;
  description: string | null;
  amount: number | null;
  exchange_type: string;
  status: string;
  due_date: string | null;
  created_at: string;
  accepted_by_counterparty: boolean;
  creator_confirmed_settled: boolean;
  counterparty_confirmed_settled: boolean;
}

interface Friendship {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: string;
  created_at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const friendshipsTable = () => (supabase as any).from("friendships");

const Admin = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userAdminFilter, setUserAdminFilter] = useState("all");
  const [userScoreFilter, setUserScoreFilter] = useState("all");
  const [userSort, setUserSort] = useState("newest");
  const [exchangeFilter, setExchangeFilter] = useState("all");
  const [editingScore, setEditingScore] = useState<{ userId: string; score: string } | null>(null);
  const [editingStatus, setEditingStatus] = useState<{ id: string; status: string } | null>(null);
  const [loading, setLoading] = useState(true);

  // Check admin access
  useEffect(() => {
    if (!user) return;
    supabase
      .from("profiles")
      .select("is_admin")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        const admin = !!(data as UserProfile | null)?.is_admin;
        setIsAdmin(admin);
        if (!admin) navigate("/dashboard");
      });
  }, [user, navigate]);

  const loadUsers = useCallback(async () => {
    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, username, avatar_url, trust_score, is_admin, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    setUsers((data as UserProfile[]) || []);
  }, []);

  const loadExchanges = useCallback(async () => {
    const { data } = await supabase
      .from("exchanges")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setExchanges((data as Exchange[]) || []);
  }, []);

  const loadFriendships = useCallback(async () => {
    const { data } = await friendshipsTable()
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    setFriendships(data || []);
  }, []);

  useEffect(() => {
    if (isAdmin) {
      setLoading(true);
      Promise.all([loadUsers(), loadExchanges(), loadFriendships()])
        .finally(() => setLoading(false));
    }
  }, [isAdmin, loadUsers, loadExchanges, loadFriendships]);

  const getUserName = (userId: string) => {
    const u = users.find((p) => p.user_id === userId);
    return u?.display_name || u?.username || userId.slice(0, 8);
  };

  const handleSaveScore = async (userId: string) => {
    if (!editingScore) return;
    const score = parseInt(editingScore.score);
    if (isNaN(score) || score < 0 || score > 100) {
      toast.error("Score must be 0-100");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ trust_score: score })
      .eq("user_id", userId);
    if (error) toast.error(error.message);
    else {
      toast.success("Trust score updated");
      setEditingScore(null);
      loadUsers();
    }
  };

  const handleToggleAdmin = async (userId: string, currentAdmin: boolean) => {
    if (userId === user?.id) {
      toast.error("Cannot remove your own admin access");
      return;
    }
    const { error } = await supabase
      .from("profiles")
      .update({ is_admin: !currentAdmin })
      .eq("user_id", userId);
    if (error) toast.error(error.message);
    else {
      toast.success(currentAdmin ? "Admin removed" : "Admin granted");
      loadUsers();
    }
  };

  const handleUpdateExchangeStatus = async (exchangeId: string, newStatus: string) => {
    const updates: Record<string, unknown> = { status: newStatus };
    if (newStatus === "settled") {
      updates.creator_confirmed_settled = true;
      updates.counterparty_confirmed_settled = true;
    }
    const { error } = await supabase
      .from("exchanges")
      .update(updates)
      .eq("id", exchangeId);
    if (error) toast.error(error.message);
    else {
      toast.success("Exchange status updated");
      setEditingStatus(null);
      loadExchanges();
    }
  };

  const handleDeleteFriendship = async (id: string) => {
    const { error } = await friendshipsTable().delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Friendship removed");
      loadFriendships();
    }
  };

  if (isAdmin === null || loading) {
    return <div className="min-h-screen bg-background gradient-mesh flex items-center justify-center">
      <p className="text-muted-foreground">Loading admin console...</p>
    </div>;
  }

  const filteredUsers = users
    .filter((u) => {
      if (userSearch) {
        const q = userSearch.toLowerCase();
        if (
          !u.display_name?.toLowerCase().includes(q) &&
          !u.username?.toLowerCase().includes(q) &&
          !u.user_id.includes(q)
        ) return false;
      }
      if (userAdminFilter === "admin" && !u.is_admin) return false;
      if (userAdminFilter === "regular" && u.is_admin) return false;
      if (userScoreFilter === "high" && (u.trust_score ?? 60) < 75) return false;
      if (userScoreFilter === "medium" && ((u.trust_score ?? 60) < 40 || (u.trust_score ?? 60) >= 75)) return false;
      if (userScoreFilter === "low" && (u.trust_score ?? 60) >= 40) return false;
      return true;
    })
    .sort((a, b) => {
      if (userSort === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (userSort === "oldest") return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (userSort === "score_high") return (b.trust_score ?? 60) - (a.trust_score ?? 60);
      if (userSort === "score_low") return (a.trust_score ?? 60) - (b.trust_score ?? 60);
      if (userSort === "name") return (a.display_name || "").localeCompare(b.display_name || "");
      return 0;
    });

  const filteredExchanges = exchanges.filter((e) =>
    exchangeFilter === "all" ? true : e.status === exchangeFilter
  );

  const stats = {
    totalUsers: users.length,
    admins: users.filter((u) => u.is_admin).length,
    activeExchanges: exchanges.filter((e) => e.status === "active").length,
    pendingExchanges: exchanges.filter((e) => e.status === "pending").length,
    settledExchanges: exchanges.filter((e) => e.status === "settled").length,
    totalFriendships: friendships.filter((f) => f.status === "accepted").length,
    pendingRequests: friendships.filter((f) => f.status === "pending").length,
  };

  return (
    <div className="min-h-screen bg-background gradient-mesh">
      <header className="glass-strong border-b border-glass-border/30 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <Shield className="w-5 h-5 text-primary" />
          <h1 className="text-lg font-bold text-foreground">Admin Console</h1>
          <Button variant="ghost" size="sm" onClick={() => { loadUsers(); loadExchanges(); loadFriendships(); }} className="ml-auto text-muted-foreground gap-1">
            <RefreshCw className="w-4 h-4" /> Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Stats Overview */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total Users", value: stats.totalUsers, color: "text-primary" },
            { label: "Active Exchanges", value: stats.activeExchanges, color: "text-neon-green" },
            { label: "Pending Exchanges", value: stats.pendingExchanges, color: "text-neon-orange" },
            { label: "Friendships", value: stats.totalFriendships, color: "text-neon-blue" },
          ].map((stat) => (
            <motion.div key={stat.label} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
              <p className="text-xs text-muted-foreground mt-1">{stat.label}</p>
            </motion.div>
          ))}
        </div>

        <Tabs defaultValue="users">
          <TabsList className="bg-secondary/50 border border-glass-border/30">
            <TabsTrigger value="users" className="data-[state=active]:bg-primary/20 gap-1">
              <Users className="w-3.5 h-3.5" /> Users ({stats.totalUsers})
            </TabsTrigger>
            <TabsTrigger value="exchanges" className="data-[state=active]:bg-primary/20 gap-1">
              <FileText className="w-3.5 h-3.5" /> Exchanges ({exchanges.length})
            </TabsTrigger>
            <TabsTrigger value="friendships" className="data-[state=active]:bg-primary/20 gap-1">
              <UserCheck className="w-3.5 h-3.5" /> Friends ({friendships.length})
            </TabsTrigger>
          </TabsList>

          {/* USERS TAB */}
          <TabsContent value="users" className="space-y-4 mt-4">
            <div className="space-y-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search by name, username, or ID..."
                  className="pl-10 bg-secondary/50 border-glass-border/40 text-foreground"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={userAdminFilter} onValueChange={setUserAdminFilter}>
                  <SelectTrigger className="w-36 h-8 bg-secondary/50 border-glass-border/40 text-foreground text-xs">
                    <SelectValue placeholder="Role" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-glass-border/40">
                    <SelectItem value="all">All roles</SelectItem>
                    <SelectItem value="admin">Admins only</SelectItem>
                    <SelectItem value="regular">Regular users</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={userScoreFilter} onValueChange={setUserScoreFilter}>
                  <SelectTrigger className="w-36 h-8 bg-secondary/50 border-glass-border/40 text-foreground text-xs">
                    <SelectValue placeholder="Trust score" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-glass-border/40">
                    <SelectItem value="all">All scores</SelectItem>
                    <SelectItem value="high">High (75-100)</SelectItem>
                    <SelectItem value="medium">Medium (40-74)</SelectItem>
                    <SelectItem value="low">Low (0-39)</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={userSort} onValueChange={setUserSort}>
                  <SelectTrigger className="w-36 h-8 bg-secondary/50 border-glass-border/40 text-foreground text-xs">
                    <SelectValue placeholder="Sort by" />
                  </SelectTrigger>
                  <SelectContent className="bg-card border-glass-border/40">
                    <SelectItem value="newest">Newest first</SelectItem>
                    <SelectItem value="oldest">Oldest first</SelectItem>
                    <SelectItem value="score_high">Highest score</SelectItem>
                    <SelectItem value="score_low">Lowest score</SelectItem>
                    <SelectItem value="name">Name A-Z</SelectItem>
                  </SelectContent>
                </Select>
                <span className="text-xs text-muted-foreground self-center">{filteredUsers.length} result{filteredUsers.length !== 1 ? "s" : ""}</span>
              </div>
            </div>

            <div className="space-y-2">
              {filteredUsers.map((u) => (
                <div key={u.user_id} className="glass rounded-xl p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-foreground truncate">
                        {u.display_name || "No name"}
                      </p>
                      {u.is_admin && <span className="text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded-full font-bold">ADMIN</span>}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      @{u.username || "no-username"} &middot; {u.user_id.slice(0, 8)}...
                    </p>
                    <p className="text-xs text-muted-foreground/60">
                      Joined {new Date(u.created_at).toLocaleDateString()}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    {editingScore?.userId === u.user_id ? (
                      <div className="flex items-center gap-1">
                        <Input
                          type="number"
                          min="0"
                          max="100"
                          value={editingScore.score}
                          onChange={(e) => setEditingScore({ userId: u.user_id, score: e.target.value })}
                          className="w-20 h-8 bg-secondary/50 border-glass-border/40 text-foreground text-sm"
                        />
                        <Button size="sm" onClick={() => handleSaveScore(u.user_id)} className="h-8 bg-primary text-primary-foreground gap-1">
                          <Save className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingScore(null)} className="h-8">
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button onClick={() => setEditingScore({ userId: u.user_id, score: String(u.trust_score ?? 60) })} className="cursor-pointer">
                        <TrustScoreBadge score={u.trust_score ?? 60} size="sm" />
                      </button>
                    )}

                    <Button
                      size="sm"
                      variant={u.is_admin ? "default" : "ghost"}
                      onClick={() => handleToggleAdmin(u.user_id, u.is_admin)}
                      className={`h-8 text-xs ${u.is_admin ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                    >
                      <Shield className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))}
              {filteredUsers.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No users found</p>
              )}
            </div>
          </TabsContent>

          {/* EXCHANGES TAB */}
          <TabsContent value="exchanges" className="space-y-4 mt-4">
            <Select value={exchangeFilter} onValueChange={setExchangeFilter}>
              <SelectTrigger className="w-48 bg-secondary/50 border-glass-border/40 text-foreground">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent className="bg-card border-glass-border/40">
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="settled">Settled</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
                <SelectItem value="disputed">Disputed</SelectItem>
              </SelectContent>
            </Select>

            <div className="space-y-2">
              {filteredExchanges.map((e) => (
                <div key={e.id} className="glass rounded-xl p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{e.title}</p>
                      <p className="text-sm text-muted-foreground">
                        {getUserName(e.creator_id)} &rarr; {getUserName(e.counterparty_id)}
                      </p>
                      {e.description && <p className="text-xs text-muted-foreground/60 mt-1 line-clamp-1">{e.description}</p>}
                    </div>
                    <div className="text-right flex-shrink-0">
                      {e.amount && <p className="font-bold text-foreground">${Number(e.amount).toFixed(2)}</p>}
                      <p className="text-xs text-muted-foreground capitalize">{e.exchange_type}</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span>Created {new Date(e.created_at).toLocaleDateString()}</span>
                      {e.due_date && <span>&middot; Due {new Date(e.due_date).toLocaleDateString()}</span>}
                    </div>

                    {editingStatus?.id === e.id ? (
                      <div className="flex items-center gap-1">
                        <Select value={editingStatus.status} onValueChange={(v) => setEditingStatus({ id: e.id, status: v })}>
                          <SelectTrigger className="w-32 h-7 bg-secondary/50 border-glass-border/40 text-foreground text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent className="bg-card border-glass-border/40">
                            <SelectItem value="pending">Pending</SelectItem>
                            <SelectItem value="active">Active</SelectItem>
                            <SelectItem value="settled">Settled</SelectItem>
                            <SelectItem value="cancelled">Cancelled</SelectItem>
                            <SelectItem value="disputed">Disputed</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" onClick={() => handleUpdateExchangeStatus(e.id, editingStatus.status)} className="h-7 text-xs bg-primary text-primary-foreground">
                          Save
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingStatus(null)} className="h-7 text-xs">
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setEditingStatus({ id: e.id, status: e.status })}
                        className={`px-2 py-0.5 rounded-full text-xs font-medium cursor-pointer ${
                          e.status === "active" ? "bg-neon-green/20 text-neon-green" :
                          e.status === "settled" ? "bg-primary/20 text-primary" :
                          e.status === "pending" ? "bg-neon-orange/20 text-neon-orange" :
                          e.status === "cancelled" ? "bg-destructive/20 text-destructive" :
                          "bg-secondary text-muted-foreground"
                        }`}
                      >
                        {e.status}
                      </button>
                    )}
                  </div>

                  <div className="flex gap-4 text-[10px] text-muted-foreground/50">
                    <span>Accepted: {e.accepted_by_counterparty ? "Yes" : "No"}</span>
                    <span>Creator settled: {e.creator_confirmed_settled ? "Yes" : "No"}</span>
                    <span>Counterparty settled: {e.counterparty_confirmed_settled ? "Yes" : "No"}</span>
                  </div>
                </div>
              ))}
              {filteredExchanges.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No exchanges found</p>
              )}
            </div>
          </TabsContent>

          {/* FRIENDSHIPS TAB */}
          <TabsContent value="friendships" className="space-y-4 mt-4">
            <div className="space-y-2">
              {friendships.map((f) => (
                <div key={f.id} className="glass rounded-xl p-4 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-foreground">
                      <span className="font-medium">{getUserName(f.requester_id)}</span>
                      <span className="text-muted-foreground mx-2">&rarr;</span>
                      <span className="font-medium">{getUserName(f.addressee_id)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(f.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    f.status === "accepted" ? "bg-neon-green/20 text-neon-green" :
                    f.status === "pending" ? "bg-neon-orange/20 text-neon-orange" :
                    "bg-secondary text-muted-foreground"
                  }`}>
                    {f.status}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleDeleteFriendship(f.id)}
                    className="text-destructive/60 hover:text-destructive text-xs h-7"
                  >
                    Remove
                  </Button>
                </div>
              ))}
              {friendships.length === 0 && (
                <p className="text-center py-8 text-muted-foreground">No friendships found</p>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Admin;
