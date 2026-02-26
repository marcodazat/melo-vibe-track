import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Tables } from "@/integrations/supabase/types";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { CheckCircle2, FileText, Send, X, Shield } from "lucide-react";
import { format } from "date-fns";
import TrustScoreBadge from "@/components/TrustScoreBadge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ExchangeDetailProps {
  exchange: Tables<"exchanges"> | null;
  otherUserProfile: (Tables<"profiles"> & { trust_score?: number }) | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

const ExchangeDetail = ({ exchange, otherUserProfile, open, onClose, onUpdate }: ExchangeDetailProps) => {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Tables<"messages">[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!exchange) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("exchange_id", exchange.id)
        .order("created_at", { ascending: true });
      setMessages(data || []);
    };

    fetchMessages();

    const channel = supabase
      .channel(`messages-${exchange.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `exchange_id=eq.${exchange.id}`,
      }, (payload) => {
        setMessages((prev) => [...prev, payload.new as Tables<"messages">]);
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [exchange]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!exchange || !user) return null;

  const isCreator = exchange.creator_id === user.id;
  const myConfirmed = isCreator ? exchange.creator_confirmed_settled : exchange.counterparty_confirmed_settled;
  const otherConfirmed = isCreator ? exchange.counterparty_confirmed_settled : exchange.creator_confirmed_settled;

  const handleConfirmSettle = async () => {
    const field = isCreator ? "creator_confirmed_settled" : "counterparty_confirmed_settled";
    const updates: Record<string, unknown> = { [field]: true };

    // If both will now be confirmed, mark as settled
    if (otherConfirmed) {
      updates.status = "settled";
    }

    const { error } = await supabase.from("exchanges").update(updates).eq("id", exchange.id);
    if (error) toast.error(error.message);
    else {
      toast.success(otherConfirmed ? "Exchange settled!" : "You confirmed. Waiting on the other party.");
      onUpdate();
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim()) return;

    setSending(true);
    const { error } = await supabase.from("messages").insert({
      exchange_id: exchange.id,
      sender_id: user.id,
      content: newMessage.trim(),
    });

    if (error) toast.error(error.message);
    else setNewMessage("");
    setSending(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="glass-strong border-glass-border/40 text-foreground max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">{exchange.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-y-auto">
          {/* Info */}
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <span className="text-muted-foreground">With</span>
              <p className="font-medium text-foreground">{otherUserProfile?.display_name || otherUserProfile?.username || "User"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Amount</span>
              <p className="font-medium text-foreground">{exchange.amount ? `$${Number(exchange.amount).toFixed(2)}` : "N/A"}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Type</span>
              <p className="font-medium text-foreground capitalize">{exchange.exchange_type}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Status</span>
              <p className="font-medium text-foreground capitalize">{exchange.status}</p>
            </div>
          </div>

          {exchange.description && (
            <p className="text-sm text-muted-foreground">{exchange.description}</p>
          )}

          {exchange.contract_terms && (
            <div className="bg-secondary/50 rounded-lg p-3">
              <p className="text-xs text-muted-foreground flex items-center gap-1 mb-1"><FileText className="w-3 h-3" /> Contract</p>
              <p className="text-sm text-foreground">{exchange.contract_terms}</p>
            </div>
          )}

          {/* Settle */}
          {exchange.status !== "settled" && exchange.status !== "cancelled" && (
            <div className="bg-secondary/30 rounded-lg p-3 space-y-2">
              <p className="text-sm font-medium text-foreground">Settlement</p>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className={`w-4 h-4 ${myConfirmed ? "text-neon-green" : "text-muted-foreground"}`} />
                <span className={myConfirmed ? "text-neon-green" : "text-muted-foreground"}>You {myConfirmed ? "confirmed" : "haven't confirmed"}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <CheckCircle2 className={`w-4 h-4 ${otherConfirmed ? "text-neon-green" : "text-muted-foreground"}`} />
                <span className={otherConfirmed ? "text-neon-green" : "text-muted-foreground"}>
                  {otherUserProfile?.display_name || "Other"} {otherConfirmed ? "confirmed" : "hasn't confirmed"}
                </span>
              </div>
              {!myConfirmed && (
                <Button onClick={handleConfirmSettle} size="sm" className="bg-neon-green text-primary-foreground hover:bg-neon-green/90">
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Confirm Settled
                </Button>
              )}
            </div>
          )}

          {/* Messages */}
          <div className="border-t border-glass-border/30 pt-3">
            <p className="text-sm font-medium text-foreground mb-2">Messages</p>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {messages.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4">No messages yet</p>
              )}
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.sender_id === user.id ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    msg.sender_id === user.id
                      ? "bg-primary/20 text-foreground"
                      : "bg-secondary text-foreground"
                  }`}>
                    {msg.content}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {format(new Date(msg.created_at), "h:mm a")}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSendMessage} className="flex gap-2 mt-3">
              <Input
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder="Type a message..."
                className="bg-secondary/50 border-glass-border/40 text-foreground placeholder:text-muted-foreground/50"
              />
              <Button type="submit" size="icon" disabled={sending || !newMessage.trim()} className="bg-primary text-primary-foreground hover:bg-primary/90 flex-shrink-0">
                <Send className="w-4 h-4" />
              </Button>
            </form>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ExchangeDetail;
