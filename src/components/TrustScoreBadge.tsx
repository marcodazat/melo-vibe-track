import { motion } from "framer-motion";
import { Shield } from "lucide-react";

interface TrustScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}

const getScoreColor = (score: number) => {
  if (score >= 80) return "text-neon-green";
  if (score >= 60) return "text-primary";
  if (score >= 40) return "text-neon-orange";
  return "text-destructive";
};

const getScoreGlow = (score: number) => {
  if (score >= 80) return "shadow-[0_0_12px_hsl(var(--neon-green)/0.4)]";
  if (score >= 60) return "shadow-[0_0_12px_hsl(var(--neon-glow)/0.3)]";
  if (score >= 40) return "shadow-[0_0_12px_hsl(var(--neon-orange)/0.3)]";
  return "shadow-[0_0_12px_hsl(var(--destructive)/0.3)]";
};

const getScoreLabel = (score: number) => {
  if (score >= 80) return "Excellent";
  if (score >= 60) return "Good";
  if (score >= 40) return "Fair";
  if (score >= 20) return "Poor";
  return "Very Poor";
};

const sizeConfig = {
  sm: { ring: "w-10 h-10", text: "text-xs", icon: "w-3 h-3" },
  md: { ring: "w-16 h-16", text: "text-lg", icon: "w-4 h-4" },
  lg: { ring: "w-24 h-24", text: "text-2xl", icon: "w-5 h-5" },
};

const TrustScoreBadge = ({ score, size = "md", showLabel = false }: TrustScoreBadgeProps) => {
  const color = getScoreColor(score);
  const glow = getScoreGlow(score);
  const label = getScoreLabel(score);
  const cfg = sizeConfig[size];

  return (
    <div className="flex flex-col items-center gap-1">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`${cfg.ring} rounded-full border-2 border-current ${color} ${glow} flex items-center justify-center bg-secondary/50`}
      >
        <span className={`font-bold ${cfg.text} ${color}`}>{score}</span>
      </motion.div>
      {showLabel && (
        <div className="flex items-center gap-1">
          <Shield className={`${cfg.icon} ${color}`} />
          <span className={`text-xs font-medium ${color}`}>{label}</span>
        </div>
      )}
    </div>
  );
};

export default TrustScoreBadge;
