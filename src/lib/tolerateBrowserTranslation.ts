const isTranslatorDomError = (error: unknown) => {
  if (error instanceof DOMException && (error.name === "NotFoundError" || error.name === "HierarchyRequestError")) {
    return true;
  }
  const message = error instanceof Error ? error.message : "";
  return /not a child|não é filho|The node before which/i.test(message);
};

/**
 * O tradutor do navegador envolve o texto em nós próprios (`<font>`).
 * No próximo render o React tenta mover o nó original e o DOM lança
 * NotFoundError, derrubando a página inteira. Aqui esses dois casos
 * são absorvidos; qualquer outro erro continua subindo.
 */
export const tolerateBrowserTranslation = () => {
  if (typeof window === "undefined" || typeof Node !== "function") return;

  const rawRemove = Node.prototype.removeChild;
  Node.prototype.removeChild = function removeChild<T extends Node>(this: Node, child: T): T {
    try {
      return rawRemove.call(this, child) as T;
    } catch (error) {
      if (isTranslatorDomError(error) && child.parentNode !== this) return child;
      throw error;
    }
  };

  const rawInsert = Node.prototype.insertBefore;
  Node.prototype.insertBefore = function insertBefore<T extends Node>(
    this: Node,
    node: T,
    child: Node | null,
  ): T {
    try {
      return rawInsert.call(this, node, child) as T;
    } catch (error) {
      if (isTranslatorDomError(error) && (!child || child.parentNode !== this)) return node;
      throw error;
    }
  };
};
