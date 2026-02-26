import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tables } from "@/integrations/supabase/types";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Music, LogOut, User, Search, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ExchangeCard from "@/components/ExchangeCard";
import CreateExchangeDialog from "@/components/CreateExchangeDialog";
import ExchangeDetail from "@/components/ExchangeDetail";
import TrustScoreBadge from "@/components/TrustScoreBadge";
import NotificationBell from "@/components/NotificationBell";

const Dashboard = () => {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [exchanges, setExchanges] = useState<Tables<"exchanges">[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Tables<"profiles">>>({});
  const [myProfile, setMyProfile] = useState<Tables<"profiles"> | null>(null);
  const [selectedExchange, setSelectedExchange] = useState<Tables<"exchanges"> | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [activeTab, setActiveTab] = useState("active");

  const fetchExchanges = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("exchanges")
      .select("*")
      .order("created_at", { ascending: false });

    if (data) {
      setExchanges(data);
      // Fetch profiles for all counterparties
      const userIds = new Set<string>();
      data.forEach((e) => {
        userIds.add(e.creator_id);
        userIds.add(e.counterparty_id);
      });
      userIds.delete(user.id);

      if (userIds.size > 0) {
        const { data: profileData } = await supabase
          .from("profiles")
          .select("*")
          .in("user_id", Array.from(userIds));

        if (profileData) {
          const map: Record<string, Tables<"profiles">> = {};
          profileData.forEach((p) => { map[p.user_id] = p; });
          setProfiles(map);
        }
      }
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    supabase
      .from("profiles")
      .select("*")
      .eq("user_id", user.id)
      .single()
      .then(({ data }) => {
        setMyProfile(data);
        if (data && !data.username && !data.display_name) {
          navigate("/profile");
        }
      });

    fetchExchanges();
  }, [user, fetchExchanges, navigate]);

  const getOtherUserId = (e: Tables<"exchanges">) =>
    e.creator_id === user?.id ? e.counterparty_id : e.creator_id;

  const getOtherUserName = (e: Tables<"exchanges">) => {
    const p = profiles[getOtherUserId(e)];
    return p?.display_name || p?.username || "User";
  };

  const filteredExchanges = exchanges.filter((e) => {
    const matchesSearch = searchFilter
      ? e.title.toLowerCase().includes(searchFilter.toLowerCase()) ||
        getOtherUserName(e).toLowerCase().includes(searchFilter.toLowerCase())
      : true;

    if (activeTab === "active") return matchesSearch && ["pending", "active"].includes(e.status);
    if (activeTab === "settled") return matchesSearch && e.status === "settled";
    return matchesSearch;
  });

  const activeCount = exchanges.filter((e) => ["pending", "active"].includes(e.status)).length;
  const settledCount = exchanges.filter((e) => e.status === "settled").length;

  return (
    <div className="min-h-screen bg-background gradient-mesh">
      {/* Header */}
      <header className="glass-strong border-b border-glass-border/30 sticky top-0 z-50">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Music className="w-6 h-6 text-primary" />
            <h1 className="text-lg font-bold neon-text text-primary">Melo</h1>
          </div>
          <div className="flex items-center gap-1">
            <NotificationBell />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/lookup")}
              className="text-muted-foreground hover:text-foreground"
            >
              <Users className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => navigate("/profile")}
              className="text-muted-foreground hover:text-foreground"
            >
              <User className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground"
            >
              <LogOut className="w-5 h-5" />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Welcome */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-foreground">
              Hey{myProfile?.display_name ? `, ${myProfile.display_name}` : ""} 👋
            </h2>
            <p className="text-muted-foreground">
              {activeCount === 0
                ? "No active exchanges. Create one!"
                : `You have ${activeCount} active exchange${activeCount > 1 ? "s" : ""}`}
            </p>
          </div>
          {myProfile && <TrustScoreBadge score={(myProfile as Tables<"profiles"> & { trust_score?: number }).trust_score ?? 60} size="md" showLabel />}
        </motion.div>

        {/* Actions */}
        <div className="flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              placeholder="Search exchanges..."
              className="pl-10 bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50"
            />
          </div>
          <CreateExchangeDialog onCreated={fetchExchanges} />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="bg-secondary/50 border border-glass-border/30">
            <TabsTrigger value="active" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
              Active ({activeCount})
            </TabsTrigger>
            <TabsTrigger value="settled" className="data-[state=active]:bg-neon-green/20 data-[state=active]:text-neon-green">
              Settled ({settledCount})
            </TabsTrigger>
            <TabsTrigger value="all" className="data-[state=active]:bg-foreground/10 data-[state=active]:text-foreground">
              All
            </TabsTrigger>
          </TabsList>

          <TabsContent value={activeTab} className="mt-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              {filteredExchanges.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <p>No exchanges here yet</p>
                </div>
              ) : (
                filteredExchanges.map((exchange, i) => (
                  <motion.div
                    key={exchange.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05 }}
                  >
                    <ExchangeCard
                      exchange={exchange}
                      otherUserName={getOtherUserName(exchange)}
                      currentUserId={user?.id || ""}
                      onClick={() => setSelectedExchange(exchange)}
                    />
                  </motion.div>
                ))
              )}
            </motion.div>
          </TabsContent>
        </Tabs>
      </main>

      {/* Exchange detail */}
      <ExchangeDetail
        exchange={selectedExchange}
        otherUserProfile={selectedExchange ? profiles[getOtherUserId(selectedExchange)] || null : null}
        open={!!selectedExchange}
        onClose={() => setSelectedExchange(null)}
        onUpdate={() => {
          fetchExchanges();
          setSelectedExchange(null);
        }}
      />
    </div>
  );
};

export default Dashboard;
