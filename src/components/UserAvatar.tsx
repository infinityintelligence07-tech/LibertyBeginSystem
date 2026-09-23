import { initials } from "@/lib/formatName";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

/** Avatar: foto quando houver; senão iniciais em círculo neutro (sem tint de marca). */
export const UserAvatar = ({ name, avatarUrl, size = 32, className }: UserAvatarProps) => {
  const dim = { width: size, height: size };
  if (avatarUrl) {
    return (
      <div
        style={dim}
        className={cn("rounded-full overflow-hidden border border-border shrink-0 bg-muted", className)}
      >
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div
      style={dim}
      className={cn(
        "rounded-full bg-muted border border-border flex items-center justify-center font-semibold text-muted-foreground shrink-0",
        className,
      )}
    >
      <span style={{ fontSize: Math.max(10, Math.round(size * 0.32)) }}>{initials(name)}</span>
    </div>
  );
};
