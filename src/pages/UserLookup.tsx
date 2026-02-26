import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { motion } from "framer-motion";
import { Search, ArrowLeft, User } from "lucide-react";
import { useNavigate } from "react-router-dom";
import TrustScoreBadge from "@/components/TrustScoreBadge";

interface ProfileResult {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  trust_score: number;
}

const UserLookup = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ProfileResult[]>([]);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || !user) return;

    const { data } = await supabase
      .from("profiles")
      .select("user_id, display_name, username, avatar_url, trust_score")
      .neq("user_id", user.id)
      .or(`username.ilike.%${query.trim()}%,display_name.ilike.%${query.trim()}%`)
      .limit(20);

    setResults((data as ProfileResult[]) || []);
    setSearched(true);
  };

  return (
    <div className="min-h-screen bg-background gradient-mesh">
      <header className="glass-strong border-b border-glass-border/30 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="text-lg font-bold text-foreground">Find People</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <form onSubmit={handleSearch} className="flex gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by @username or name..."
              className="pl-10 bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <Button type="submit" className="bg-primary text-primary-foreground hover:bg-primary/90">
            Search
          </Button>
        </form>

        <div className="space-y-3">
          {searched && results.length === 0 && (
            <p className="text-center py-12 text-muted-foreground">No users found</p>
          )}
          {results.map((p, i) => (
            <motion.div
              key={p.user_id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
              className="glass rounded-xl p-4 flex items-center gap-4"
            >
              <Avatar className="w-12 h-12 border border-glass-border/30">
                <AvatarImage src={p.avatar_url || undefined} />
                <AvatarFallback className="bg-secondary text-muted-foreground">
                  <User className="w-5 h-5" />
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground truncate">
                  {p.display_name || p.username || "User"}
                </p>
                {p.username && (
                  <p className="text-sm text-muted-foreground">@{p.username}</p>
                )}
              </div>
              <TrustScoreBadge score={p.trust_score} size="sm" />
            </motion.div>
          ))}
        </div>
      </main>
    </div>
  );
};

export default UserLookup;
