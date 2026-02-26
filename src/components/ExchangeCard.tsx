import { Tables } from "@/integrations/supabase/types";
import { motion } from "framer-motion";
import { DollarSign, Heart, Package, HelpCircle, Clock, CheckCircle2, AlertTriangle } from "lucide-react";
import { format } from "date-fns";

interface ExchangeCardProps {
  exchange: Tables<"exchanges">;
  otherUserName: string;
  currentUserId: string;
  onClick: () => void;
}

const typeIcons: Record<string, React.ReactNode> = {
  money: <DollarSign className="w-4 h-4" />,
  favor: <Heart className="w-4 h-4" />,
  item: <Package className="w-4 h-4" />,
  other: <HelpCircle className="w-4 h-4" />,
};

const typeColors: Record<string, string> = {
  money: "text-neon-green",
  favor: "text-primary",
  item: "text-neon-orange",
  other: "text-muted-foreground",
};

const statusConfig: Record<string, { icon: React.ReactNode; label: string; color: string }> = {
  pending: { icon: <Clock className="w-3.5 h-3.5" />, label: "Awaiting Acceptance", color: "text-neon-orange" },
  active: { icon: <Clock className="w-3.5 h-3.5" />, label: "Active", color: "text-primary" },
  settled: { icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: "Settled", color: "text-neon-green" },
  disputed: { icon: <AlertTriangle className="w-3.5 h-3.5" />, label: "Disputed", color: "text-destructive" },
  cancelled: { icon: <Clock className="w-3.5 h-3.5" />, label: "Cancelled", color: "text-muted-foreground" },
};

const ExchangeCard = ({ exchange, otherUserName, currentUserId, onClick }: ExchangeCardProps) => {
  const isCreator = exchange.creator_id === currentUserId;
  const status = statusConfig[exchange.status] || statusConfig.pending;
  const typeColor = typeColors[exchange.exchange_type] || typeColors.other;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className="w-full text-left glass rounded-xl p-4 hover:border-primary/30 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className={`flex-shrink-0 w-10 h-10 rounded-lg bg-secondary flex items-center justify-center ${typeColor}`}>
            {typeIcons[exchange.exchange_type]}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-foreground truncate">{exchange.title}</h3>
            <p className="text-sm text-muted-foreground">
              {isCreator ? "You → " : ""}{otherUserName}{!isCreator ? " → You" : ""}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          {exchange.amount && (
            <p className={`font-bold ${typeColor}`}>
              ${Number(exchange.amount).toFixed(2)}
            </p>
          )}
          <div className={`flex items-center gap-1 text-xs ${status.color}`}>
            {status.icon}
            {status.label}
          </div>
        </div>
      </div>
      {exchange.due_date && (
        <p className="text-xs text-muted-foreground mt-2">
          Due {format(new Date(exchange.due_date), "MMM d, yyyy")}
        </p>
      )}
    </motion.button>
  );
};

export default ExchangeCard;
