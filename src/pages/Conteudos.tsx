import { AppLayout } from "@/components/AppLayout";
import { Play, Video } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { EmptyState, ErrorState, LoadingState, PageContainer, PageHeader, SectionCard } from "@/components/ds";

const ConteudosPage = () => {
  const { data: contents = [], isLoading, isError, refetch } = useQuery({
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
      <PageContainer>
        <PageHeader title="Conteúdos" description="Gravações dos encontros online" />

        {isError && <ErrorState compact onRetry={() => refetch()} />}

        {isLoading ? (
          <LoadingState variant="cards" rows={4} />
        ) : contents.length > 0 ? (
          <ul className="grid grid-cols-1 md:grid-cols-2 gap-4 list-none m-0 p-0">
            {contents.map((video) => {
              const card = (
                <SectionCard as="article" interactive={Boolean(video.url)} padding="none" className="overflow-hidden h-full">
                  <div className="relative aspect-video bg-muted flex items-center justify-center">
                    <Video className="h-12 w-12 text-muted-foreground" aria-hidden />
                    {video.url && (
                      <div className="absolute bottom-3 right-3 h-11 w-11 rounded-full bg-primary flex items-center justify-center">
                        <Play className="h-5 w-5 text-primary-foreground ml-0.5" aria-hidden />
                      </div>
                    )}
                  </div>
                  <div className="p-4">
                    <h3 className="text-[15px] font-semibold text-foreground">{video.title}</h3>
                    {video.description && <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{video.description}</p>}
                  </div>
                </SectionCard>
              );
              return (
                <li key={video.id}>
                  {video.url ? (
                    <a
                      href={video.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block h-full rounded-ds-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background"
                      aria-label={`Assistir ${video.title}`}
                    >
                      {card}
                    </a>
                  ) : (
                    card
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <EmptyState
            icon={Video}
            title="Nenhum conteúdo disponível"
            description="Assim que novos vídeos forem publicados, eles aparecerão aqui."
          />
        )}
      </PageContainer>
    </AppLayout>
  );
};

export default ConteudosPage;
