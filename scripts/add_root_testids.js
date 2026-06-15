const { Project, SyntaxKind, Node, QuoteKind } = require("ts-morph");
const path = require("path");

const project = new Project({
  tsConfigFilePath: path.join(process.cwd(), "tsconfig.json"),
  skipAddingFilesFromTsConfig: true,
  manipulationSettings: { quoteKind: QuoteKind.Double },
});

project.addSourceFilesAtPaths("app/*.tsx");

const skipFiles = new Set(["Card.tsx", "Screen.tsx", "ThemeProvider.tsx"]);

function slugifyFile(fileName) {
  return fileName
    .replace(/\.tsx$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function resolveDefaultFunctionLike(sourceFile) {
  const symbol = sourceFile.getDefaultExportSymbol();
  const decl = symbol && symbol.getDeclarations()[0];

  if (decl == null) return null;

  if (
    Node.isFunctionDeclaration(decl) ||
    Node.isArrowFunction(decl) ||
    Node.isFunctionExpression(decl)
  ) {
    return decl;
  }

  if (Node.isVariableDeclaration(decl)) return decl.getInitializer();

  if (Node.isExportAssignment(decl)) {
    const expr = decl.getExpression();
    if (Node.isIdentifier(expr)) {
      const def = expr.getDefinitions()[0];
      const node = def && def.getDeclarationNode && def.getDeclarationNode();

      if (node == null) return null;

      if (
        Node.isFunctionDeclaration(node) ||
        Node.isArrowFunction(node) ||
        Node.isFunctionExpression(node)
      ) {
        return node;
      }

      if (Node.isVariableDeclaration(node)) return node.getInitializer();
    }
  }

  return null;
}

function getDirectReturns(fn) {
  const body = fn && fn.getBody && fn.getBody();
  if (body == null) return [];

  return body
    .getDescendantsOfKind(SyntaxKind.ReturnStatement)
    .filter((returnStmt) => {
      const funcAncestor = returnStmt.getFirstAncestor(
        (a) =>
          Node.isFunctionDeclaration(a) ||
          Node.isFunctionExpression(a) ||
          Node.isArrowFunction(a) ||
          Node.isMethodDeclaration(a)
      );

      return funcAncestor === fn;
    });
}

function getMeaningfulJsxRoot(node) {
  if (node == null) return null;

  if (Node.isParenthesizedExpression(node)) {
    return getMeaningfulJsxRoot(node.getExpression());
  }

  if (Node.isJsxElement(node) || Node.isJsxSelfClosingElement(node)) {
    return node;
  }

  if (Node.isJsxFragment(node)) {
    const firstJsxChild = node
      .getChildren()
      .find(
        (child) =>
          Node.isJsxElement(child) ||
          Node.isJsxSelfClosingElement(child) ||
          Node.isJsxFragment(child)
      );

    return getMeaningfulJsxRoot(firstJsxChild || null);
  }

  if (Node.isConditionalExpression(node)) {
    return (
      getMeaningfulJsxRoot(node.getWhenTrue()) ||
      getMeaningfulJsxRoot(node.getWhenFalse())
    );
  }

  return null;
}

for (const sourceFile of project.getSourceFiles()) {
  const base = path.basename(sourceFile.getFilePath());
  if (skipFiles.has(base)) continue;

  const fn = resolveDefaultFunctionLike(sourceFile);
  if (fn == null) continue;

  const returns = getDirectReturns(fn);
  const ret = returns[returns.length - 1];
  const expr = ret && ret.getExpression && ret.getExpression();
  const node = getMeaningfulJsxRoot(expr);
  if (node == null) continue;

  const rootId = `${slugifyFile(base)}-root`;

  if (Node.isJsxElement(node)) {
    const opening = node.getOpeningElement();
    const hasTestId = opening
      .getAttributes()
      .some(
        (attr) =>
          Node.isJsxAttribute(attr) &&
          attr.getNameNode &&
          attr.getNameNode().getText() === "testID"
      );

    if (!hasTestId) {
      opening.addAttribute({ name: "testID", initializer: `"${rootId}"` });
    }
  } else if (Node.isJsxSelfClosingElement(node)) {
    const hasTestId = node
      .getAttributes()
      .some(
        (attr) =>
          Node.isJsxAttribute(attr) &&
          attr.getNameNode &&
          attr.getNameNode().getText() === "testID"
      );

    if (!hasTestId) {
      node.addAttribute({ name: "testID", initializer: `"${rootId}"` });
    }
  }
}

project.saveSync();
