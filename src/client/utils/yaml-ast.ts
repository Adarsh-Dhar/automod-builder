export function validateYaml(yaml: string): { valid: boolean; error?: string } {
  // Lightweight validation: ensure YAML is not obviously malformed.
  if (!yaml || !yaml.trim()) return { valid: true };

  // Basic check: ensure there are no unbalanced code fences
  const fences = (yaml.match(/```/g) || []).length;
  if (fences % 2 !== 0) return { valid: false, error: 'Unbalanced code fences detected' };

  // Could add a real YAML parser here; for now assume valid
  return { valid: true };
}

export function astToYaml(ast: any): string {
  if (!ast) return '';
  try {
    // If AST looks like an array of rules, attempt a simple YAML-like serialization.
    if (Array.isArray(ast)) {
      return ast
        .map((r: any) => {
          try {
            const name = r?.name ?? r?.id ?? 'rule';
            const conditions = Array.isArray(r?.conditions)
              ? r.conditions.map((c: any) => `    - ${c.type ?? c.key ?? JSON.stringify(c)}`).join('\n')
              : '';
            return `- name: ${name}\n  ${conditions ? `conditions:\n${conditions}` : ''}`;
          } catch (e) {
            return `- ${JSON.stringify(r)}`;
          }
        })
        .join('\n');
    }

    // Fallback: JSON stringify
    return JSON.stringify(ast, null, 2);
  } catch (e) {
    return '';
  }
}
