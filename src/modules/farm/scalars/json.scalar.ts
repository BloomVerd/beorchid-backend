import { Scalar, CustomScalar } from '@nestjs/graphql';
import { Kind, ValueNode } from 'graphql';

/**
 * Custom GraphQL `JSON` scalar that passes arbitrary JSON values through
 * unchanged in serialization and parse paths. Inline object/array literals in
 * GraphQL queries are parsed from their AST kinds; string literals are
 * JSON-parsed if possible, otherwise returned as-is.
 *
 * Used for the `parameters` field on `IotToolCall` and similar open-ended
 * payload fields where the schema would otherwise require a rigid type.
 */
@Scalar('JSON', () => Object)
export class JsonScalar implements CustomScalar<unknown, unknown> {
  description = 'Arbitrary JSON scalar type';

  serialize(value: unknown): unknown {
    return value;
  }

  parseValue(value: unknown): unknown {
    return value;
  }

  parseLiteral(ast: ValueNode): unknown {
    switch (ast.kind) {
      case Kind.STRING:
        try {
          return JSON.parse(ast.value);
        } catch {
          return ast.value;
        }
      case Kind.INT:
        return parseInt(ast.value, 10);
      case Kind.FLOAT:
        return parseFloat(ast.value);
      case Kind.BOOLEAN:
        return ast.value;
      case Kind.NULL:
        return null;
      default:
        return null;
    }
  }
}
