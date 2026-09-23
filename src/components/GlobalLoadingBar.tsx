import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";

/**
 * Barra fina no topo que aparece enquanto há fetch/mutation do React Query em andamento.
 * Com `prefers-reduced-motion`, mostra uma barra estática em vez do deslocamento contínuo.
 */
export const GlobalLoadingBar = () => {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const reduceMotion = useReducedMotion();
  const active = fetching + mutating > 0;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="global-loading-bar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed top-0 left-0 right-0 z-[100] h-0.5 overflow-hidden pointer-events-none"
          aria-hidden
        >
          {reduceMotion ? (
            <div className="h-full w-full bg-primary/60" />
          ) : (
            <motion.div
              className="h-full w-1/3 bg-primary"
              initial={{ x: "-100%" }}
              animate={{ x: "300%" }}
              transition={{ duration: 1.1, ease: "easeInOut", repeat: Infinity }}
            />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};
