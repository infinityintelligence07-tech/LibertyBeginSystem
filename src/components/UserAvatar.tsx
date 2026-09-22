import { initials } from "@/lib/formatName";
import { cn } from "@/lib/utils";

interface UserAvatarProps {
  name: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

/** Unified avatar: shows photo when available, otherwise initials inside a primary-tinted circle. */
export const UserAvatar = ({ name, avatarUrl, size = 32, className }: UserAvatarProps) => {
  const dim = { width: size, height: size };
  if (avatarUrl) {
    return (
      <div
        style={dim}
        className={cn("rounded-full overflow-hidden border border-primary/20 shrink-0 bg-muted", className)}
      >
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
      </div>
    );
  }
  return (
    <div
      style={dim}
      className={cn(
        "rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center font-bold text-primary shrink-0",
        className,
      )}
    >
      <span style={{ fontSize: Math.max(9, Math.round(size * 0.32)) }}>{initials(name)}</span>
    </div>
  );
};
