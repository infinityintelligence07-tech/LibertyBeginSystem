import { NavLink as RouterNavLink, NavLinkProps } from "react-router-dom";
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

interface NavLinkCompatProps extends Omit<NavLinkProps, "className"> {
  className?: string;
  /** Classes aplicadas somente quando a rota está ativa. */
  activeClassName?: string;
  /** Classes aplicadas somente quando a rota NÃO está ativa (ex.: hover neutro). */
  inactiveClassName?: string;
  pendingClassName?: string;
}

/**
 * Link de navegação com classes condicionais por estado. Usado na sidebar e no bottom-nav.
 * O react-router já adiciona `aria-current="page"` no item ativo.
 */
const NavLink = forwardRef<HTMLAnchorElement, NavLinkCompatProps>(
  ({ className, activeClassName, inactiveClassName, pendingClassName, to, ...props }, ref) => {
    return (
      <RouterNavLink
        ref={ref}
        to={to}
        className={({ isActive, isPending }) =>
          cn(className, isActive ? activeClassName : inactiveClassName, isPending && pendingClassName)
        }
        {...props}
      />
    );
  },
);

NavLink.displayName = "NavLink";

export { NavLink };
