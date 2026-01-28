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
    if (ast.kind !== Kind.STRING) return null;

    try {
      return JSON.parse(ast.value);
    } catch {
      return ast.value;
    }
  },
});
