import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { it, expect } from 'vitest';
function files(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? files(path.join(dir, entry.name))
      : entry.name.endsWith('.tsx')
        ? [path.join(dir, entry.name)]
        : [],
  );
}
it('keeps JSX interface copy and accessible labels in the translation system', () => {
  const violations: string[] = [];
  for (const file of [...files('src/app'), ...files('src/components')]) {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node: ts.Node) {
      if (ts.isJsxText(node) && /[A-Za-zÀ-ÿ]/.test(node.text))
        violations.push(`${file}: ${node.text.trim()}`);
      if (
        ts.isJsxAttribute(node) &&
        ['placeholder', 'title', 'aria-label', 'alt'].includes(node.name.getText(source)) &&
        node.initializer &&
        ts.isStringLiteral(node.initializer) &&
        /[A-Za-zÀ-ÿ]/.test(node.initializer.text)
      )
        violations.push(`${file}: ${node.initializer.text}`);
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  expect(violations).toEqual([]);
});
