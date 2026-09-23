import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import logoBegin from "@/assets/logo-begin.png";

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [visible, setVisible] = useState(true);
  const reduceMotion = useReducedMotion();

  useEffect(() => {
    // Skip splash on returning visits within the same session
    if (sessionStorage.getItem("splash_shown")) {
      setVisible(false);
      onComplete();
      return;
    }
    sessionStorage.setItem("splash_shown", "1");
    const timer = setTimeout(() => {
      setVisible(false);
      setTimeout(onComplete, 500);
    }, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduceMotion ? 0 : 0.32 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
          role="status"
          aria-label="Carregando Liberty Begin"
        >
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.32, ease: "easeOut" }}
          >
            <img src={logoBegin} alt="Begin by Liberty" className="h-12 object-contain" />
          </motion.div>

          {/* Linha de progresso única (não repete) */}
          <div className="mt-8 w-32 h-0.5 rounded-full bg-muted relative overflow-hidden" aria-hidden>
            <motion.div
              initial={{ width: reduceMotion ? "100%" : "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: reduceMotion ? 0 : 1.4, ease: "easeOut", delay: reduceMotion ? 0 : 0.3 }}
              className="absolute inset-y-0 left-0 rounded-full bg-primary"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
