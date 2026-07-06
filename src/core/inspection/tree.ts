import type {
  GitDirectoryEntry,
  GitTreeEntry,
  GitTreeNode,
} from "#1mbdfxwwqqpa";

function toTreeNodeKind(entry: GitTreeEntry): "dir" | "file" {
  return entry.type === "tree" ? "dir" : "file";
}

function normalizeDirectoryEntry(entry: GitTreeEntry): GitDirectoryEntry {
  return {
    icon: entry.icon ?? null,
    kind: toTreeNodeKind(entry),
    language: entry.language ?? null,
    mode: entry.mode,
    name: entry.name,
    object: entry.object,
    path: entry.path,
    size: entry.size,
  };
}

function normalizeTreeNode(entry: GitTreeEntry): GitTreeNode {
  return {
    icon: entry.icon ?? null,
    kind: toTreeNodeKind(entry),
    language: entry.language ?? null,
    mode: entry.mode,
    name: entry.name,
    object: entry.object,
    path: entry.path,
    size: entry.size,
  };
}

type InternalTreeNode = Omit<GitTreeNode, "children"> & {
  child_map?: Map<string, InternalTreeNode>;
};

function ensureTreeDirectory(root: { child_map: Map<string, InternalTreeNode> }, parts: string[]): InternalTreeNode {
  let cursor: { child_map: Map<string, InternalTreeNode> } = root;
  let currentPath = "";
  for (const part of parts) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    if (!cursor.child_map.has(part)) {
      cursor.child_map.set(part, {
        child_map: new Map(),
        kind: "dir",
        icon: null,
        language: null,
        mode: "040000",
        name: part,
        object: "",
        path: currentPath,
        size: null,
      });
    }
    cursor = cursor.child_map.get(part) as InternalTreeNode & { child_map: Map<string, InternalTreeNode> };
  }
  return cursor as InternalTreeNode;
}

function toPublicTreeNode(node: InternalTreeNode): GitTreeNode {
  const { child_map: childMap, ...base } = node;
  if (node.kind !== "dir") return base;
  return {
    ...base,
    children: childMap ? sortTreeNodes({ child_map: childMap }) : [],
  };
}

function sortTreeNodes(node: { child_map: Map<string, InternalTreeNode> }): GitTreeNode[] {
  const values = Array.from(node.child_map.values());
  values.sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "dir" ? -1 : 1;
    return left.name.localeCompare(right.name);
  });
  return values.map(toPublicTreeNode);
}

function nestTreeEntries(entries: GitTreeEntry[]): GitTreeNode[] {
  const root = { child_map: new Map<string, InternalTreeNode>() };
  for (const entry of entries) {
    const parts = entry.path.split("/").filter(Boolean);
    if (!parts.length) continue;
    const parent = ensureTreeDirectory(root, parts.slice(0, -1));
    const node = normalizeTreeNode(entry);
    if (node.kind === "dir") {
      const dirNode = ensureTreeDirectory(root, parts);
      dirNode.icon = node.icon ?? dirNode.icon ?? null;
      dirNode.language = node.language ?? dirNode.language ?? null;
      dirNode.mode = node.mode || dirNode.mode;
      dirNode.object = node.object || dirNode.object;
      continue;
    }
    (parent.child_map as Map<string, InternalTreeNode>).set(node.name, node);
  }
  return sortTreeNodes(root);
}

function formatTreeAscii(nodes: GitTreeNode[], prefix = ""): string {
  const lines: string[] = [];
  for (let index = 0; index < nodes.length; index += 1) {
    const node = nodes[index];
    const isLast = index === nodes.length - 1;
    const branch = isLast ? "└── " : "├── ";
    const nextPrefix = prefix + (isLast ? "    " : "│   ");
    lines.push(`${prefix}${branch}${node.name}`);
    if (node.kind === "dir" && Array.isArray(node.children) && node.children.length) {
      lines.push(formatTreeAscii(node.children, nextPrefix));
    }
  }
  return lines.filter(Boolean).join("\n");
}

export {
  formatTreeAscii,
  nestTreeEntries,
  normalizeDirectoryEntry,
};
