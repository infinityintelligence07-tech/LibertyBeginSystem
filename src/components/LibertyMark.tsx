import iconLiberty from "@/assets/icon-liberty.png";
import { cn } from "@/lib/utils";

interface LibertyMarkProps {
  className?: string;
  size?: number;
  /** Show "Liberty" label next to the lion icon */
  withLabel?: boolean;
}

/**
 * Official Liberty mark — the gold lion icon.
 * Replaces the sparkle symbol that was previously used as the Liberty signifier.
 */
export const LibertyMark = ({ className, size = 14, withLabel = false }: LibertyMarkProps) => {
  return (
    <span className={cn("inline-flex items-center gap-1.5 align-middle", className)}>
      <img
        src={iconLiberty}
        alt="Liberty"
        width={size}
        height={size}
        className="object-contain shrink-0"
        style={{ width: size, height: size }}
        draggable={false}
      />
      {withLabel && <span className="font-semibold tracking-wide">Liberty</span>}
    </span>
  );
};
