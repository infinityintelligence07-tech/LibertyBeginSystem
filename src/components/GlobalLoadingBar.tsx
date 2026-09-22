import { useIsFetching, useIsMutating } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Barra fininha no topo que aparece sempre que há qualquer fetch/mutation
 * do React Query em andamento. Dá a sensação de fluidez / progresso.
 */
export const GlobalLoadingBar = () => {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const active = fetching + mutating > 0;

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key="global-loading-bar"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-[100] h-[2px] overflow-hidden pointer-events-none"
          aria-hidden
        >
          <motion.div
            className="h-full w-1/3 bg-gradient-to-r from-transparent via-primary to-transparent"
            initial={{ x: "-100%" }}
            animate={{ x: "300%" }}
            transition={{ duration: 1.1, ease: "easeInOut", repeat: Infinity }}
          />
        </motion.div>
      )}
    </AnimatePresence>
  );
};
