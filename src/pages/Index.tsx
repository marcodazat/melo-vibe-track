import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import { ArrowRight, DollarSign, Heart, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import meloLogo from "@/assets/melo-logo.png";

const Index = () => {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && user) navigate("/dashboard");
  }, [user, loading, navigate]);

  return (
    <div className="min-h-screen bg-background gradient-mesh flex flex-col">
      <main className="flex-1 flex items-center justify-center px-4">
        <div className="max-w-lg text-center">
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: "spring", duration: 0.8 }}
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl bg-primary/10 neon-glow-strong mb-8"
          >
            <Music className="w-10 h-10 text-primary" />
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-5xl font-extrabold neon-text text-primary mb-4"
          >
            Melo
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="text-lg text-muted-foreground mb-8 leading-relaxed"
          >
            Track favors, IOUs, and shared expenses with friends.
            No guilt. No stress. Just clarity.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="flex flex-col sm:flex-row gap-3 justify-center mb-12"
          >
            <Button
              onClick={() => navigate("/auth")}
              className="bg-primary text-primary-foreground hover:bg-primary/90 neon-glow font-semibold text-lg px-8 py-6"
            >
              Get Started <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </motion.div>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="grid grid-cols-3 gap-6"
          >
            {[
              { icon: <DollarSign className="w-5 h-5" />, label: "Track money", color: "text-neon-green" },
              { icon: <Heart className="w-5 h-5" />, label: "Log favors", color: "text-primary" },
              { icon: <Shield className="w-5 h-5" />, label: "Stay honest", color: "text-neon-orange" },
            ].map((feature, i) => (
              <div key={i} className="flex flex-col items-center gap-2">
                <div className={`w-12 h-12 rounded-xl bg-secondary flex items-center justify-center ${feature.color}`}>
                  {feature.icon}
                </div>
                <span className="text-sm text-muted-foreground">{feature.label}</span>
              </div>
            ))}
          </motion.div>
        </div>
      </main>

      <footer className="text-center py-6 text-xs text-muted-foreground/50">
        Built with trust in mind
      </footer>
    </div>
  );
};

export default Index;
