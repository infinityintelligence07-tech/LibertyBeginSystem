import logoBegin from "@/assets/logo-begin.png";
import iconBegin from "@/assets/icon-begin.png";
import logoLiberty from "@/assets/logo-liberty.svg";

interface LogoProps {
  size?: "sm" | "md" | "lg";
  iconOnly?: boolean;
  className?: string;
  variant?: "begin" | "liberty";
}

export const Logo = ({ size = "md", iconOnly = false, className = "", variant = "begin" }: LogoProps) => {
  const logoSizes = { sm: "h-7", md: "h-9", lg: "h-14" };
  const iconSizes = { sm: "h-8 w-8", md: "h-10 w-10", lg: "h-16 w-16" };
  const textSizes = { sm: "text-lg", md: "text-2xl", lg: "text-4xl" };

  if (variant === "liberty") {
    if (iconOnly) {
      return <img src={logoLiberty} alt="Liberty" className={`${iconSizes[size]} object-contain ${className}`} />;
    }
    return <img src={logoLiberty} alt="Liberty" className={`${logoSizes[size]} object-contain ${className}`} />;
  }

  if (iconOnly) {
    return <img src={iconBegin} alt="Begin" className={`${iconSizes[size]} object-contain ${className}`} />;
  }

  return (
    <img src={logoBegin} alt="Begin by Liberty" className={`${logoSizes[size]} object-contain ${className}`} />
  );
};
