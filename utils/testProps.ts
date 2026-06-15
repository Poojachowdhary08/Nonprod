type TestPropOptions = {
  accessibilityLabel?: string;
};

function toLabel(id: string) {
  return id.replace(/[-_]+/g, " ").trim();
}

export function testProps(testID: string, options: TestPropOptions = {}) {
  return {
    testID,
    accessibilityLabel: options.accessibilityLabel || toLabel(testID),
  };
}
