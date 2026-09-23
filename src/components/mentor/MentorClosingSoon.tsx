import { Flag } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { shortName } from "@/lib/formatName";
import { ListRow, SectionCard, SectionHeader, StatusPill } from "@/components/ds";

export interface ClosingStudent {
  id: string;
  full_name: string;
  daysLeft: number;
  endDateLabel: string;
}

interface Props {
  students: ClosingStudent[];
}

const daysLabel = (d: number) => (d <= 0 ? "Hoje" : d === 1 ? "Amanhã" : `${d} dias`);

export const MentorClosingSoon = ({ students }: Props) => {
  const navigate = useNavigate();
  if (students.length === 0) return null;

  return (
    <section className="space-y-3">
      <SectionHeader
        title="Encerramentos próximos"
        description="Jornadas que terminam nos próximos 30 dias"
      />
      <SectionCard padding="none">
        {students.map((s, idx) => (
          <ListRow
            key={s.id}
            last={idx === students.length - 1}
            leading={<Flag className="h-5 w-5 text-muted-foreground shrink-0" aria-hidden />}
            title={shortName(s.full_name)}
            subtitle={`Encerra em ${s.endDateLabel}`}
            trailing={
              <StatusPill tone={s.daysLeft <= 7 ? "warning" : "neutral"} withDot={false}>
                {daysLabel(s.daysLeft)}
              </StatusPill>
            }
            onPress={() => navigate(`/mentor/alunos/${s.id}`)}
          />
        ))}
      </SectionCard>
    </section>
  );
};
