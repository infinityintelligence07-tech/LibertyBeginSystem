import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { Construction } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  role?: "liberty" | "mentor" | "admin";
}

const PlaceholderPage = ({ title, role = "liberty" }: PlaceholderPageProps) => (
  <AppLayout role={role}>
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center min-h-[60vh] text-center"
    >
      <Construction className="h-12 w-12 text-primary/30 mb-4" />
      <h1 className="text-2xl font-semibold text-foreground mb-2">{title}</h1>
      <p className="text-muted-foreground text-sm">Em construção. Esta funcionalidade será implementada em breve.</p>
    </motion.div>
  </AppLayout>
);

export default PlaceholderPage;
