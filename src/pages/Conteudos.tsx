import { motion } from "framer-motion";
import { AppLayout } from "@/components/AppLayout";
import { Play, Video, Loader2 } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { staggerContainer, fadeUpItem } from "@/lib/animations";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";

const ConteudosPage = () => {
  const { data: contents = [], isLoading } = useQuery({
    queryKey: ["contents-videos"],
    queryFn: async () => {
      const { data } = await supabase
        .from("contents")
        .select("*")
        .eq("content_type", "video")
        .eq("is_active", true)
        .order("created_at", { ascending: false });
      return data || [];
    },
  });

  return (
    <AppLayout role="liberty">
      <motion.div variants={staggerContainer} initial="hidden" animate="show" className="space-y-8">
        <motion.div variants={fadeUpItem}>
          <h1 className="text-2xl font-semibold text-foreground">Conteúdos</h1>
          <p className="text-muted-foreground text-sm">Gravações dos encontros online</p>
        </motion.div>

        {isLoading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : contents.length > 0 ? (
          <motion.div variants={staggerContainer} className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {contents.map((video) => (
              <motion.a
                key={video.id}
                variants={fadeUpItem}
                href={video.url || "#"}
                target={video.url ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="glass-card overflow-hidden group cursor-pointer"
              >
                <div className="relative aspect-video bg-surface-2 flex items-center justify-center">
                  <Video className="h-12 w-12 text-muted-foreground/30" />
                  <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-background/40">
                    <div className="w-14 h-14 rounded-full bg-primary flex items-center justify-center shadow-lg">
                      <Play className="h-6 w-6 text-primary-foreground ml-0.5" />
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  <h3 className="text-sm font-medium text-foreground mb-1">{video.title}</h3>
                  <p className="text-xs text-muted-foreground">{video.description || ""}</p>
                </div>
              </motion.a>
            ))}
          </motion.div>
        ) : (
          <EmptyState
            icon={Video}
            title="Nenhum conteúdo disponível"
            description="Assim que novos vídeos forem publicados, eles aparecerão aqui."
          />
        )}
      </motion.div>
    </AppLayout>
  );
};

export default ConteudosPage;
