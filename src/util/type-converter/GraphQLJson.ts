import { GraphQLScalarType, Kind } from "graphql";

export const GraphQLJson = new GraphQLScalarType({
  name: "JSON",
  description: "The JSON scalar type represents JSON values as scalars.",
  serialize(value) {
    return value;
  },
  parseValue(value) {
    return value;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      try {
        return JSON.parse(ast.value);
      } catch {
        try {
          const trimmed = ast.value.trim();
          if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
            return JSON.parse(trimmed);
          }
          if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
            return JSON.parse(trimmed);
          }
        } catch {}
        return ast.value;
      }
    }
    return null;
  },
});
