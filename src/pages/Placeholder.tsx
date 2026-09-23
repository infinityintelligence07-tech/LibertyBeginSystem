import { Construction } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState, PageContainer, PageHeader } from "@/components/ds";

interface PlaceholderPageProps {
  title: string;
  role?: "liberty" | "mentor" | "admin";
}

const PlaceholderPage = ({ title, role = "liberty" }: PlaceholderPageProps) => (
  <AppLayout role={role}>
    <PageContainer>
      <PageHeader title={title} />
      <EmptyState
        icon={Construction}
        title="Em construção"
        description="Esta funcionalidade será liberada em breve."
      />
    </PageContainer>
  </AppLayout>
);

export default PlaceholderPage;
