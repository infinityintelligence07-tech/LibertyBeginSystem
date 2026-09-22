import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import iconBegin from "@/assets/icon-begin.png";
import logoBegin from "@/assets/logo-begin.png";

interface SplashScreenProps {
  onComplete: () => void;
}

export const SplashScreen = ({ onComplete }: SplashScreenProps) => {
  const [visible, setVisible] = useState(true);

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
          transition={{ duration: 0.5 }}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background"
        >
          {/* Watermark lion */}
          <img
            src={iconBegin}
            alt=""
            className="absolute w-[600px] opacity-[0.04] pointer-events-none"
          />

          {/* Logo */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6 }}
            className="z-10"
          >
            <img src={logoBegin} alt="Begin by Liberty" className="h-14 object-contain" />
          </motion.div>

          {/* Silver line animation */}
          <div className="mt-10 w-40 h-px bg-muted relative overflow-hidden z-10">
            <motion.div
              initial={{ width: "0%" }}
              animate={{ width: "100%" }}
              transition={{ duration: 1.4, ease: "easeOut", delay: 0.4 }}
              className="absolute inset-y-0 left-0 bg-primary"
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
